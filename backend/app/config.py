import os
from typing import Optional
from dotenv import load_dotenv

# Load root .env if present
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_ENV_PATH = os.path.join(_PROJECT_ROOT, ".env")
if os.path.exists(_ENV_PATH):
    load_dotenv(_ENV_PATH)

_DEFAULT_SQLITE = os.path.join(_PROJECT_ROOT, "data", "atlas_operational.db")

class Settings:
    SQLITE_DB_PATH: str = os.getenv("SQLITE_DB_PATH", _DEFAULT_SQLITE)

    # Supabase PostgreSQL or environment database URL
    _default_url = f"sqlite:///{_DEFAULT_SQLITE.replace(os.sep, '/')}"
    DATABASE_URL: str = os.getenv("DATABASE_URL", _default_url)

    SUPABASE_URL: Optional[str] = os.getenv("SUPABASE_URL")
    SUPABASE_ANON_KEY: Optional[str] = os.getenv("SUPABASE_ANON_KEY")
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "postgres")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")

    # Operational
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    ENABLE_POSTGIS: bool = os.getenv("ENABLE_POSTGIS", "true").lower() in ("true", "1", "yes")

    # Groq AI Intelligence Layer
    GROQ_API_KEY: Optional[str] = os.getenv("GROQ_API_KEY")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    GROQ_FAST_MODEL: str = os.getenv("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
    GROQ_TIMEOUT_SECONDS: float = float(os.getenv("GROQ_TIMEOUT_SECONDS", "15.0"))

settings = Settings()
