
# 🚀 TORRENT_PRO

<p align="center">
  <a href="https://secommu.com">
    <img src="https://img.shields.io/badge/LIVE_DEMO-secommu.com-brightgreen?style=for-the-badge&logo=googlechrome" alt="Live Demo">
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/Libtorrent-Python-blue?style=for-the-badge" alt="Libtorrent">
  <img src="https://img.shields.io/badge/PostgreSQL-Database-blue?style=for-the-badge" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Auth-Google_OAuth-red?style=for-the-badge" alt="Google OAuth">
</p>

**TORRENT_PRO** — это высокопроизводительная, масштабируемая многопользовательская система управления торрентами. Система позволяет пользователям легко управлять загрузками через Magnet-ссылки или `.torrent` файлы, заточенная под сервера с высокой скоростью загрузки, при этом обеспечивая строгое соблюдение лимитов ресурсов (объем данных и количество торрентов) в рамках подписочной модели.

---

## 🖥️ Демонстрация интерфейса

<table style="width: 100%; border-collapse: collapse; border: none;">
  <tr style="border: none;">
    <td style="padding: 5px; border: none; width: 50%;">
      <img src="https://github.com/user-attachments/assets/5901c87f-e49e-462f-8ede-4619892ce4d2" alt="Screenshot 1" style="width: 100%; border-radius: 12px; border: 1px solid #30363d;">
    </td>
    <td style="padding: 5px; border: none; width: 50%;">
      <img src="https://github.com/user-attachments/assets/d9812c7c-aace-4c76-b2c7-0ace5acb668d" alt="Screenshot 2" style="width: 100%; border-radius: 12px; border: 1px solid #30363d;">
    </td>
  </tr>
</table>

<p align="center">
  <img src="https://github.com/user-attachments/assets/d2684602-6959-466c-a8a7-fc3c1fbcad4c" width="31%" style="border-radius: 8px; border: 1px solid #30363d; margin: 2px;">
  <img src="https://github.com/user-attachments/assets/973bb67f-38b3-4ac6-8ab3-edc4651b75a2" width="31%" style="border-radius: 8px; border: 1px solid #30363d; margin: 2px;">
  <img src="https://github.com/user-attachments/assets/44b5efbc-c22b-4a71-a968-29ca94ee3f76" width="31%" style="border-radius: 8px; border: 1px solid #30363d; margin: 2px;">
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/53446dbe-0b9a-4025-923c-003a830cd563" width="49%" style="border-radius: 8px; border: 1px solid #30363d; margin: 2px;">
</p>

---

## ✨ Ключевые возможности

### 🛡️ Продвинутое управление пользователями
* **Интеграция Google OAuth2:** Безопасная и мгновенная авторизация через Google.
* **Система подписок:** Гибкое управление доступом. Администраторы могут задавать лимиты для:
    * `Лимит МБ`: Максимальный объем скачанных данных.
    * `Лимит Торрентов`: Максимальное количество активных загрузок.
* **Автоматизация профилей:** Система автоматически создает профиль и синхронизирует данные (аватар, email) при первом входе.

### 📥 Торрент-движок (на базе libtorrent)
* **Гибридное добавление:** Поддержка как **Magnet-ссылок**, так и физических **.torrent файлов**.
* **Умное возобновление:** При перезагрузке сервера система сканирует БД и автоматически возобновляет все незавершенные загрузки.
* **Мониторинг в реальном времени:** Асинхронные фоновые задачи отслеживают скорость, прогресс, количество пиров и статусы.
* **Общая библиотека (Global Sharing):** Если пользователь добавляет торрент, который уже качается другим участником системы, он мгновенно "привязывается" к его библиотеке без повторного расхода трафика.

### 👨‍💼 Панель администратора
* **Контроль пользователей:** Мониторинг статистики загрузок и статусов подписок.
* **Управление тарифами:** Создание новых уровней доступа и назначение их пользователям "на лету".
* **Полный контроль:** Управление всей экосистемой торрент-сервера через API.

---

## 🏗️ Архитектура

Проект построен на современной асинхронной архитектуре:

* **Backend:** `FastAPI` для обработки высоконагруженных API-запросов.
* **Frontend:** `Flask` для обеспечения веб-интерфейса.
* **Torrent Core:** `libtorrent`, обернутый в `asyncio` задачи для неблокирующего мониторинга.
* **Database:** `SQLAlchemy` + `PostgreSQL` для хранения данных пользователей, метаданных файлов и уровней подписки.
* **Concurrency:** Использование `asyncio.create_task` для независимого мониторинга каждого активного хэша.

---

## 🛠️ Технологический стек

| Компонент | Технология |
| :--- | :--- |
| **Язык** | Python 3.9+ |
| **Web Framework** | FastAPI |
| **Torrent Engine** | libtorrent |
| **Аутентификация** | Authlib (Google OAuth2) + JWT |
| **ORM** | SQLAlchemy |
| **Асинхронность** | Asyncio |

---

## 🚀 Быстрый старт

### Предварительные требования
* Python 3.9+
* Установленный системный пакет `libtorrent`
* Проект в Google Cloud Console (для OAuth-ключей)

### Установка

1. **Клонируйте репозиторий**
   ```bash
   git clone https://github.com/geekAmis/TORRENT_PRO.git
   cd TORRENT_PRO
   ```

2. **Установите зависимости**
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Настройка окружения**
   Создайте файл `.env` или обновите `config/init.py`:
   ```env
   GOOGLE_CLIENT_ID=ваш_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=ваш_секрет
   SECRET_KEY=ваш_секретный_ключ_jwt
   ADMIN_EMAILS={'admin@example.com', ...}
   ```

4. **Запуск API сервера**
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips '*'
   ```

5. **Запуск Web-клиента**
   ```bash
   cd ./web
   gunicorn -w 4 -b 127.0.0.1:80 app:app
   ```

---

## 🛣️ Дорожная карта API

| Эндпоинт | Метод | Описание | Доступ |
| :--- | :--- | :--- | :--- |
| `/auth/login` | `GET` | Редирект на Google Login | Публичный |
| `/torrent/file` | `POST` | Загрузка `.torrent` файла | Пользователь |
| `/torrent/magnet`| `POST` | Добавление через Magnet-ссылку | Пользователь |
| `/torrent/all` | `GET` | Список торрентов пользователя | Пользователь |
| `/torrent/download/{hash}`| `GET` | Скачать завершенный файл | Пользователь |
| `/admin/users` | `GET` | Список всех пользователей | Admin |

---

## 📝 Лицензия

Распространяется под лицензией MIT. Подробности в файле `LICENSE`.

---
**Built with ❤️ for the Cyberpunk Tech Enthusiast.**
```
