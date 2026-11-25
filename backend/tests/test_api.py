from datetime import timedelta

from app import service
from app.models import Rotation
from app.time import utcnow

H = {"X-Display-Name": "Alex"}


def kinds(client, token):
    return [e["kind"] for e in client.get(f"/api/r/{token}/audit").json()["entries"]]


def test_create_returns_both_tokens_and_dedupes(client):
    r = client.post("/api/rotations", json={"name": "  Chores ", "members": ["A", "a", "B"]}, headers=H)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Chores"
    assert body["members"] == ["A", "B"]
    assert body["current"] == "A"
    assert body["edit_token"] != body["view_token"]
    assert body["can_edit"] is True


def test_view_token_reads_but_hides_secrets(client, rotation):
    r = client.get(f"/api/r/{rotation['view_token']}")
    assert r.status_code == 200
    body = r.json()
    assert body["can_edit"] is False
    assert "edit_token" not in body
    assert "webhook_url" not in body


def test_view_token_cannot_mutate(client, rotation):
    assert client.post(f"/api/r/{rotation['view_token']}/advance", headers=H).status_code == 403
    assert client.post(f"/api/r/{rotation['view_token']}/members", json={"name": "Z"}, headers=H).status_code == 403


def test_unknown_token_is_404(client):
    assert client.get("/api/r/nope").status_code == 404


def test_advance_and_bump_with_audit(client, rotation):
    t = rotation["edit_token"]
    r = client.post(f"/api/r/{t}/advance", headers=H).json()
    assert r["members"] == ["Sam", "Priya", "Alex"]
    r = client.post(f"/api/r/{t}/bump", headers={"X-Display-Name": "Sam"}).json()
    assert r["members"] == ["Priya", "Sam", "Alex"]
    entries = client.get(f"/api/r/{t}/audit").json()["entries"]
    assert [e["kind"] for e in entries] == ["bumped", "advanced", "created"]
    assert entries[0]["actor"] == "Sam"
    assert entries[1]["detail"] == {"from": "Alex", "to": "Sam", "trigger": "manual"}


def test_advance_requires_two_members(client):
    r = client.post("/api/rotations", json={"name": "Solo", "members": ["Only"]}, headers=H).json()
    assert client.post(f"/api/r/{r['edit_token']}/advance", headers=H).status_code == 422


def test_random_pick_is_logged_and_does_not_reorder(client, rotation):
    t = rotation["edit_token"]
    r = client.post(f"/api/r/{t}/random", headers=H).json()
    assert r["member"] in rotation["members"]
    assert r["members"] == rotation["members"]
    assert r["random_picked"] == [r["member"]]
    assert kinds(client, t)[0] == "random_pick"


def test_random_pick_covers_everyone_before_repeating(client, rotation):
    t = rotation["edit_token"]
    picks = [client.post(f"/api/r/{t}/random", headers=H).json()["member"] for _ in range(3)]
    assert sorted(picks) == sorted(rotation["members"])
    r = client.post(f"/api/r/{t}/random", headers=H).json()
    assert r["random_picked"] == [r["member"]]


def test_members_add_remove_reorder(client, rotation):
    t = rotation["edit_token"]
    assert client.post(f"/api/r/{t}/members", json={"name": "alex"}, headers=H).status_code == 422
    r = client.post(f"/api/r/{t}/members", json={"name": "Dana"}, headers=H).json()
    assert r["members"][-1] == "Dana"
    r = client.put(f"/api/r/{t}/members", json={"members": ["Dana", "Alex", "Priya", "Sam"]}, headers=H).json()
    assert r["members"] == ["Dana", "Alex", "Priya", "Sam"]
    bad = client.put(f"/api/r/{t}/members", json={"members": ["Dana", "Alex"]}, headers=H)
    assert bad.status_code == 422
    r = client.delete(f"/api/r/{t}/members/priya", headers=H).json()
    assert r["members"] == ["Dana", "Alex", "Sam"]
    assert kinds(client, t)[:3] == ["member_removed", "members_reordered", "member_added"]


def test_default_actor_when_no_name(client, rotation):
    t = rotation["edit_token"]
    client.post(f"/api/r/{t}/advance")
    assert client.get(f"/api/r/{t}/audit").json()["entries"][0]["actor"] == "Someone"


def test_regenerate_invalidates_old_link(client, rotation):
    old = rotation["edit_token"]
    r = client.post(f"/api/r/{old}/regenerate", json={"which": "edit"}, headers=H).json()
    assert r["edit_token"] != old
    assert client.get(f"/api/r/{old}").status_code == 404
    assert client.get(f"/api/r/{r['edit_token']}").status_code == 200


def test_delete_requires_exact_name(client, rotation):
    t = rotation["edit_token"]
    assert client.post(f"/api/r/{t}/delete", json={"confirm_name": "wrong"}).status_code == 422
    assert client.post(f"/api/r/{t}/delete", json={"confirm_name": "standup lead"}).status_code == 204
    assert client.get(f"/api/r/{t}").status_code == 404
    assert client.get(f"/api/r/{rotation['view_token']}").status_code == 404


def test_rename(client, rotation):
    t = rotation["edit_token"]
    r = client.patch(f"/api/r/{t}", json={"name": "On-call"}, headers=H).json()
    assert r["name"] == "On-call"
    assert kinds(client, t)[0] == "renamed"


def test_rate_limit_on_create(client):
    for _ in range(5):
        assert client.post("/api/rotations", json={"name": "x", "members": []}).status_code == 201
    assert client.post("/api/rotations", json={"name": "x", "members": []}).status_code == 429


def test_schedule_set_computes_next_fire_and_pause(client, rotation):
    t = rotation["edit_token"]
    r = client.put(f"/api/r/{t}/schedule", json={"kind": "daily", "time": "09:00", "tz": "UTC"}, headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["schedule"]["kind"] == "daily"
    assert body["next_fire_at"] is not None
    r = client.post(f"/api/r/{t}/schedule/paused", json={"paused": True}, headers=H).json()
    assert r["schedule_paused"] is True
    r = client.delete(f"/api/r/{t}/schedule", headers=H).json()
    assert r["schedule"] is None and r["next_fire_at"] is None
    assert kinds(client, t)[:3] == ["schedule_cleared", "schedule_paused", "schedule_set"]


def test_schedule_rejects_invalid(client, rotation):
    t = rotation["edit_token"]
    r = client.put(f"/api/r/{t}/schedule", json={"kind": "weekly", "time": "09:00", "tz": "UTC"}, headers=H)
    assert r.status_code == 422


def test_due_schedule_fires_once_even_if_many_windows_missed(client, rotation, db):
    t = rotation["edit_token"]
    client.put(f"/api/r/{t}/schedule", json={"kind": "daily", "time": "09:00", "tz": "UTC"}, headers=H)
    r = db.query(Rotation).one()
    r.next_fire_at = utcnow() - timedelta(days=10)
    db.commit()

    now = utcnow()
    notes = service.fire_due_schedules(db, now)
    assert notes == []  # no webhook configured
    db.refresh(r)
    assert r.members == ["Sam", "Priya", "Alex"]  # advanced exactly once
    assert r.next_fire_at > now
    assert client.get(f"/api/r/{t}/audit").json()["entries"][0] == {
        **client.get(f"/api/r/{t}/audit").json()["entries"][0],
        "actor": "Schedule",
        "kind": "advanced",
    }
    # a second tick does nothing
    assert service.fire_due_schedules(db, utcnow()) == []
    db.refresh(r)
    assert r.members == ["Sam", "Priya", "Alex"]


def test_paused_schedule_does_not_fire(client, rotation, db):
    t = rotation["edit_token"]
    client.put(f"/api/r/{t}/schedule", json={"kind": "daily", "time": "09:00", "tz": "UTC"}, headers=H)
    client.post(f"/api/r/{t}/schedule/paused", json={"paused": True}, headers=H)
    r = db.query(Rotation).one()
    r.next_fire_at = utcnow() - timedelta(hours=1)
    db.commit()
    service.fire_due_schedules(db, utcnow())
    db.refresh(r)
    assert r.members == ["Alex", "Sam", "Priya"]


def test_webhook_set_builds_slack_compatible_notification(client, rotation, db):
    t = rotation["edit_token"]
    r = client.put(f"/api/r/{t}/webhook", json={"url": "https://hooks.slack.com/services/T/B/x"}, headers=H).json()
    assert r["has_webhook"] is True and r["webhook_url"].startswith("https://hooks")
    view = client.get(f"/api/r/{rotation['view_token']}").json()
    assert view["has_webhook"] is True and "webhook_url" not in view
    rot = db.query(Rotation).one()
    n = service.advance(db, rot, "Alex")
    assert n is not None
    assert n.payload["current"] == "Sam" and n.payload["previous"] == "Alex"
    assert "Sam" in n.payload["text"]
    assert n.payload["view_url"] == f"https://robin.test/r/{rotation['view_token']}"
    assert kinds(client, t)[1] == "webhook_set"


def test_webhook_rejects_internal_hosts(client, rotation):
    t = rotation["edit_token"]
    for url in ("http://localhost/x", "http://127.0.0.1/x", "http://10.0.0.1/x", "http://app.internal/x", "ftp://a.b/x"):
        assert client.put(f"/api/r/{t}/webhook", json={"url": url}, headers=H).status_code == 422, url


def test_webhook_failure_is_audited(client, rotation, db):
    t = rotation["edit_token"]
    rot = db.query(Rotation).one()
    service.record_webhook_failure(db, rot.id, "HTTP 404")
    e = client.get(f"/api/r/{t}/audit").json()["entries"][0]
    assert e["kind"] == "webhook_failed" and e["detail"] == {"reason": "HTTP 404"}


def test_visit_extends_expiry_and_expired_are_deleted(client, rotation, db):
    t = rotation["edit_token"]
    r = db.query(Rotation).one()
    r.last_visited_at = utcnow() - timedelta(days=181)
    db.commit()
    # A visit rescues it.
    assert client.get(f"/api/r/{t}").status_code == 200
    assert service.delete_expired(db, utcnow()) == 0
    # Without a visit it goes.
    r = db.query(Rotation).one()
    r.last_visited_at = utcnow() - timedelta(days=181)
    db.commit()
    assert service.delete_expired(db, utcnow()) == 1
    assert client.get(f"/api/r/{t}").status_code == 404


def test_audit_pagination(client, rotation):
    t = rotation["edit_token"]
    for _ in range(5):
        client.post(f"/api/r/{t}/advance", headers=H)
    page = client.get(f"/api/r/{t}/audit", params={"limit": 4}).json()
    assert len(page["entries"]) == 4 and page["has_more"] is True
    rest = client.get(f"/api/r/{t}/audit", params={"limit": 4, "before": page["entries"][-1]["id"]}).json()
    assert len(rest["entries"]) == 2 and rest["has_more"] is False
    assert rest["entries"][-1]["kind"] == "created"


def test_health_and_sse_hello(client, rotation):
    assert client.get("/health").json() == {"status": "ok"}
    with client.stream("GET", f"/api/r/{rotation['view_token']}/events") as s:
        assert s.status_code == 200
        assert s.headers["content-type"].startswith("text/event-stream")
        first = next(s.iter_lines())
        assert first == "event: hello"
