import asyncio
import libtorrent as lt
import os
import shutil
from pathlib import Path
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import math

from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Depends, HTTPException, Request, status, UploadFile, File, Form
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse

from authlib.integrations.starlette_client import OAuth
from jose import JWTError, jwt

from base.models import Base, engine, SessionLocal, Session, User, SubscriptionLevel, FileRecord
from base.seed import seed_data

# --- КОНФИГУРАЦИЯ ---
from config.init import *




os.makedirs(DOWNLOAD_DIR, exist_ok=True)

app = FastAPI(title="Torrent Pro API")

oauth = OAuth()
oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

# --- MIDDLEWARES ---
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # ЭТОТ ПАРАМЕТР ОБЯЗАТЕЛЕН ДЛЯ ЧТЕНИЯ ИМЕНИ ФАЙЛА В JS
    expose_headers=["Content-Disposition", "Content-Length"]
)

# --- GLOBALS ---
if os.path.exists(RESUME_DATA_FILE):
    try:
        with open(RESUME_DATA_FILE, "rb") as f:
            data = f.read()
            if data:
                ses.load_resume_data(data)
                print("Progress loaded from disk.")
    except Exception as e:
        print(f"Failed to load resume data: {e}")

def save_session_data():
    try:
        data = ses.save_resume_data()
        with open(RESUME_DATA_FILE, "wb") as f:
            f.write(data)
        print("Session saved.")
    except Exception as e:
        print(f"Failed to save session: {e}")

ses = lt.session()

active_downloads: Dict[str, Dict[str, Any]] = {}

# --- DEPENDENCIES ---

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        user = db.query(User).filter(User.email == email).first()
        is_admin_user = email in ADMIN_EMAILS

        if user and email in ADMIN_EMAILS and not user.is_admin:
            user.is_admin = True
            db.commit()
            db.refresh(user)

        elif not user:
            default_sub = db.query(SubscriptionLevel).first() 
            user = User(email=email,is_admin=is_admin_user, subscription_id=default_sub.id if default_sub else None) 
            db.add(user)
            db.commit()
            db.refresh(user)
            #raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def admin_required(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user

# --- TORRENT LOGIC ---

async def resume_downloads_on_startup(db_factory):
    """
    При старте сервера: ищем в БД торренты, которые не завершены, и запускаем их.
    """
    db = db_factory()
    try:
        # Ищем торренты, которые не помечены как 'counted' (завершенные)
        incomplete_torrents = db.query(FileRecord).filter(
            FileRecord.torrent_hash.isnot(None),
            FileRecord.metadata_json["counted"] == False
        ).all()

        for rec in incomplete_torrents:
            logger.info(f"Resuming torrent: {rec.metadata_json.get('name')}")
            
            params = lt.add_torrent_params()
            params.save_path = DOWNLOAD_DIR
            
            if rec.magnet_uri:
                params = lt.parse_magnet_uri(rec.magnet_uri)
                params.save_path = DOWNLOAD_DIR
                handle = ses.add_torrent(params)
                # Ждем метаданные
                for _ in range(30):
                    if handle.has_metadata(): break
                    await asyncio.sleep(1)
            else:
                # Если нет magnet, пробуем восстановить через хеш (нужен файл .torrent или resume_data)
                # В идеале всегда сохраняйте magnet_uri в БД
                continue

            if handle.has_metadata():
                info_hash = str(handle.info_hash())
                if info_hash not in active_downloads:
                    task = asyncio.create_task(torrent_monitor(handle, db_factory, rec.user.email))
                    active_downloads[info_hash] = task
    finally:
        db.close()


async def torrent_monitor(handle, db_factory, user_email: str):
    info_hash = str(handle.info_hash())
    db = db_factory()
    try:
        while True:
            try:
                s = handle.status()
            except: 
                break

            # Ищем ВСЕ записи в БД с этим хешем (для всех пользователей)
            all_records = db.query(FileRecord).filter(FileRecord.torrent_hash == info_hash).all()
            
            if all_records:
                for file_rec in all_records:
                    new_metadata = dict(file_rec.metadata_json)
                    new_metadata.update({
                        "name": str(s.name), # Безопасное приведение к строке
                        "progress": round(s.progress * 100, 2),
                        "download_rate_kb": round(s.download_rate / 1024, 2),
                        "upload_rate_kb": round(s.upload_rate / 1024, 2),
                        "peers": s.num_peers,
                        "state": str(s.state),
                        "downloaded_bytes": s.total_wanted_done,
                        "total_bytes": s.total_wanted,
                    })
                    file_rec.metadata_json = new_metadata
                    
                    # Логика начисления статистики (только для владельца или по логике вашего приложения)
                    if (s.is_seeding or s.progress >= 0.999) and not new_metadata.get("counted"):
                        # Здесь можно добавить проверку: если это файл, который мы "учитываем"
                        # (например, если он был добавлен как новый, а не общий)
                        pass 

                db.commit()

            # Если торрент полностью завершен (seeding)
            if s.is_seeding or s.progress >= 0.999:
                # Начисляем статистику только тому, кто его "завладел" (опционально)
                # Чтобы не дублировать статистику, лучше проверять counted по каждой записи отдельно
                for rec in all_records:
                    if not rec.metadata_json.get("counted"):
                        user = db.query(User).filter(User.id == rec.user_id).first()
                        if user:
                            size_mb = rec.metadata_json.get("size_mb", 0)
                            user.downloaded_files_count += 1
                            user.total_downloaded_mb += size_mb
                            
                            meta = dict(rec.metadata_json)
                            meta["counted"] = True
                            rec.metadata_json = meta
                db.commit()
                
                if s.is_seeding: break 

            await asyncio.sleep(3)
    except Exception as e:
        logger.error(f"Monitor error [{info_hash}]: {e}")
    finally:
        db.close()

async def old_torrent_monitor(handle, db_factory, user_email: str):
    """
    Циклический монитор: обновляет прогресс и состояние в БД.
    """
    info_hash = str(handle.info_hash())
    db = db_factory()
    try:
        while True:
            try:
                s = handle.status()
            except: 
                break

            # 1. Обновляем данные в БД
            file_rec = db.query(FileRecord).filter(FileRecord.torrent_hash == info_hash).first()
            if file_rec:
                # Обновляем JSON с актуальным прогрессом
                new_metadata = dict(file_rec.metadata_json)
                new_metadata.update({
                    "name": s.name,
                    "progress": round(s.progress * 100, 2),
                    "download_rate_kb": round(s.download_rate / 1024, 2),
                    "upload_rate_kb": round(s.upload_rate / 1024, 2),
                    "peers": s.num_peers,
                    "state": str(s.state),
                    "downloaded_bytes": s.total_wanted_done,
                    "total_bytes": s.total_wanted,
                })
                file_rec.metadata_json = new_metadata
                db.commit()

            # 2. Если торрент докачан (Seeding) - начисляем статистику
            if s.is_seeding or s.progress >= 0.999:
                user = db.query(User).filter(User.email == user_email).first()
                if user and file_rec and not file_rec.metadata_json.get("counted"):
                    size_mb = file_rec.metadata_json.get("size_mb", 0)
                    user.downloaded_files_count += 1
                    user.total_downloaded_mb += size_mb
                    
                    # Помечаем, что файл учтен
                    meta = dict(file_rec.metadata_json)
                    meta["counted"] = True
                    file_rec.metadata_json = meta
                    db.commit()
                
                if s.is_seeding: break # Выходим из мониторинга, если только сидим

            await asyncio.sleep(3)
    except Exception as e:
        logger.error(f"Monitor error [{info_hash}]: {e}")
    finally:
        db.close()

# --- ENDPOINTS ---

@app.on_event("startup")
async def startup_event():
    print("Application is starting up...")
    seed_data()  # <--- Запускаем наполнение базы
    print("Application is ready!")
    asyncio.create_task(resume_downloads_on_startup(SessionLocal))

@app.on_event("shutdown")
async def shutdown_event():
    save_session_data()

@app.get("/auth/login")
async def login(request: Request):
    callback = str(request.url_for('auth_callback').replace(scheme='https')).replace('secommu.com/','secommu.com/api/')
    print(callback)
    return await oauth.google.authorize_redirect(request, callback)



@app.get("/auth/callback")
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    user_info = token.get('userinfo')
    if not user_info:
        raise HTTPException(status_code=400, detail="Failed to get user info")

    user = db.query(User).filter(User.email == user_info['email']).first()
    
    if not user:
        # Создаем нового пользователя
        default_sub = db.query(SubscriptionLevel).first() 
        user = User(
            email=user_info['email'],
            profile_image_url=user_info.get('picture'), # Сохраняем сразу
            subscription_id=default_sub.id if default_sub else None
        )
        db.add(user)
    else:
        # Если пользователь уже есть, обновляем только аватар (если он изменился)
        if user_info.get('picture') and user.profile_image_url != user_info['picture']:
            user.profile_image_url = user_info['picture']
            db.commit()

    access_token = create_access_token(data={"sub": user_info['email']})

    response = RedirectResponse(url='/api/status-check')
    response.set_cookie(key="access_token", value=access_token, httponly=True, samesite="lax", 
        secure=True)
    return response

@app.get("/status-check")
async def status_check(request: Request, user: User = Depends(get_current_user)):
    accept_header = request.headers.get("accept", "")
    data = {
        "email": user.email,
        "is_admin": user.is_admin,
        "downloads_count": user.downloaded_files_count,
        "total_mb": round(user.total_downloaded_mb, 2),
        "subscription": user.subscription.name if user.subscription else "None",
        "avatar": user.profile_image_url
    }
    if "application/json" in accept_header:
        return JSONResponse(content=data)
    return RedirectResponse(url="http://secommu.com/")

@app.post("/torrent/file")
async def add_torrent_file(
    file: UploadFile = File(...), 
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Проверка лимита торрентов
    if user.subscription and len(active_downloads) >= user.subscription.torrent_limit:
        raise HTTPException(status_code=403, detail="Torrent limit reached")

    temp_path = f"temp_{file.filename}"
    try:
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
        
        info = lt.torrent_info(temp_path)
        
        # --- ИСПРАВЛЕНИЕ "Unknown" ---
        # Извлекаем имя торрента (это имя папки или файла внутри)
        torrent_name = info.name()
        
        # 2. Извлекаем размер (число)
        # Проверяем: если total_size это метод, вызываем его. Если нет - берем как есть.
        if callable(info.total_size):
            size_bytes = info.total_size()
        else:
            size_bytes = info.total_size

        # Конвертируем в МБ (число)
        size_mb = size_bytes / (1024 * 1024)

        # 3. Формируем чистый словарь (только строки и числа)
        metadata = {
            "type": "torrent", 
            "size_mb": float(size_mb), # Явно приводим к float
            "name": str(torrent_name)  # Явно приводим к str
        }
        # ----------------------------------------------

        # Далее ваш код...
        params = lt.add_torrent_params()
        params.save_path = os.path.abspath(DOWNLOAD_DIR)
        params.ti = info

        handle = ses.add_torrent(params)
        info_hash = str(handle.info_hash())

        # Теперь используем подготовленный metadata
        existing_file = db.query(FileRecord).filter(FileRecord.torrent_hash == info_hash).first()
        
        if existing_file:
            if existing_file.user_id == user.id:
                return {"status": "already_exists", "hash": info_hash}
            else:
                # Создаем расширенную метадату, чтобы монитор сразу видел структуру
                extended_metadata = metadata.copy()
                extended_metadata.update({
                    "progress": 0,
                    "state": "idle",
                    "download_rate_kb": 0,
                    "upload_rate_kb": 0,
                    "peers": 0,
                    "counted": False
                })
                
                new_user_file = FileRecord(
                    token_name=f"u{user.id}_{info_hash[:8]}",
                    storage_path=DOWNLOAD_DIR,
                    user_id=user.id,
                    metadata_json=extended_metadata, # Используем расширенную метадату
                    download_url=f"/torrent/download/{info_hash}",
                    torrent_hash=info_hash
                )
                db.add(new_user_file)
                db.commit()
                
                # Важно: если файл уже качается/раздается, монитор уже запущен.
                # Если нет - запускаем.
                if info_hash not in active_downloads:
                    asyncio.create_task(torrent_monitor(handle, SessionLocal, user.email))

                return {"status": "shared_from_library", "hash": info_hash}

        # --- ЕСЛИ ФАЙЛА НЕТ ВООБЩЕ (НОВЫЙ) ---
        new_file = FileRecord(
            token_name=f"u{user.id}_{info_hash[:8]}",
            storage_path=DOWNLOAD_DIR,
            user_id=user.id,
            metadata_json=metadata, # Используем подготовленные метаданные
            download_url=f"/torrent/download/{info_hash}",
            torrent_hash=info_hash
        )
        db.add(new_file)
        db.commit()

        if info_hash not in active_downloads:
            asyncio.create_task(torrent_monitor(handle, SessionLocal, user.email))
        
        return {"status": "started", "hash": info_hash, "added_by": user.email}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process torrent file: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/old/torrent/file")
async def old_add_torrent_file(
    file: UploadFile = File(...), 
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Проверка лимита торрентов
    if user.subscription and len(active_downloads) >= user.subscription.torrent_limit:
        raise HTTPException(status_code=403, detail="Torrent limit reached")

    temp_path = f"temp_{file.filename}"
    try:
        content = await file.read()
        with open(temp_path, "wb") as f:
            f.write(content)
        
        info = lt.torrent_info(temp_path)
        
        if callable(info.total_size):
            total_size_bytes = info.total_size()
        else:
            total_size_bytes = info.total_size

        params = lt.add_torrent_params()
        params.save_path = os.path.abspath(DOWNLOAD_DIR)
        params.ti = info

        # Добавляем в сессию libtorrent (чтобы он начал раздавать/качать)
        handle = ses.add_torrent(params)
        info_hash = str(handle.info_hash())

        # 3. РЕАЛИЗАЦИЯ ТВОЕЙ ЛОГИКИ:
        # Ищем файл в базе по хешу
        existing_file = db.query(FileRecord).filter(FileRecord.torrent_hash == info_hash).first()
        
        if existing_file:
            # ПРОВЕРКА: Этот файл уже принадлежит этому пользователю?
            if existing_file.user_id == user.id:
                return {
                    "status": "already_exists", 
                    "hash": info_hash, 
                    "message": "Torrent is already in your library"
                }
            else:
                # ФАЙЛ ЕСТЬ, НО У ДРУГОГО ПОЛЬЗОВАТЕЛЯ.
                # Создаем "ссылку" на этот файл для текущего пользователя.
                new_user_file = FileRecord(
                    token_name=f"user_{user.id}_torrent_{info_hash[:8]}",
                    storage_path=DOWNLOAD_DIR,
                    user_id=user.id,  # Привязываем к текущему юзеру!
                    metadata_json={
                        "type": "torrent", 
                        "size_mb": total_size_bytes / (1024 * 1024)
                    },
                    download_url=f"/torrent/download/{info_hash}",
                    torrent_hash=info_hash
                )
                db.add(new_user_file)
                db.commit()
                
                # Запускаем монитор, если этот хеш еще не обрабатывается
                if info_hash not in active_downloads:
                    asyncio.create_task(torrent_monitor(handle, SessionLocal, user.email))

                return {
                    "status": "shared_from_library", 
                    "hash": info_hash, 
                    "message": "File added to your library from global storage"
                }

        # --- ЕСЛИ ФАЙЛА НЕТ ВООБЩЕ (НОВЫЙ) ---
        new_file = FileRecord(
            token_name=f"user_{user.id}_torrent_{info_hash[:8]}",
            storage_path=DOWNLOAD_DIR,
            user_id=user.id,
            metadata_json={
                "type": "torrent", 
                "size_mb": total_size_bytes / (1024 * 1024)
            },
            download_url=f"/torrent/download/{info_hash}",
            torrent_hash=info_hash
        )
        db.add(new_file)
        db.commit()

        if info_hash not in active_downloads:
            asyncio.create_task(torrent_monitor(handle, SessionLocal, user.email))
        
        return {"status": "started", "hash": info_hash, "added_by": user.email}

    except Exception as e:
        # ... (оставь свой traceback)
        raise HTTPException(status_code=500, detail=f"Failed to process torrent file: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/torrent/magnet")
async def add_magnet(
    magnet: str = Form(...), 
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Проверка лимитов по подписке
    current_count = db.query(FileRecord).filter(FileRecord.user_id == user.id).count()
    if user.subscription and current_count >= user.subscription.torrent_limit:
        raise HTTPException(status_code=403, detail="Torrent limit reached")

    params = lt.parse_magnet_uri(magnet)
    params.save_path = os.path.abspath(DOWNLOAD_DIR)
    handle = ses.add_torrent(params)

    # 2. Ожидание метаданных
    for _ in range(60):
        if handle.has_metadata(): break
        await asyncio.sleep(1)
    else:
        ses.remove_torrent(handle)
        raise HTTPException(status_code=408, detail="Metadata timeout")

    info = handle.get_torrent_info()
    info_hash = str(handle.info_hash())
    
    # 3. Регистрация в БД
    if db.query(FileRecord).filter(FileRecord.torrent_hash == info_hash).first():
        return {"status": "already_exists", "hash": info_hash}

    new_file = FileRecord(
        user_id=user.id,
        token_name=f"user_{user.id}_torrent_{info_hash[:8]}",
        storage_path=DOWNLOAD_DIR,
        magnet_uri=magnet, # Сохраняем для авто-рестарта
        torrent_hash=info_hash,
        download_url=f"/torrent/download/{info_hash}",
        metadata_json={
            "type": "torrent",
            "name": info.name,
            "size_mb": info.total_size() / (1024 * 1024),
            "progress": 0,
            "counted": False
        }
    )
    db.add(new_file)
    db.commit()

    # 4. Запуск монитора
    task = asyncio.create_task(torrent_monitor(handle, SessionLocal, user.email))
    active_downloads[info_hash] = task

    return {"status": "started", "hash": info_hash}


@app.delete("/torrent/delete/{torrent_hash}")
async def delete_torrent(
    torrent_hash: str, 
    user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    Удаляет торрент из библиотеки текущего пользователя, корректирует статистику
    и удаляет файл с диска, если он больше не используется никем другим.
    """
    # 1. Ищем запись, принадлежащую именно этому пользователю
    file_to_delete = db.query(FileRecord).filter(
        FileRecord.torrent_hash == torrent_hash,
        FileRecord.user_id == user.id
    ).first()

    if not file_to_delete:
        raise HTTPException(
            status_code=404, 
            detail="Torrent not found in your library"
        )

    # Сохраняем метаданные до удаления записи из БД
    metadata = file_to_delete.metadata_json
    if isinstance(metadata, str):
        import json
        metadata = json.loads(metadata)

    try:
        # 2. Логика корректировки статистики пользователя
        if metadata and metadata.get("counted") is True:
            size_mb = metadata.get("size_mb", 0)
            
            if user.downloaded_files_count > 0:
                user.downloaded_files_count -= 1
            
            if user.total_downloaded_mb > size_mb:
                user.total_downloaded_mb -= size_mb
            else:
                user.total_downloaded_mb = 0.0
            
            logger.info(f"Adjusted stats for user {user.email} due to file deletion.")

        # 3. Удаляем запись из БД
        db.delete(file_to_delete)
        db.commit()
        
        # 4. Проверка: нужен ли файл кому-то еще?
        # Ищем любые другие записи в БД с этим же хешем
        remaining_records = db.query(FileRecord).filter(FileRecord.torrent_hash == torrent_hash).first()

        if not remaining_records:
            # Если записей больше нет, удаляем физический файл
            file_name = metadata.get("name")
            if file_name:
                # Формируем путь (используем os.path.join для безопасности)
                file_path = os.path.join(DOWNLOAD_DIR, file_name)
                
                try:
                    if os.path.exists(file_path):
                        if os.path.isdir(file_path):
                            shutil.rmtree(file_path)  # Если это папка
                        else:
                            os.remove(file_path)     # Если это файл
                        logger.info(f"Physical file deleted: {file_path}")
                except Exception as e:
                    # Мы не прерываем запрос пользователю, если не смогли удалить файл, 
                    # но логируем это как ошибку системы
                    logger.error(f"Failed to delete physical file {file_path}: {e}")

        logger.info(f"User {user.email} removed torrent {torrent_hash} from their library.")
        return {"status": "success", "message": "Torrent removed from your library and stats updated"}
    
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting torrent: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete torrent")

@app.get("/torrent/download/{torrent_hash}")
async def download_file(torrent_hash: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        # 1. Поиск записи в БД
        file_record = db.query(FileRecord).filter(FileRecord.torrent_hash == torrent_hash).first()
        if not file_record:
            logger.warning(f"File not found in DB: {torrent_hash}")
            raise HTTPException(status_code=404, detail="File record not found")

        # 2. Безопасное извлечение размера файла
        # Проверяем, что metadata_json существует и является словарем
        metadata = file_record.metadata_json
        if isinstance(metadata, str):
            import json
            try:
                metadata = json.loads(metadata)
            except:
                metadata = {}
        
        if not isinstance(metadata, dict):
            metadata = {}

        file_size_mb = metadata.get("size_mb", 0)

        # 3. Проверка лимитов (защита от None)
        current_downloaded = user.total_downloaded_mb or 0
        limit = user.subscription.mb_limit if user.subscription else 0
        
        if current_downloaded + file_size_mb > limit:
            logger.info(f"User {user.id} exceeded limit")
            raise HTTPException(status_code=403, detail="Subscription MB limit exceeded")

        # 4. Проверка физического пути
        # Убедитесь, что DOWNLOAD_DIR определен глобально
        actual_path = os.path.abspath(os.path.join(DOWNLOAD_DIR, metadata.get("name","Unknown")))
        
        logger.info(f"Attempting to serve file: {actual_path}")

        if not os.path.exists(actual_path):
            logger.error(f"File does not exist on disk: {actual_path}")
            raise HTTPException(status_code=404, detail="Physical file not found")
        
        if not os.path.isfile(actual_path):
            logger.error(f"Path is not a file: {actual_path}")
            raise HTTPException(status_code=400, detail="Path is not a valid file")

        # 5. Возврат файла
        return FileResponse(
            path=actual_path, 
            filename=metadata.get("name","Unknown"),
            media_type='application/octet-stream' # Явно указываем тип для скачивания
        )

    except HTTPException as he:
        # Пробрасываем ошибки HTTP (404, 403) дальше без изменения
        raise he
    except Exception as e:
        # Логируем реальную ошибку Python в консоль сервера!
        logger.error(f"CRITICAL ERROR during download: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.get("/torrent/all")
async def get_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Теперь данные берутся ТОЛЬКО из БД. Это гарантирует актуальность.
    """
    user_files = db.query(FileRecord).filter(FileRecord.user_id == user.id).all()
    
    files_list = []
    for f in user_files:
        # Берем состояние из JSON поля в БД
        meta = f.metadata_json or {}
        files_list.append({
            "name": meta.get("name", "Unknown"),
            "torrent_hash": f.torrent_hash,
            "size_mb": meta.get("size_mb", 0),
            "status": {
                "state": meta.get("state", "idle"),
                "progress": meta.get("progress", 0),
                "download_rate_kb": meta.get("download_rate_kb", 0),
                "peers": meta.get("peers", 0)
            }
        })

    return {
        "user_email": user.email, 
        "my_files": files_list
    }

# --- ADMIN ENDPOINTS ---

@app.post("/admin/set/levels")
async def add_level(
    name: str = Form(...), 
    mb_limit: float = Form(...), 
    torrent_limit: int = Form(...), 
    db: Session = Depends(get_db), 
    admin=Depends(admin_required)
):
    new_level = SubscriptionLevel(name=name, mb_limit=mb_limit, torrent_limit=torrent_limit)
    db.add(new_level)
    db.commit()
    return {"status": "level created"}

@app.delete("/admin/levels/{level_id}")
async def admin_delete_level(level_id: int, db: Session = Depends(get_db), admin=Depends(admin_required)):
    """
    Удаление тарифа
    """
    level = db.query(SubscriptionLevel).get(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    
    # Проверка: нет ли пользователей на этом тарифе
    users_on_level = db.query(User).filter(User.subscription_id == level_id).count()
    if users_on_level > 0:
        raise HTTPException(status_code=400, detail="Cannot delete level: users are still using it")
        
    db.delete(level)
    db.commit()
    return {"status": "level deleted"}

@app.put("/admin/levels/{level_id}")
async def admin_edit_level(
    level_id: int, 
    name: str = Form(...), 
    mb_limit: float = Form(...), 
    torrent_limit: int = Form(...), 
    db: Session = Depends(get_db), 
    admin=Depends(admin_required)
):
    """
    Редактирование существующего тарифа
    """
    level = db.query(SubscriptionLevel).get(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Level not found")
    
    level.name = name
    level.mb_limit = mb_limit
    level.torrent_limit = torrent_limit
    db.commit()
    return {"status": "level updated"}

@app.get("/subscribe/levels")
async def admin_get_levels(db: Session = Depends(get_db)):
    levels = db.query(SubscriptionLevel).all()
    return [{
        "id": l.id,
        "name": l.name,
        "mb_limit": l.mb_limit,
        "torrent_limit": l.torrent_limit
    } for l in levels]

@app.patch("/admin/users/{user_id}/subscription")
async def set_user_sub(user_id: int, level_id: int, db: Session = Depends(get_db), admin=Depends(admin_required)):
    user = db.query(User).get(user_id)
    if not user: raise HTTPException(status_code=404, detail="User not found")
    user.subscription_id = level_id
    db.commit()
    return {"status": "updated"}

@app.get("/admin/users")
async def admin_get_users(db: Session = Depends(get_db), admin=Depends(admin_required)):
    users = db.query(User).all()
    return [{
        "id": u.id,
        "email": u.email,
        "is_admin": u.is_admin,
        "downloads_count": u.downloaded_files_count,
        "total_mb": round(u.total_downloaded_mb, 2),
        "subscription_name": u.subscription.name if u.subscription else "None"
    } for u in users]

@app.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: int, db: Session = Depends(get_db), admin=Depends(admin_required)):
    """
    Удаление пользователя
    """
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Здесь можно добавить логику удаления всех FileRecord этого пользователя
    db.delete(user)
    db.commit()
    return {"status": "user deleted"}

@app.get("/admin/system/logs")
async def admin_get_logs(
    level: Optional[str] = None, 
    limit: int = 100, 
    db: Session = Depends(get_db), 
    admin=Depends(admin_required)
):
    """
    Читает файл логов. 
    level: 'ERROR', 'WARNING', 'INFO'
    """
    log_file = "server_errors.log" # Убедитесь, что этот файл создается вашим логгером
    if not os.path.exists(log_file):
        return {"logs": []}

    try:
        with open(log_file, "r") as f:
            lines = f.readlines()

        # Берем последние N строк
        lines = lines[-limit:]
        
        parsed_logs = []
        for line in lines:
            # Ожидаемый формат: 2023-10-27 10:00:00,000 - ERROR - Message
            parts = line.split(" - ", 2)
            if len(parts) < 3:
                continue
                
            log_date_str = parts[0]
            log_level = parts[1]
            log_msg = parts[2].strip()

            if level and level.upper() != log_level:
                continue

            parsed_logs.append({
                "timestamp": log_date_str,
                "level": log_level,
                "message": log_msg
            })

        # Сортировка по дате (в обратном порядке, чтобы свежие были сверху)
        parsed_logs.sort(key=lambda x: x["timestamp"], reverse=True)
        
        return {"logs": parsed_logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read logs: {str(e)}")

@app.get("/admin/system/disk")
async def admin_get_disk_usage(admin=Depends(admin_required)):
    """
    Проверка свободного места на диске, где лежит DOWNLOAD_DIR
    """
    total, used, free = shutil.disk_usage(DOWNLOAD_DIR)
    
    return {
        "path": os.path.abspath(DOWNLOAD_DIR),
        "total_gb": round(total / (2**30), 2),
        "used_gb": round(used / (2**30), 2),
        "free_gb": round(free / (2**30), 2),
        "percent_used": round((used / total) * 100, 2)
    }



@app.get("/auth/logout")
async def logout():
    response = RedirectResponse(url="/")
    response.delete_cookie("access_token")
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)