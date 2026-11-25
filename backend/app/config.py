import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = os.environ.get("DATABASE_URL", "sqlite:///./robin.db")
    public_base_url: str = os.environ.get("PUBLIC_BASE_URL", "http://localhost:5173").rstrip("/")
    frontend_dist: str = os.environ.get("FRONTEND_DIST", "../frontend/dist")
    rotation_ttl_days: int = int(os.environ.get("ROTATION_TTL_DAYS", "180"))
    create_limit_per_hour: int = int(os.environ.get("CREATE_LIMIT_PER_HOUR", "20"))
    scheduler_interval_seconds: int = int(os.environ.get("SCHEDULER_INTERVAL_SECONDS", "30"))
    expiry_interval_seconds: int = int(os.environ.get("EXPIRY_INTERVAL_SECONDS", "3600"))
    webhook_timeout_seconds: float = float(os.environ.get("WEBHOOK_TIMEOUT_SECONDS", "5"))
    run_background_tasks: bool = os.environ.get("RUN_BACKGROUND_TASKS", "1") == "1"


settings = Settings()
