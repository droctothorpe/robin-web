import time
from collections import deque

from fastapi import HTTPException, Request


class RateLimiter:
    """Fixed-count sliding window per key. In-memory, one process (ADR 0002)."""

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        q = self._hits.setdefault(key, deque())
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()


def client_ip(request: Request) -> str:
    # Fly sets Fly-Client-IP; other proxies set X-Forwarded-For.
    for header in ("fly-client-ip", "x-forwarded-for"):
        v = request.headers.get(header)
        if v:
            return v.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce(limiter: RateLimiter, request: Request) -> None:
    if not limiter.check(client_ip(request)):
        raise HTTPException(429, "Too many rotations created from this address. Try again later.")
