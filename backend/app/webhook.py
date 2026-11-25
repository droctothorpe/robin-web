import asyncio
import logging

import httpx

from .config import settings
from .db import SessionLocal
from .service import Notification, record_webhook_failure

log = logging.getLogger(__name__)


async def deliver(n: Notification) -> None:
    """POST the payload once. Failures become an audit entry; there are no retries."""
    reason: str | None = None
    try:
        async with httpx.AsyncClient(timeout=settings.webhook_timeout_seconds) as client:
            resp = await client.post(n.url, json=n.payload)
            if resp.status_code >= 400:
                reason = f"HTTP {resp.status_code}"
    except httpx.HTTPError as e:
        reason = type(e).__name__
    if reason is None:
        return
    log.info("webhook for rotation %s failed: %s", n.rotation_id, reason)
    await asyncio.to_thread(_record_failure, n.rotation_id, reason)


def _record_failure(rotation_id: int, reason: str) -> None:
    with SessionLocal() as db:
        record_webhook_failure(db, rotation_id, reason)


async def deliver_all(notifications: list[Notification]) -> None:
    for n in notifications:
        await deliver(n)
