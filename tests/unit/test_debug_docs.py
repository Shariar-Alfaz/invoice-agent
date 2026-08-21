from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


def make_client(monkeypatch, debug: bool) -> TestClient:
    monkeypatch.setenv("DEBUG", "true" if debug else "false")
    get_settings.cache_clear()
    return TestClient(create_app(), follow_redirects=False)


def test_swagger_is_disabled_when_debug_is_false(monkeypatch):
    client = make_client(monkeypatch, debug=False)

    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
    assert client.get("/swagger").status_code == 404
    assert client.get("/").json() == {"success": True, "data": {"status": "ok"}}


def test_swagger_is_enabled_when_debug_is_true(monkeypatch):
    client = make_client(monkeypatch, debug=True)

    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/swagger").status_code == 307

    get_settings.cache_clear()
