import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["RUN_BACKGROUND_TASKS"] = "0"
os.environ["PUBLIC_BASE_URL"] = "https://robin.test"
os.environ["CREATE_LIMIT_PER_HOUR"] = "5"

import pytest
from fastapi.testclient import TestClient

from app import api
from app.db import Base, SessionLocal
from app.main import app


@pytest.fixture(autouse=True)
def fresh_db():
    engine = SessionLocal.kw["bind"]
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    api.create_limiter.reset()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def rotation(client):
    """A created rotation: returns the JSON state including edit_token."""
    resp = client.post(
        "/api/rotations",
        json={"name": "Standup lead", "members": ["Alex", "Sam", "Priya"]},
        headers={"X-Display-Name": "Alex"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
