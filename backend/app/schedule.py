"""Schedule presets and the pure math for when they next fire.

A Schedule is stored as a JSON dict on the Rotation. This module validates
that dict and computes the next firing time. It has no database or clock
dependencies so it can be tested exhaustively.
"""

import calendar
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

Kind = Literal["daily", "weekdays", "weekly", "every_n_weeks", "monthly"]

MAX_INTERVAL_WEEKS = 52
# Enough days to find a match for any preset, including every 52 weeks.
SEARCH_DAYS = 400


class Schedule(BaseModel):
    kind: Kind
    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="HH:MM local time")
    tz: str
    weekday: int | None = Field(default=None, ge=0, le=6, description="0=Monday")
    interval_weeks: int | None = Field(default=None, ge=1, le=MAX_INTERVAL_WEEKS)
    anchor: date | None = Field(default=None, description="Week-zero date for every_n_weeks")
    day_of_month: int | None = Field(default=None, ge=1, le=31)

    @field_validator("tz")
    @classmethod
    def _valid_tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as e:
            raise ValueError(f"unknown timezone: {v}") from e
        return v

    @model_validator(mode="after")
    def _required_fields(self) -> "Schedule":
        if self.kind in ("weekly", "every_n_weeks") and self.weekday is None:
            raise ValueError(f"{self.kind} requires weekday")
        if self.kind == "every_n_weeks":
            if self.interval_weeks is None:
                raise ValueError("every_n_weeks requires interval_weeks")
            if self.anchor is None:
                raise ValueError("every_n_weeks requires anchor")
        if self.kind == "monthly" and self.day_of_month is None:
            raise ValueError("monthly requires day_of_month")
        return self

    def _hour_minute(self) -> tuple[int, int]:
        h, m = self.time.split(":")
        return int(h), int(m)

    def matches_day(self, d: date) -> bool:
        match self.kind:
            case "daily":
                return True
            case "weekdays":
                return d.weekday() < 5
            case "weekly":
                return d.weekday() == self.weekday
            case "every_n_weeks":
                assert self.anchor is not None and self.interval_weeks is not None
                if d.weekday() != self.weekday:
                    return False
                weeks = (_monday_of(d) - _monday_of(self.anchor)).days // 7
                return weeks % self.interval_weeks == 0
            case "monthly":
                assert self.day_of_month is not None
                last = calendar.monthrange(d.year, d.month)[1]
                return d.day == min(self.day_of_month, last)
        return False

    def next_fire(self, after: datetime) -> datetime:
        """First firing strictly after `after`. Both are timezone-aware UTC."""
        if after.tzinfo is None:
            raise ValueError("after must be timezone-aware")
        tz = ZoneInfo(self.tz)
        local_after = after.astimezone(tz)
        hour, minute = self._hour_minute()
        start = local_after.date()
        for offset in range(SEARCH_DAYS):
            d = start + timedelta(days=offset)
            if not self.matches_day(d):
                continue
            candidate = datetime.combine(d, time(hour, minute), tzinfo=tz)
            if candidate > local_after:
                return candidate.astimezone(UTC)
        raise RuntimeError("no firing found within search window")


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())
