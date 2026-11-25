import asyncio
import json
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import service
from .broker import broker
from .config import settings
from .db import get_db
from .models import AuditEntry, Rotation
from .ratelimit import RateLimiter, enforce
from .schedule import Schedule
from .time import iso_z
from .webhook import deliver

router = APIRouter(prefix="/api")
create_limiter = RateLimiter(limit=settings.create_limit_per_hour, window_seconds=3600)

KEEPALIVE_SECONDS = 15


# --- schemas ----------------------------------------------------------------


class CreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    members: list[str] = Field(default_factory=list, max_length=500)


class NameIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class MembersIn(BaseModel):
    members: list[str] = Field(max_length=500)


class PausedIn(BaseModel):
    paused: bool


class WebhookIn(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class RegenerateIn(BaseModel):
    which: Literal["edit", "view"]


class DeleteIn(BaseModel):
    confirm_name: str


# --- serialization ----------------------------------------------------------


def state(r: Rotation, can_edit: bool) -> dict:
    out = {
        "name": r.name,
        "members": r.members,
        "current": r.current,
        "random_picked": r.random_picked or [],
        "can_edit": can_edit,
        "view_token": r.view_token,
        "schedule": r.schedule,
        "schedule_paused": r.schedule_paused,
        "next_fire_at": iso_z(r.next_fire_at),
        "has_webhook": r.webhook_url is not None,
        "version": r.version,
        "created_at": iso_z(r.created_at),
        "expires_at": iso_z(service.expires_at(r)),
        "ttl_days": settings.rotation_ttl_days,
    }
    if can_edit:
        out["edit_token"] = r.edit_token
        out["webhook_url"] = r.webhook_url
    return out


def audit_json(e: AuditEntry) -> dict:
    return {
        "id": e.id,
        "at": iso_z(e.created_at),
        "actor": e.actor,
        "kind": e.kind,
        "detail": e.detail,
    }


# --- dependencies -----------------------------------------------------------


def actor_from(x_display_name: str | None = Header(default=None)) -> str:
    return service.clean_actor(x_display_name)


def edit_rotation(token: str, db: Session = Depends(get_db)) -> Rotation:
    try:
        return service.resolve_edit(db, token)
    except service.ServiceError as e:
        raise HTTPException(e.status, e.message) from e


def run(fn, *args):
    try:
        return fn(*args)
    except service.ServiceError as e:
        raise HTTPException(e.status, e.message) from e


# --- routes -----------------------------------------------------------------


@router.post("/rotations", status_code=201)
def create(body: CreateIn, request: Request, actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    enforce(create_limiter, request)
    r = run(service.create_rotation, db, body.name, body.members, actor)
    return state(r, can_edit=True)


@router.get("/r/{token}")
def read(token: str, db: Session = Depends(get_db)):
    r, can_edit = run(service.resolve, db, token)
    service.touch(db, r)
    return state(r, can_edit)


@router.get("/r/{token}/audit")
def audit(
    token: str,
    before: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    r, _ = run(service.resolve, db, token)
    entries = service.audit_page(db, r, before, limit)
    return {"entries": [audit_json(e) for e in entries], "has_more": len(entries) == limit}


@router.get("/r/{token}/events")
async def events(token: str, request: Request, db: Session = Depends(get_db)):
    r, _ = run(service.resolve, db, token)
    rotation_id, version = r.id, r.version
    db.close()
    q = broker.subscribe(rotation_id)

    async def stream():
        try:
            yield f"event: hello\ndata: {json.dumps({'version': version})}\n\n"
            while not await request.is_disconnected():
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=KEEPALIVE_SECONDS)
                except TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield f"event: change\ndata: {json.dumps(payload)}\n\n"
        finally:
            broker.unsubscribe(rotation_id, q)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.patch("/r/{token}")
def rename(body: NameIn, r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.rename, db, r, body.name, actor)
    return state(r, True)


@router.post("/r/{token}/delete", status_code=204)
def delete(body: DeleteIn, r: Rotation = Depends(edit_rotation), db: Session = Depends(get_db)):
    run(service.delete_rotation, db, r, body.confirm_name)
    return None


@router.post("/r/{token}/regenerate")
def regenerate(body: RegenerateIn, r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.regenerate_token, db, r, body.which, actor)
    return state(r, True)


@router.post("/r/{token}/members")
def add_member(body: NameIn, r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.add_member, db, r, body.name, actor)
    return state(r, True)


@router.delete("/r/{token}/members/{name}")
def remove_member(name: str, r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.remove_member, db, r, name, actor)
    return state(r, True)


@router.put("/r/{token}/members")
def reorder(body: MembersIn, r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.reorder_members, db, r, body.members, actor)
    return state(r, True)


async def _deliver_later(n: service.Notification | None) -> None:
    if n is not None:
        await deliver(n)


@router.post("/r/{token}/advance")
async def advance(r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    n = run(service.advance, db, r, actor)
    asyncio.create_task(_deliver_later(n))
    return state(r, True)


@router.post("/r/{token}/bump")
async def bump(r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    n = run(service.bump, db, r, actor)
    asyncio.create_task(_deliver_later(n))
    return state(r, True)


@router.post("/r/{token}/random")
def random_pick(r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    picked = run(service.random_pick, db, r, actor)
    return {"member": picked, **state(r, True)}


@router.put("/r/{token}/schedule")
def set_schedule(body: Schedule, r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.set_schedule, db, r, body, actor)
    return state(r, True)


@router.delete("/r/{token}/schedule")
def clear_schedule(r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.clear_schedule, db, r, actor)
    return state(r, True)


@router.post("/r/{token}/schedule/paused")
def set_paused(body: PausedIn, r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.set_paused, db, r, body.paused, actor)
    return state(r, True)


@router.put("/r/{token}/webhook")
def set_webhook(body: WebhookIn, r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.set_webhook, db, r, body.url, actor)
    return state(r, True)


@router.delete("/r/{token}/webhook")
def clear_webhook(r: Rotation = Depends(edit_rotation), actor: str = Depends(actor_from), db: Session = Depends(get_db)):
    run(service.clear_webhook, db, r, actor)
    return state(r, True)
