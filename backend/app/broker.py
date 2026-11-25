"""In-memory publish/subscribe used to push live updates to open pages.

Mutations happen in worker threads (sync SQLAlchemy) while subscribers are
asyncio queues on the main loop, so publish hops onto the loop with
call_soon_threadsafe. One process only; see ADR 0002.
"""

import asyncio
import logging

log = logging.getLogger(__name__)


class Broker:
    def __init__(self) -> None:
        self._subs: dict[int, set[asyncio.Queue]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self, rotation_id: int) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subs.setdefault(rotation_id, set()).add(q)
        return q

    def unsubscribe(self, rotation_id: int, q: asyncio.Queue) -> None:
        subs = self._subs.get(rotation_id)
        if subs is None:
            return
        subs.discard(q)
        if not subs:
            del self._subs[rotation_id]

    def publish(self, rotation_id: int, payload: dict) -> None:
        """Thread-safe. Drops silently if no loop is bound (tests, CLI)."""
        if self._loop is None or self._loop.is_closed():
            return
        try:
            self._loop.call_soon_threadsafe(self._deliver, rotation_id, payload)
        except RuntimeError:
            log.debug("broker publish after loop shutdown")

    def _deliver(self, rotation_id: int, payload: dict) -> None:
        for q in list(self._subs.get(rotation_id, ())):
            q.put_nowait(payload)

    def subscriber_count(self, rotation_id: int) -> int:
        return len(self._subs.get(rotation_id, ()))


broker = Broker()
