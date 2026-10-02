import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "RadioNet PACS FastAPI Backend"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Environment & Database Safety
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    # Default: allow SQLite only in development. Production must use Postgres.
    ALLOW_SQLITE_FALLBACK: bool = os.getenv(
        "ALLOW_SQLITE_FALLBACK",
        "false" if os.getenv("ENVIRONMENT", "development") == "production" else "true",
    ).lower() == "true"

    # PostgreSQL Database URL (VPS example: postgresql://radionline:...@127.0.0.1:5432/radionline)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://radionline:postgres@127.0.0.1:5432/radionline"
    )
    # Fallback to SQLite if PostgreSQL service is offline in local dev environment
    SQLITE_FALLBACK_URL: str = "sqlite:///./radionline.db"
    
    CORS_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000",
        ).split(",")
        if origin.strip()
    ]

    # JWT auth
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-insecure-jwt-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

    # KV2 / Hostinger disk storage (paths in DB; bytes on disk)
    # Example Hostinger: /home/u123456/domains/yourdomain.com/storage
    FILE_STORAGE_ROOT: str = os.getenv("FILE_STORAGE_ROOT", "./data/files")
    # Optional public origin for absolute URLs in API JSON (e.g. https://api.yourdomain.com)
    FILE_PUBLIC_BASE_URL: str = os.getenv("FILE_PUBLIC_BASE_URL", "")

settings = Settings()
