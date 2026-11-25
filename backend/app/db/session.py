"""
Database Session Management and Connection Engine for ATLAS.
Supports PostgreSQL (Production/Staging) and SQLite (Development/Test) seamlessly
with automated connection pooling, transaction boundaries, and PostGIS enablement.
"""
import os
from contextlib import contextmanager
from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker, Session
from app.config import settings
from app.db.models_sql import Base

def get_engine():
    db_url = settings.DATABASE_URL
    is_sqlite = db_url.startswith("sqlite")

    connect_args = {}
    if is_sqlite:
        connect_args["check_same_thread"] = False
        engine = create_engine(db_url, connect_args=connect_args)
        
        # Enforce foreign keys & WAL mode in SQLite
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()
    else:
        # PostgreSQL with connection pooling
        engine = create_engine(
            db_url,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            pool_recycle=3600
        )
    return engine

engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db(target_engine=None):
    """Initializes tables and attempts PostGIS extension creation if supported."""
    eng = target_engine or engine
    
    # Try enabling PostGIS on PostgreSQL
    if not str(eng.url).startswith("sqlite"):
        try:
            with eng.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
                conn.commit()
        except Exception as e:
            print(f"Notice: PostGIS extension check: {e}")

    Base.metadata.create_all(bind=eng)

@contextmanager
def get_db_session() -> Session:
    """Context manager for atomic transaction control."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

def get_db():
    """FastAPI Dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
