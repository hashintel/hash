import asyncio

import pytest

from petrinaut_optimization.events import EventBus
from petrinaut_optimization.status import Phase, StatusStore, StatusStoreUpdateEvent


@pytest.mark.asyncio
async def test_status_concurrent_independent() -> None:
    statuses = StatusStore()
    bus = EventBus[StatusStoreUpdateEvent]()
    statuses.subscribe(event_bus=bus)
    try:
        first = statuses.create()
        second = statuses.create()

        bus.publish(
            StatusStoreUpdateEvent(
                run_id=first.run_id,
                changes={"phase": Phase.running, "detail": "first running"},
            )
        )
        bus.publish(
            StatusStoreUpdateEvent(
                run_id=second.run_id,
                changes={"phase": Phase.running, "detail": "second running"},
            )
        )
        bus.publish(
            StatusStoreUpdateEvent(
                run_id=first.run_id,
                changes={"phase": Phase.done, "detail": "first completed"},
            )
        )
        await asyncio.wait_for(bus.drain(), timeout=1)

        first_status = statuses.get(first.run_id)
        second_status = statuses.get(second.run_id)
        assert first_status is not None
        assert second_status is not None
        assert first_status.phase is Phase.done
        assert first_status.detail == "first completed"
        assert second_status.phase is Phase.running
        assert second_status.detail == "second running"
    finally:
        await bus.shutdown()


def test_status_all_identifiers() -> None:
    statuses = StatusStore()
    first = statuses.create()
    second = statuses.create()

    assert [status.run_id for status in statuses.all()] == [first.run_id, second.run_id]


def test_status_history_limit() -> None:
    statuses = StatusStore(max_history=2)
    first = statuses.create()
    second = statuses.create()
    third = statuses.create()

    assert statuses.get(first.run_id) is None
    assert [status.run_id for status in statuses.all()] == [second.run_id, third.run_id]


def test_status_history_spares_running() -> None:
    statuses = StatusStore(max_history=2)
    running = statuses.create()
    statuses.update(running.run_id, phase=Phase.running)
    finished = statuses.create()
    statuses.update(finished.run_id, phase=Phase.done)

    newest = statuses.create()

    assert statuses.get(running.run_id) is not None
    assert statuses.get(finished.run_id) is None
    assert statuses.get(newest.run_id) is not None
