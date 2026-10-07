import asyncio
import logging
import threading
from dataclasses import dataclass

import pytest

from petrinaut_optimization.events import EventBus, EventBusClosedError, Pipeline, Subscriber, only


@dataclass(frozen=True)
class TrialCompleted:
    number: int
    value: float


@dataclass(frozen=True)
class StudyFinished:
    best_value: float


type RunEvent = TrialCompleted | StudyFinished


async def collect[T](subscriber: Subscriber[T]) -> list[T]:
    return [event async for event in subscriber]


@pytest.mark.asyncio
async def test_publish_fan_out() -> None:
    bus = EventBus[int]()
    received = asyncio.gather(collect(bus.subscribe()), collect(bus.subscribe()))

    for event in range(3):
        bus.publish(event)
    await bus.shutdown()

    assert await received == [[0, 1, 2], [0, 1, 2]]


@pytest.mark.asyncio
async def test_publish_threads() -> None:
    bus = EventBus[int]()
    received = asyncio.create_task(collect(bus.subscribe()))

    def publish_batch(start: int) -> None:
        for event in range(start, start + 100):
            bus.publish(event)

    workers = [threading.Thread(target=publish_batch, args=(start,)) for start in (0, 100, 200)]
    for worker in workers:
        worker.start()
    await asyncio.to_thread(lambda: [worker.join() for worker in workers])
    await bus.shutdown()

    assert sorted(await received) == list(range(300))


@pytest.mark.asyncio
async def test_publish_closed() -> None:
    bus = EventBus[int]()
    await bus.shutdown()

    with pytest.raises(EventBusClosedError):
        bus.publish(1)


@pytest.mark.asyncio
async def test_subscribe_filter_map() -> None:
    bus = EventBus[int]()
    labels = bus.subscribe(middleware=lambda event: f"#{event}" if event % 2 == 0 else None)
    everything = bus.subscribe()
    received = asyncio.gather(collect(labels), collect(everything))

    for event in range(5):
        bus.publish(event)
    await bus.shutdown()

    # Filtering one subscriber must leave the other's stream untouched.
    assert await received == [["#0", "#2", "#4"], [0, 1, 2, 3, 4]]


@pytest.mark.asyncio
async def test_subscribe_middleware_failure(caplog: pytest.LogCaptureFixture) -> None:
    def reject_two(event: int) -> int:
        if event == 2:
            raise ValueError(event)
        return event

    bus = EventBus[int]()
    received = asyncio.create_task(collect(bus.subscribe(middleware=reject_two)))

    with caplog.at_level(logging.ERROR, logger="petrinaut_optimization.update"):
        for event in range(4):
            bus.publish(event)
        await bus.shutdown()

    assert await received == [0, 1, 3]
    assert "Subscriber middleware failed" in caplog.text


@pytest.mark.asyncio
async def test_subscribe_overflow_oldest() -> None:
    bus = EventBus[int]()
    subscriber = bus.subscribe(maxsize=2)
    for event in range(4):
        bus.publish(event)
    # Created after the publishes, so it only starts once all four are queued.
    received = asyncio.create_task(collect(subscriber))

    await bus.shutdown()

    assert await received == [2, 3]
    assert subscriber.dropped == 2


@pytest.mark.asyncio
async def test_subscribe_closed() -> None:
    bus = EventBus[int]()
    await bus.shutdown()

    with pytest.raises(EventBusClosedError):
        bus.subscribe()


@pytest.mark.asyncio
async def test_subscribe_foreign_loop() -> None:
    bus = EventBus[int]()

    async def subscribe_elsewhere() -> None:
        await asyncio.sleep(0)
        bus.subscribe()

    with pytest.raises(RuntimeError, match="event loop it was created on"):
        await asyncio.to_thread(asyncio.run, subscribe_elsewhere())
    await bus.shutdown()


@pytest.mark.asyncio
async def test_bus_middleware_map() -> None:
    bus = EventBus[str, int](middleware=len)
    doubled = bus.subscribe(middleware=lambda length: length * 2)
    received = asyncio.gather(collect(bus.subscribe()), collect(doubled))

    bus.publish("trial")
    await bus.shutdown()

    assert await received == [[5], [10]]


@pytest.mark.asyncio
async def test_pipeline_narrow_map() -> None:
    bus = EventBus[RunEvent]()
    values = bus.subscribe(
        middleware=Pipeline(only(TrialCompleted)).then(lambda trial: trial.value)
    )
    received = asyncio.create_task(collect(values))

    bus.publish(TrialCompleted(number=0, value=1.5))
    bus.publish(StudyFinished(best_value=1.5))
    bus.publish(TrialCompleted(number=1, value=0.5))
    await bus.shutdown()

    assert await received == [1.5, 0.5]


def test_pipeline_drop_short_circuit() -> None:
    later_calls: list[int] = []

    def record(event: int) -> int:
        later_calls.append(event)
        return event

    pipeline = Pipeline(lambda event: event if event > 0 else None).then(record)

    assert pipeline(0) is None
    assert pipeline(3) == 3
    assert later_calls == [3]


@pytest.mark.asyncio
async def test_drain_waits_for_consumer() -> None:
    bus = EventBus[int]()
    processed: list[int] = []

    async def consume(subscriber: Subscriber[int]) -> None:
        async for event in subscriber:
            await asyncio.sleep(0.01)
            processed.append(event)

    consumer = asyncio.create_task(consume(bus.subscribe()))
    for event in range(3):
        bus.publish(event)

    await asyncio.wait_for(bus.drain(), timeout=1)

    assert processed == [0, 1, 2]
    assert not consumer.done()
    await bus.shutdown()
    await consumer


@pytest.mark.asyncio
async def test_drain_closed_subscriber() -> None:
    bus = EventBus[int]()
    subscriber = bus.subscribe()
    for event in range(3):
        bus.publish(event)

    async with subscriber:
        async for event in subscriber:
            assert event == 0
            break

    # The two events left in the closed subscriber's queue must not count as pending.
    await asyncio.wait_for(bus.drain(), timeout=1)
    assert subscriber.closed
    await asyncio.wait_for(bus.shutdown(), timeout=1)


@pytest.mark.asyncio
async def test_shutdown_pending_delivery() -> None:
    bus = EventBus[int]()
    subscriber = bus.subscribe()
    bus.publish(1)
    bus.publish(2)
    received = asyncio.create_task(collect(subscriber))

    await bus.shutdown()

    assert await received == [1, 2]
    assert subscriber.closed


@pytest.mark.asyncio
async def test_shutdown_idempotent() -> None:
    bus = EventBus[int]()
    received = asyncio.create_task(collect(bus.subscribe()))
    bus.publish(1)

    await bus.shutdown()
    await asyncio.wait_for(bus.shutdown(), timeout=1)

    assert await received == [1]
    assert bus.closed


@pytest.mark.asyncio
async def test_shutdown_spawned_join() -> None:
    bus = EventBus[int]()
    processed: list[int] = []

    async def consume(subscriber: Subscriber[int]) -> None:
        async with subscriber:
            async for event in subscriber:
                await asyncio.sleep(0.01)
                processed.append(event)

    consumer = bus.spawn(consume(bus.subscribe()), name="consumer")
    for event in range(3):
        bus.publish(event)

    await asyncio.wait_for(bus.shutdown(), timeout=1)

    assert consumer.done()
    assert processed == [0, 1, 2]


@pytest.mark.asyncio
async def test_shutdown_inside_consumer() -> None:
    bus = EventBus[int]()

    async def stop_after_first(subscriber: Subscriber[int]) -> int:
        async with subscriber:
            async for event in subscriber:
                await bus.shutdown()
                return event
        return -1

    stopper = bus.spawn(stop_after_first(bus.subscribe()))
    bus.publish(7)

    # Shutdown must not wait on the subscription or task it is called from.
    assert await asyncio.wait_for(stopper, timeout=1) == 7
    assert bus.closed


@pytest.mark.asyncio
async def test_shutdown_timeout_drops_pending(caplog: pytest.LogCaptureFixture) -> None:
    bus = EventBus[int]()
    idle = bus.subscribe()
    bus.publish(1)

    with (
        caplog.at_level(logging.WARNING, logger="petrinaut_optimization.update"),
        pytest.raises(TimeoutError),
    ):
        async with asyncio.timeout(0.01):
            await bus.shutdown()

    assert await asyncio.wait_for(collect(idle), timeout=1) == []
    assert bus.closed
    assert "shutdown was cancelled" in caplog.text


@pytest.mark.asyncio
async def test_shutdown_timeout_cancels_task() -> None:
    bus = EventBus[int]()
    stuck = bus.spawn(asyncio.Event().wait())

    with pytest.raises(TimeoutError):
        async with asyncio.timeout(0.01):
            await bus.shutdown()

    with pytest.raises(asyncio.CancelledError):
        await stuck


@pytest.mark.asyncio
async def test_spawn_error_isolated(caplog: pytest.LogCaptureFixture) -> None:
    bus = EventBus[int]()

    async def fail(subscriber: Subscriber[int]) -> None:
        async with subscriber:
            async for event in subscriber:
                raise ValueError(event)

    failing = bus.spawn(fail(bus.subscribe()), name="failing")
    healthy = bus.spawn(collect(bus.subscribe()), name="healthy")

    with caplog.at_level(logging.ERROR, logger="petrinaut_optimization.update"):
        bus.publish(1)
        bus.publish(2)
        await asyncio.wait_for(bus.shutdown(), timeout=1)

    assert isinstance(failing.exception(), ValueError)
    assert healthy.result() == [1, 2]
    assert "Event bus task 'failing' failed" in caplog.text


@pytest.mark.asyncio
async def test_spawn_closed() -> None:
    bus = EventBus[int]()
    await bus.shutdown()

    with pytest.raises(EventBusClosedError):
        bus.spawn(asyncio.sleep(0))
