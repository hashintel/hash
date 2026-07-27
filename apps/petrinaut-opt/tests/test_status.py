import pytest
from fastapi import FastAPI

from src.utils import Phase, StatusStore, set_status


@pytest.fixture
def status_app() -> FastAPI:
    app = FastAPI()
    app.state.statuses = StatusStore()
    return app


def test_concurrent_runs_keep_independent_statuses(status_app: FastAPI) -> None:
    first = status_app.state.statuses.create()
    second = status_app.state.statuses.create()

    set_status(status_app, first.run_id, phase=Phase.running, detail="first running")
    set_status(status_app, second.run_id, phase=Phase.running, detail="second running")
    set_status(status_app, first.run_id, phase=Phase.done, detail="first completed")

    first_status = status_app.state.statuses.get(first.run_id)
    second_status = status_app.state.statuses.get(second.run_id)

    assert first_status is not None
    assert first_status.phase is Phase.done
    assert first_status.detail == "first completed"
    assert second_status is not None
    assert second_status.phase is Phase.running
    assert second_status.detail == "second running"


def test_all_returns_each_run_with_its_identifier(status_app: FastAPI) -> None:
    first = status_app.state.statuses.create()
    second = status_app.state.statuses.create()

    statuses = status_app.state.statuses.all()

    assert [status.run_id for status in statuses] == [first.run_id, second.run_id]


def test_history_discards_the_oldest_runs_at_its_limit() -> None:
    statuses = StatusStore(max_history=2)
    first = statuses.create()
    second = statuses.create()
    third = statuses.create()

    assert statuses.get(first.run_id) is None
    assert [status.run_id for status in statuses.all()] == [second.run_id, third.run_id]


def test_history_does_not_evict_a_running_run() -> None:
    statuses = StatusStore(max_history=2)
    running = statuses.create()
    statuses.update(running.run_id, phase=Phase.running)
    finished = statuses.create()
    statuses.update(finished.run_id, phase=Phase.done)

    newest = statuses.create()

    assert statuses.get(running.run_id) is not None
    assert statuses.get(finished.run_id) is None
    assert statuses.get(newest.run_id) is not None
