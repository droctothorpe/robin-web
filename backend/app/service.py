"""All state changes to a Rotation go through here.

Every mutation writes an AuditEntry, bumps the Rotation's version, commits,
and publishes a change event. Mutations that change Current return a
Notification the caller must deliver (webhooks are I/O and belong to the
caller's execution model, not the database transaction).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from ipaddress import ip_address
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import rotation_ops as ops
from .broker import broker
from .config import settings
from .models import AuditEntry, Rotation
from .schedule import Schedule
from .time import iso_z, to_aware, to_naive, utcnow

SCHEDULE_ACTOR = "Schedule"
DEFAULT_ACTOR = "Someone"
MAX_ACTOR_LEN = 40
MAX_ROTATION_NAME_LEN = 80


class ServiceError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class NotFound(ServiceError):
    def __init__(self) -> None:
        super().__init__(404, "No rotation at this link.")


class Forbidden(ServiceError):
    def __init__(self) -> None:
        super().__init__(403, "This is a view-only link.")


class Invalid(ServiceError):
    def __init__(self, message: str) -> None:
        super().__init__(422, message)


@dataclass(frozen=True)
class Notification:
    rotation_id: int
    url: str
    payload: dict


# --- lookup -----------------------------------------------------------------


def resolve(db: Session, token: str) -> tuple[Rotation, bool]:
    """Return (rotation, can_edit) for either token, or raise NotFound."""
    stmt = select(Rotation).where((Rotation.edit_token == token) | (Rotation.view_token == token))
    r = db.execute(stmt).scalar_one_or_none()
    if r is None:
        raise NotFound()
    return r, r.edit_token == token


def resolve_edit(db: Session, token: str) -> Rotation:
    r, can_edit = resolve(db, token)
    if not can_edit:
        raise Forbidden()
    return r


def touch(db: Session, r: Rotation) -> None:
    """Record a visit, which is what keeps a Rotation from expiring."""
    r.last_visited_at = utcnow()
    db.commit()


def expires_at(r: Rotation) -> datetime:
    return r.last_visited_at + timedelta(days=settings.rotation_ttl_days)


def clean_actor(raw: str | None) -> str:
    if raw is None:
        return DEFAULT_ACTOR
    name = " ".join(raw.split())[:MAX_ACTOR_LEN]
    return name or DEFAULT_ACTOR


def clean_rotation_name(raw: str) -> str:
    name = " ".join(raw.split())
    if not name:
        raise Invalid("Rotation name is empty.")
    if len(name) > MAX_ROTATION_NAME_LEN:
        raise Invalid(f"Rotation name longer than {MAX_ROTATION_NAME_LEN} characters.")
    return name


# --- internals --------------------------------------------------------------


def _record(db: Session, r: Rotation, kind: str, actor: str, detail: dict | None = None) -> None:
    db.add(AuditEntry(rotation=r, kind=kind, actor=actor, detail=detail or {}))
    r.version += 1


def _commit(db: Session, r: Rotation) -> None:
    db.commit()
    broker.publish(r.id, {"version": r.version})


def _notification(r: Rotation, previous: str | None, trigger: str) -> Notification | None:
    if not r.webhook_url or r.current is None:
        return None
    view_url = f"{settings.public_base_url}/r/{r.view_token}"
    text = f"*{r.name}*: it's {r.current}'s turn"
    if previous and previous != r.current:
        text += f" (after {previous})"
    text += f". <{view_url}|View rotation>"
    return Notification(
        rotation_id=r.id,
        url=r.webhook_url,
        payload={
            # Slack incoming webhooks read `text`; Discord reads `content`.
            "text": text,
            "content": f"{r.name}: it's {r.current}'s turn. {view_url}",
            "rotation": r.name,
            "current": r.current,
            "previous": previous,
            "trigger": trigger,
            "view_url": view_url,
        },
    )


# --- lifecycle --------------------------------------------------------------


def create_rotation(db: Session, name: str, members: list[str], actor: str) -> Rotation:
    name = clean_rotation_name(name)
    try:
        members = ops.dedupe(members)
    except ValueError as e:
        raise Invalid(str(e)) from e
    r = Rotation(
        name=name,
        edit_token=ops.new_token(),
        view_token=ops.new_token(),
        members=members,
    )
    db.add(r)
    db.flush()
    _record(db, r, "created", actor, {"name": name, "members": members})
    r.version = 1
    db.commit()
    return r


def rename(db: Session, r: Rotation, name: str, actor: str) -> None:
    name = clean_rotation_name(name)
    if name == r.name:
        return
    _record(db, r, "renamed", actor, {"from": r.name, "to": name})
    r.name = name
    _commit(db, r)


def delete_rotation(db: Session, r: Rotation, confirm_name: str) -> None:
    if " ".join(confirm_name.split()).casefold() != r.name.casefold():
        raise Invalid("Type the rotation's name exactly to delete it.")
    rid = r.id
    db.delete(r)
    db.commit()
    broker.publish(rid, {"deleted": True})


def regenerate_token(db: Session, r: Rotation, which: str, actor: str) -> None:
    if which == "edit":
        r.edit_token = ops.new_token()
    elif which == "view":
        r.view_token = ops.new_token()
    else:
        raise Invalid("which must be 'edit' or 'view'.")
    _record(db, r, "token_regenerated", actor, {"which": which})
    _commit(db, r)


# --- members ----------------------------------------------------------------


def add_member(db: Session, r: Rotation, name: str, actor: str) -> None:
    try:
        name = ops.normalize_name(name)
    except ValueError as e:
        raise Invalid(str(e)) from e
    if ops.find(r.members, name) != -1:
        raise Invalid(f"{name} is already on this rotation.")
    if len(r.members) >= ops.MAX_MEMBERS:
        raise Invalid(f"A rotation holds at most {ops.MAX_MEMBERS} members.")
    r.members = [*r.members, name]
    _record(db, r, "member_added", actor, {"member": name})
    _commit(db, r)


def remove_member(db: Session, r: Rotation, name: str, actor: str) -> None:
    idx = ops.find(r.members, name)
    if idx == -1:
        raise Invalid(f"{name} is not on this rotation.")
    removed = r.members[idx]
    r.members = [m for i, m in enumerate(r.members) if i != idx]
    _record(db, r, "member_removed", actor, {"member": removed, "position": idx + 1})
    _commit(db, r)


def reorder_members(db: Session, r: Rotation, members: list[str], actor: str) -> None:
    try:
        members = ops.dedupe(members)
    except ValueError as e:
        raise Invalid(str(e)) from e
    if not ops.same_set(members, r.members):
        raise Invalid("Reorder must contain exactly the current members.")
    if members == r.members:
        return
    before = r.members
    r.members = members
    _record(db, r, "members_reordered", actor, {"before": before, "after": members})
    _commit(db, r)


# --- turns ------------------------------------------------------------------


def advance(db: Session, r: Rotation, actor: str, trigger: str = "manual") -> Notification | None:
    if len(r.members) < 2:
        raise Invalid("Add at least two members before advancing.")
    before = r.members
    r.members = ops.advance(before)
    _record(
        db, r, "advanced", actor,
        {"from": before[0], "to": r.members[0], "trigger": trigger},
    )
    _commit(db, r)
    return _notification(r, before[0], trigger)


def bump(db: Session, r: Rotation, actor: str) -> Notification | None:
    if len(r.members) < 2:
        raise Invalid("Add at least two members before bumping.")
    before = r.members
    r.members = ops.bump(before)
    _record(db, r, "bumped", actor, {"skipped": before[0], "to": r.members[0]})
    _commit(db, r)
    return _notification(r, before[0], "bump")


def random_pick(db: Session, r: Rotation, actor: str) -> str:
    try:
        picked, r.random_picked = ops.random_pick(r.members, r.random_picked or [])
    except ValueError as e:
        raise Invalid(str(e)) from e
    remaining = len(r.members) - len(r.random_picked)
    _record(db, r, "random_pick", actor, {"member": picked, "remaining_in_round": remaining})
    _commit(db, r)
    return picked


# --- schedule ---------------------------------------------------------------


def set_schedule(db: Session, r: Rotation, schedule: Schedule, actor: str) -> None:
    now = utcnow()
    r.schedule = schedule.model_dump(mode="json")
    r.schedule_paused = False
    r.next_fire_at = to_naive(schedule.next_fire(to_aware(now)))
    _record(db, r, "schedule_set", actor, {"schedule": r.schedule, "next_fire_at": iso_z(r.next_fire_at)})
    _commit(db, r)


def clear_schedule(db: Session, r: Rotation, actor: str) -> None:
    if r.schedule is None:
        return
    r.schedule = None
    r.schedule_paused = False
    r.next_fire_at = None
    _record(db, r, "schedule_cleared", actor)
    _commit(db, r)


def set_paused(db: Session, r: Rotation, paused: bool, actor: str) -> None:
    if r.schedule is None:
        raise Invalid("There is no schedule to pause.")
    if r.schedule_paused == paused:
        return
    r.schedule_paused = paused
    if not paused:
        # Resuming never fires immediately for windows missed while paused.
        r.next_fire_at = to_naive(Schedule(**r.schedule).next_fire(to_aware(utcnow())))
    _record(db, r, "schedule_paused" if paused else "schedule_resumed", actor)
    _commit(db, r)


def fire_due_schedules(db: Session, now: datetime) -> list[Notification]:
    """Advance every Rotation whose schedule is overdue, once each.

    Catch-up rule (ADR 0002): however many windows were missed, the Rotation
    advances a single time and the next firing is computed from `now`.
    """
    stmt = select(Rotation).where(
        Rotation.next_fire_at.is_not(None),
        Rotation.next_fire_at <= now,
        Rotation.schedule_paused.is_(False),
    )
    notifications: list[Notification] = []
    for r in db.execute(stmt).scalars().all():
        if r.schedule is None:
            r.next_fire_at = None
            db.commit()
            continue
        schedule = Schedule(**r.schedule)
        r.next_fire_at = to_naive(schedule.next_fire(to_aware(now)))
        if len(r.members) < 2:
            db.commit()
            continue
        n = advance(db, r, SCHEDULE_ACTOR, trigger="schedule")
        if n is not None:
            notifications.append(n)
    return notifications


# --- webhook ----------------------------------------------------------------

_BLOCKED_HOSTS = {"localhost", "fly-local-6pn", "metadata.google.internal"}


def validate_webhook_url(url: str) -> str:
    url = url.strip()
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise Invalid("Webhook must be an http(s) URL.")
    host = parts.hostname.lower()
    if host in _BLOCKED_HOSTS or host.endswith(".internal") or host.endswith(".local"):
        raise Invalid("Webhook host is not allowed.")
    try:
        ip = ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved):
        raise Invalid("Webhook host is not allowed.")
    if len(url) > 2000:
        raise Invalid("Webhook URL is too long.")
    return url


def set_webhook(db: Session, r: Rotation, url: str, actor: str) -> None:
    url = validate_webhook_url(url)
    if url == r.webhook_url:
        return
    r.webhook_url = url
    _record(db, r, "webhook_set", actor, {"host": urlsplit(url).hostname})
    _commit(db, r)


def clear_webhook(db: Session, r: Rotation, actor: str) -> None:
    if r.webhook_url is None:
        return
    r.webhook_url = None
    _record(db, r, "webhook_cleared", actor)
    _commit(db, r)


def record_webhook_failure(db: Session, rotation_id: int, reason: str) -> None:
    r = db.get(Rotation, rotation_id)
    if r is None:
        return
    _record(db, r, "webhook_failed", "Robin", {"reason": reason})
    _commit(db, r)


# --- expiry -----------------------------------------------------------------


def delete_expired(db: Session, now: datetime) -> int:
    cutoff = now - timedelta(days=settings.rotation_ttl_days)
    stmt = select(Rotation).where(Rotation.last_visited_at < cutoff)
    expired = db.execute(stmt).scalars().all()
    for r in expired:
        db.delete(r)
    db.commit()
    return len(expired)


# --- audit ------------------------------------------------------------------


def audit_page(db: Session, r: Rotation, before_id: int | None, limit: int) -> list[AuditEntry]:
    stmt = select(AuditEntry).where(AuditEntry.rotation_id == r.id)
    if before_id is not None:
        stmt = stmt.where(AuditEntry.id < before_id)
    stmt = stmt.order_by(AuditEntry.id.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())
