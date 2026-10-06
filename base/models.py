from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON, Boolean, create_engine
from sqlalchemy.orm import relationship, declarative_base, sessionmaker, Session


DATABASE_URL = "sqlite:///./torrent_app.db"
Base = declarative_base()

class SubscriptionLevel(Base):
    __tablename__ = "subscription_levels"
    
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    mb_limit = Column(Float, nullable=False)
    torrent_limit = Column(Integer, nullable=False)
    
    users = relationship("User", back_populates="subscription")

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    is_admin = Column(Boolean, default=False)
    profile_image_url = Column(String, nullable=True) # Должно быть это поле
    downloaded_files_count = Column(Integer, default=0)
    total_downloaded_mb = Column(Float, default=0.0)
    profile_image_url = Column(String, nullable=True)
    
    subscription_id = Column(Integer, ForeignKey("subscription_levels.id"))
    subscription = relationship("SubscriptionLevel", back_populates="users")
    # Связь с файлами
    files = relationship("FileRecord", back_populates="user")

class FileRecord(Base):
    __tablename__ = "files"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    token_name = Column(String, unique=True, nullable=False)
    storage_path = Column(String, nullable=False)
    metadata_json = Column(JSON) # Здесь храним: name, progress, state, etc.
    download_url = Column(String, nullable=False)
    torrent_hash = Column(String, nullable=True, index=True)
    magnet_uri = Column(String, nullable=True) # КРИТИЧНО для восстановления сессии
    original_file_path = Column(String, nullable=True) # КРИТИЧНО для восстановления сессии
    user = relationship("User", back_populates="files")





engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)