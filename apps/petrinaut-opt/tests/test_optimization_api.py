from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi.testclient import TestClient

from src import optimization_api
from src.petrinaut_client import PetrinautClientError


class FakeClient:
    def __init__(self) -> None:
        self.closed = False

    def start(self) -> None:
        pass

    def run_scenario(self, **request: Any) -> float:
        return float(request["parameter_values"]["rate"])

    def close(self) -> None:
        self.closed = True


class StartFailingClient(FakeClient):
    def start(self) -> None:
        raise PetrinautClientError("private model failure")


def test_local_module_defaults_to_loopback_port_4004() -> None:
    assert optimization_api.DEFAULT_HOST == "127.0.0.1"
    assert optimization_api.DEFAULT_PORT == 4004


def test_post_optimize_returns_typed_ndjson(
    optimization_payload: dict, monkeypatch
) -> None:
    fake_client = FakeClient()
    monkeypatch.setattr(
        optimization_api,
        "create_client",
        lambda _optimization_input: fake_client,
    )

    with TestClient(optimization_api.app) as client:
        response = client.post("/optimize", json=optimization_payload)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    events = [json.loads(line) for line in response.text.splitlines()]
    assert [event["type"] for event in events] == [
        "started",
        "trial",
        "trial",
        "trial",
        "complete",
    ]
    assert events[0]["requestedTrials"] == 3
    assert events[-1]["completedTrials"] == 3
    assert fake_client.closed is True


def test_openapi_describes_the_post_stream_and_event_union() -> None:
    operation = optimization_api.app.openapi()["paths"]["/optimize"]["post"]

    assert "get" not in optimization_api.app.openapi()["paths"]["/optimize"]
    response = operation["responses"]["200"]["content"]["application/x-ndjson"]
    assert len(response["schema"]["oneOf"]) == 4
    assert response["schema"]["discriminator"]["propertyName"] == "type"


def test_rejects_an_oversized_request_body() -> None:
    with TestClient(optimization_api.app) as client:
        response = client.post(
            "/optimize",
            content=b"x" * (optimization_api.MAX_REQUEST_BODY_BYTES + 1),
            headers={"content-type": "application/json"},
        )

    assert response.status_code == 413


def test_rejects_an_oversized_chunked_request_body(monkeypatch) -> None:
    monkeypatch.setattr(optimization_api, "MAX_REQUEST_BODY_BYTES", 5)
    incoming = iter(
        [
            {"type": "http.request", "body": b"123", "more_body": True},
            {"type": "http.request", "body": b"456", "more_body": False},
        ]
    )
    outgoing: list[dict[str, Any]] = []

    async def receive() -> dict[str, Any]:
        return next(incoming)

    async def send(message: dict[str, Any]) -> None:
        outgoing.append(message)

    async def downstream(_scope, receive_body, _send) -> None:
        while (await receive_body()).get("more_body", False):
            pass

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/optimize",
        "raw_path": b"/optimize",
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("127.0.0.1", 4004),
    }

    asyncio.run(
        optimization_api.RequestBodyLimitMiddleware(downstream)(
            scope, receive, send
        )
    )

    assert outgoing[0]["status"] == 413


def test_rejects_a_study_when_the_local_limit_is_reached(
    optimization_payload: dict,
) -> None:
    with TestClient(optimization_api.app) as client:
        optimization_api.app.state.active_optimizations = (
            optimization_api.MAX_ACTIVE_OPTIMIZATIONS
        )
        response = client.post("/optimize", json=optimization_payload)

    assert response.status_code == 429


def test_status_does_not_expose_another_studys_failure(
    optimization_payload: dict, monkeypatch
) -> None:
    monkeypatch.setattr(
        optimization_api,
        "create_client",
        lambda _optimization_input: StartFailingClient(),
    )

    with TestClient(optimization_api.app) as client:
        response = client.post("/optimize", json=optimization_payload)
        status = client.get("/status")

    assert "private model failure" in response.text
    assert status.json()["detail"] == "optimization failed"
