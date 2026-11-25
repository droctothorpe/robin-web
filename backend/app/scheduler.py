"""Background loops: fire due schedules, delete expired rotations.

Both run inside the single web process (ADR 0002). Each tick opens its own
session in a worker thread so the event loop stays free for SSE streams.
"""

import asyncio
import logging

from . import service
from .config import settings
from .db import SessionLocal
from .time import utcnow
from .webhook import deliver_all

log = logging.getLogger(__name__)


def _fire_tick() -> list[service.Notification]:
    with SessionLocal() as db:
        return service.fire_due_schedules(db, utcnow())


def _expiry_tick() -> int:
    with SessionLocal() as db:
        return service.delete_expired(db, utcnow())


async def schedule_loop() -> None:
    while True:
        try:
            notifications = await asyncio.to_thread(_fire_tick)
            if notifications:
                log.info("fired %d scheduled advance(s)", len(notifications))
            await deliver_all(notifications)
        except Exception:
            log.exception("scheduler tick failed")
        await asyncio.sleep(settings.scheduler_interval_seconds)


async def expiry_loop() -> None:
    while True:
        try:
            n = await asyncio.to_thread(_expiry_tick)
            if n:
                log.info("deleted %d expired rotation(s)", n)
        except Exception:
            log.exception("expiry tick failed")
        await asyncio.sleep(settings.expiry_interval_seconds)
