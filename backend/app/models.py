from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .time import utcnow


class Rotation(Base):
    __tablename__ = "rotations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    edit_token: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    view_token: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    # Ordered list of member names. Always reassigned, never mutated in place,
    # so SQLAlchemy sees the change.
    members: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    # Members already chosen by Random pick in the current round. Cleared when
    # everyone has been picked once, so nobody is picked twice in a round.
    random_picked: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    schedule: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    schedule_paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # All datetimes are naive UTC; see app.time.
    next_fire_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    last_visited_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, index=True
    )

    audit: Mapped[list["AuditEntry"]] = relationship(
        back_populates="rotation", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def current(self) -> str | None:
        return self.members[0] if self.members else None


class AuditEntry(Base):
    __tablename__ = "audit_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rotation_id: Mapped[int] = mapped_column(
        ForeignKey("rotations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    actor: Mapped[str] = mapped_column(String(40), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    rotation: Mapped[Rotation] = relationship(back_populates="audit")
