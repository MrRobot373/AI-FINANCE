import os
import uuid as _uuid
from sqlalchemy import create_engine, String, TypeDecorator
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./finance.db")

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class GUID(TypeDecorator):
    """Cross-dialect UUID type.
    Stores as native UUID on PostgreSQL; as VARCHAR(36) on SQLite and other dialects.
    Always returns Python uuid.UUID objects on the Python side.
    """
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return str(value)
        return str(value) if not isinstance(value, str) else value

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, _uuid.UUID):
            return value
        try:
            return _uuid.UUID(str(value))
        except (ValueError, AttributeError):
            return value


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
