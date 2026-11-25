from datetime import UTC, date, datetime

import pytest

from app.schedule import Schedule


def utc(y, m, d, hh=0, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=UTC)


def test_daily_same_day_if_time_not_passed():
    s = Schedule(kind="daily", time="09:00", tz="UTC")
    assert s.next_fire(utc(2026, 11, 24, 8, 59)) == utc(2026, 11, 24, 9, 0)


def test_daily_next_day_if_time_passed_or_equal():
    s = Schedule(kind="daily", time="09:00", tz="UTC")
    assert s.next_fire(utc(2026, 11, 24, 9, 0)) == utc(2026, 11, 25, 9, 0)


def test_weekdays_skip_weekend():
    s = Schedule(kind="weekdays", time="10:00", tz="UTC")
    # 2026-11-27 is a Friday
    assert s.next_fire(utc(2026, 11, 27, 11, 0)) == utc(2026, 11, 30, 10, 0)


def test_weekly_on_weekday():
    s = Schedule(kind="weekly", time="09:30", tz="UTC", weekday=0)  # Monday
    assert s.next_fire(utc(2026, 11, 24, 0, 0)) == utc(2026, 11, 30, 9, 30)


def test_every_two_weeks_respects_anchor():
    anchor = date(2026, 11, 23)  # a Monday
    s = Schedule(kind="every_n_weeks", time="09:00", tz="UTC", weekday=0, interval_weeks=2, anchor=anchor)
    assert s.next_fire(utc(2026, 11, 23, 9, 0)) == utc(2026, 12, 7, 9, 0)
    assert s.next_fire(utc(2026, 12, 7, 9, 0)) == utc(2026, 12, 21, 9, 0)


def test_monthly_clamps_to_month_end():
    s = Schedule(kind="monthly", time="08:00", tz="UTC", day_of_month=31)
    assert s.next_fire(utc(2027, 2, 1)) == utc(2027, 2, 28, 8, 0)
    assert s.next_fire(utc(2027, 2, 28, 8, 0)) == utc(2027, 3, 31, 8, 0)


def test_timezone_converts_to_utc():
    s = Schedule(kind="daily", time="09:00", tz="America/New_York")
    # 09:00 New York on 2026-11-24 (EST, UTC-5) is 14:00 UTC
    assert s.next_fire(utc(2026, 11, 24, 0, 0)) == utc(2026, 11, 24, 14, 0)


def test_dst_transition_keeps_local_time():
    s = Schedule(kind="daily", time="09:00", tz="America/New_York")
    # DST ends 2026-11-01; the day before is EDT (UTC-4), the day after EST (UTC-5)
    assert s.next_fire(utc(2026, 10, 31, 20, 0)) == utc(2026, 11, 1, 14, 0)


def test_rejects_unknown_timezone():
    with pytest.raises(ValueError):
        Schedule(kind="daily", time="09:00", tz="Mars/Olympus")


def test_rejects_missing_weekday():
    with pytest.raises(ValueError):
        Schedule(kind="weekly", time="09:00", tz="UTC")


def test_rejects_bad_time():
    with pytest.raises(ValueError):
        Schedule(kind="daily", time="25:00", tz="UTC")


def test_round_trips_through_json():
    s = Schedule(kind="every_n_weeks", time="09:00", tz="UTC", weekday=2, interval_weeks=3, anchor=date(2026, 1, 7))
    assert Schedule(**s.model_dump(mode="json")) == s
