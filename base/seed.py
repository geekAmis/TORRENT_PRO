# base/seed.py
import sys
import os

# Этот блок позволяет запускать seed.py как отдельный скрипт из корня проекта,
# чтобы импорты вида 'from base.models import ...' не ломались.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from base.models import SubscriptionLevel, User, Base, SessionLocal, engine

def seed_data():
    # Создаем сессию для работы с БД
    # Предполагаем, что SessionLocal определен в models.py
    from sqlalchemy.orm import Session
    db: Session = SessionLocal()
    
    try:
        print("--- [SEED] Starting database seeding ---")
        
        # 1. Создаем таблицы, если они еще не созданы
        # Base и engine должны быть в models.py
        Base.metadata.create_all(bind=engine)

        # 2. Наполняем уровни подписки
        default_levels = [
            {"name": "Standart", "mb_limit": 5125.0, "torrent_limit": 3},
            {"name": "VIP", "mb_limit": 20480.0, "torrent_limit": 10},
            {"name": "PRO", "mb_limit": 256000.0, "torrent_limit": 70},
            {"name": "ADMIN", "mb_limit": 256000.0, "torrent_limit": 9999},
            {"name": "BAN", "mb_limit": 0.0, "torrent_limit": 0}
        ]

        for level_data in default_levels:
            exists = db.query(SubscriptionLevel).filter(SubscriptionLevel.name == level_data["name"]).first()
            if not exists:
                print(f"Adding level: {level_data['name']}...")
                new_level = SubscriptionLevel(**level_data)
                db.add(new_level)
            else:
                print(f"Level '{level_data['name']}' already exists. Skipping.")
        
        db.commit() # Фиксируем изменения уровней

        print("--- [SEED] Seeding completed successfully ---")

    except Exception as e:
        print(f"!!! [SEED] Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()