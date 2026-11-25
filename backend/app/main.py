import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db as database
from .api import router
from .broker import broker
from .config import settings
from .scheduler import expiry_loop, schedule_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    broker.bind(asyncio.get_running_loop())
    tasks: list[asyncio.Task] = []
    if settings.run_background_tasks:
        tasks.append(asyncio.create_task(schedule_loop(), name="schedule_loop"))
        tasks.append(asyncio.create_task(expiry_loop(), name="expiry_loop"))
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


def create_app() -> FastAPI:
    database.configure(settings.database_url)
    app = FastAPI(title="Robin", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.include_router(router)

    @app.get("/health", include_in_schema=False)
    def health():
        return JSONResponse({"status": "ok"})

    dist = Path(settings.frontend_dist).resolve()
    if (dist / "index.html").is_file():
        if (dist / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            candidate = (dist / path).resolve()
            if path and candidate.is_file() and dist in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
