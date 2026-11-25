"""Datetime conventions.

The database stores naive datetimes that are always UTC, because SQLite drops
timezone information. Convert at the edges with to_aware / to_naive and format
for the API with iso_z.
"""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def to_aware(naive_utc: datetime) -> datetime:
    return naive_utc.replace(tzinfo=UTC)


def to_naive(aware: datetime) -> datetime:
    return aware.astimezone(UTC).replace(tzinfo=None)


def iso_z(naive_utc: datetime | None) -> str | None:
    if naive_utc is None:
        return None
    return naive_utc.replace(microsecond=0).isoformat() + "Z"
