import os
import logging
from pathlib import Path
from dotenv import load_dotenv, set_key

# Загружаем переменные из .env, если файл существует
load_dotenv()

# Путь к файлу .env
ENV_PATH = Path(".env")

def get_or_set_env(key: str, default_value: str = None, is_secret: bool = False) -> str:
    """
    Пытается получить значение из окружения. 
    Если его нет, запрашивает ввод у пользователя и записывает в .env.
    """
    value = os.getenv(key)
    
    if not value:
        print(f"\n[CONFIG] Missing required variable: {key}")
        user_input = input(f"Please enter value for {key}: ").strip()
        
        # Если пользователь ничего не ввел, используем default_value
        if not user_input:
            if default_value:
                value = default_value
            else:
                raise ValueError(f"Critical error: {key} is required and no default provided.")
        else:
            value = user_input
            
            # Сохраняем введенное значение в .env файл, чтобы не спрашивать снова
            # Создаем файл, если его нет
            if not ENV_PATH.exists():
                ENV_PATH.touch()
            set_key(str(ENV_PATH), key, value)
            print(f"[CONFIG] {key} saved to .env")
    
    return value

# --- ИНИЦИАЛИЗАЦИЯ СЕКРЕТОВ ---
# Если это запуск в headless-режиме (на сервере без терминала), 
# input() вызовет ошибку. Но для локальной разработки это удобно.

SECRET_KEY = get_or_set_env("SECRET_KEY", is_secret=True)
GOOGLE_CLIENT_ID = get_or_set_env("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = get_or_set_env("GOOGLE_CLIENT_SECRET")

# --- КОНФИГУРАЦИЯ (Статичные или стандартные значения) ---
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
RESUME_DATA_FILE = "session_resume.dat"

# Пути (используем Path для кроссплатформенности)
DOWNLOAD_DIR = get_or_set_env("DOWNLOAD_DIR", "./downloads")
TORRENT_DIR = get_or_set_env("TORRENT_DIR", "./temp_path")

# Список админов (можно тоже вынести в .env через запятую)
ADMIN_EMAILS_STR = os.getenv("ADMIN_EMAILS", "examle@example.com")
ADMIN_EMAILS = {email.strip() for email in ADMIN_EMAILS_STR.split(",") if email.strip()}

# --- НАСТРОЙКА ЛОГИРОВАНИЯ ---
logger = logging.getLogger("uvicorn.error")
file_handler = logging.FileHandler("server_errors.log")
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# Тестовый вывод для проверки при старте (можно удалить)
if __name__ == "__main__":
    print("\n--- Config Loaded Successfully ---")
    print(f"Secret Key: {'*' * len(SECRET_KEY)}") # Маскируем ключ в логах
    print(f"Google ID: {GOOGLE_CLIENT_ID}")
    print(f"Admin count: {len(ADMIN_EMAILS)}")
    print("----------------------------------\n")
