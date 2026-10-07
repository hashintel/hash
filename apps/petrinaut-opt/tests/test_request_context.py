"""Request dependency and lifecycle regressions for the composed API."""

import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from petrinaut import OptimizationSession
from petrinaut_optimization import service
from petrinaut_optimization.api import app, body_limit
from petrinaut_optimization.events import EventBus
from petrinaut_optimization.petrinaut_optimizer import PetrinautOptimizer, PetrinautOptimizerEvents
from petrinaut_optimization.status import Phase, StatusStoreUpdateEvent


def test_request_chunked_413(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(body_limit, "MAX_REQUEST_BODY_BYTES", 5)
    with TestClient(app) as client:
        response = client.post(
            "/optimize/runs",
            content=iter([b'{"x":', b"123}"]),
            headers={"content-type": "application/json"},
        )
    assert response.status_code == 413


def test_request_busy_keeps_initializer(
    optimization_description: dict[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    started = threading.Event()
    finish = threading.Event()
    calls: list[str] = []

    def initialize(
        _manifest: dict[str, object], *, bus: EventBus[PetrinautOptimizerEvents]
    ) -> PetrinautOptimizer:
        calls.append("initialize")
        started.set()
        if not finish.wait(timeout=5):
            raise TimeoutError("test did not release initialization")
        model = Mock(spec=OptimizationSession)
        model.objective.return_value = 1.0
        return PetrinautOptimizer(model, bus=bus, description=optimization_description)

    monkeypatch.setattr(service, "initialize_optimizer", initialize)
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=1) as executor:
        creating = executor.submit(
            client.post,
            "/optimize/runs",
            json={},
            headers={"x-hash-account-id": " owner ", "x-hash-request-id": "first"},
        )
        try:
            assert started.wait(timeout=2)
            for request_id in ("second", "third"):
                rejected = client.post(
                    "/optimize/runs",
                    json={},
                    headers={"x-hash-account-id": "owner", "x-hash-request-id": request_id},
                )
                assert rejected.status_code == 429
            assert calls == ["initialize"]
        finally:
            finish.set()
        created = creating.result(timeout=2)
        assert created.status_code == 201
        run_id = created.json()["run_id"]
        assert (
            client.delete(
                f"/optimize/runs/{run_id}", headers={"x-hash-account-id": "owner"}
            ).status_code
            == 204
        )


def test_lifespan_drains_status() -> None:
    with TestClient(app) as client:
        current = client.app_state["service"]
        status = current.status.create()

        async def publish() -> None:
            current.bus.publish(
                StatusStoreUpdateEvent(run_id=status.run_id, changes={"phase": Phase.done})
            )
            await current.bus.drain()

        assert client.portal is not None
        client.portal.call(publish)
        assert client.get(f"/status/{status.run_id}").json()["phase"] == "done"
    assert current.bus.closed
    with TestClient(app) as client:
        assert client.app_state["service"] is not current
        assert client.get("/status").json() == []
