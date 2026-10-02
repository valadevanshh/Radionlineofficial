import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "RadioNet PACS FastAPI Backend"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Environment & Database Safety
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    ALLOW_SQLITE_FALLBACK: bool = os.getenv("ALLOW_SQLITE_FALLBACK", "true").lower() == "true"

    # PostgreSQL Database URL
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/postgres"
    )
    # Fallback to SQLite if PostgreSQL service is offline in local dev environment
    SQLITE_FALLBACK_URL: str = "sqlite:///./radionline.db"
    
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]

    # JWT auth
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-insecure-jwt-secret-change-me")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

settings = Settings()
