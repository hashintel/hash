"""In-process publish/subscribe bus with middleware, draining and graceful shutdown.

The bus is bound to the event loop it was created on. `EventBus.publish` is
thread-safe, so worker threads can emit events; everything else (subscribing,
iterating, draining, shutting down) happens on that loop, which is also where
all middleware runs.

Typical use::

    bus = EventBus[RunEvent]()

    async def stream(subscriber: Subscriber[str]) -> None:
        async with subscriber:
            async for frame in subscriber:
                ...

    frames = Pipeline(only(TrialCompleted)).then(to_sse_frame)
    bus.spawn(stream(bus.subscribe(middleware=frames)))

    # elsewhere, e.g. in the lifespan:
    async with asyncio.timeout(5):
        await bus.shutdown()
"""

import asyncio
import logging
from collections.abc import Callable, Coroutine
from threading import Lock
from typing import Never, Protocol, Self, cast, overload

logger = logging.getLogger(__name__)

type Middleware[In, Out] = Callable[[In], Out | None]
"""Turns an event into the event to pass on, or `None` to drop it.

Because `None` means "drop", events themselves can't be `None`. Every
subscriber receives the same object, so a middleware should return a new value
rather than mutate the one it receives.
"""


def _identity[T](event: T) -> T:
    return event


class Pipeline[In, Out]:
    """Middleware composed left to right, stopping at the first step that drops the event.

    Each step may change the event's type::

        Pipeline(only(TrialCompleted)).then(lambda trial: trial.value)
    """

    def __init__(self, step: Middleware[In, Out]) -> None:
        self._step = step

    def then[Next](self, step: Middleware[Out, Next]) -> Pipeline[In, Next]:
        previous = self._step

        def composed(event: In) -> Next | None:
            intermediate = previous(event)
            return None if intermediate is None else step(intermediate)

        return Pipeline(composed)

    def __call__(self, event: In) -> Out | None:
        return self._step(event)


def only[E](kind: type[E]) -> Middleware[object, E]:
    """Keep only instances of `kind`, typed as `kind` from then on."""

    def keep(event: object) -> E | None:
        return event if isinstance(event, kind) else None

    return keep


class EventBusClosedError(Exception):
    """Raised when publishing to or subscribing on a bus that has been shut down."""


def _resolve(future: asyncio.Future[None]) -> None:
    if not future.done():
        future.set_result(None)


class _Inbox[T]:
    """The queue between the bus, which offers events, and the subscriber consuming them.

    `asyncio.Queue` task accounting tracks progress: an event is done once the
    consumer asks for the next one or closes, which is what `join` waits for.
    """

    def __init__(self, maxsize: int) -> None:
        self._queue: asyncio.Queue[T] = asyncio.Queue(maxsize)
        self._in_flight = False
        self.accepting = True
        self.dropped = 0
        self.consumer: asyncio.Task[object] | None = None

    def offer(self, event: T) -> None:
        if not self.accepting:
            return

        if self._queue.full():
            # Prefer fresh events over stale ones for a slow consumer.
            self._queue.get_nowait()
            self._queue.task_done()
            self.dropped += 1
            logger.warning("Subscriber queue is full; dropped the oldest event")

        self._queue.put_nowait(event)

    async def take(self) -> T:
        """Settle the previous event and wait for the next; raises `QueueShutDown` at the end."""
        self.settle()
        self.consumer = asyncio.current_task()
        event = await self._queue.get()
        self._in_flight = True
        return event

    def settle(self) -> None:
        if self._in_flight:
            self._in_flight = False
            self._queue.task_done()

    def end(self, *, immediate: bool) -> None:
        self.accepting = False
        self._queue.shutdown(immediate=immediate)

    async def join(self) -> None:
        await self._queue.join()


class Subscriber[T]:
    """One consumer's stream of events from an `EventBus`.

    Iterate it with `async for` from a single task. Use it as an async context
    manager (or call `close`) so that a consumer which stops early never holds
    up draining or shutdown.
    """

    def __init__(self, inbox: _Inbox[T], on_close: Callable[[Subscriber[T]], None]) -> None:
        self._inbox = inbox
        self._on_close = on_close
        self._closed = False

    @property
    def closed(self) -> bool:
        return self._closed

    @property
    def dropped(self) -> int:
        """Events discarded because the queue was at `maxsize`."""
        return self._inbox.dropped

    def close(self) -> None:
        """Detach from the bus and discard undelivered events. Idempotent."""
        if self._closed:
            return

        self._closed = True
        self._inbox.settle()
        self._inbox.end(immediate=True)
        self._on_close(self)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        self.close()

    def __aiter__(self) -> Self:
        return self

    async def __anext__(self) -> T:
        try:
            return await self._inbox.take()
        except asyncio.QueueShutDown:
            self.close()
            raise StopAsyncIteration from None


class _Sink[In](Protocol):
    """What the bus needs from a subscription, independent of its output type."""

    def deliver(self, event: In, /) -> None: ...

    def end(self, *, immediate: bool) -> None: ...

    async def join(self) -> None: ...

    @property
    def consumer(self) -> asyncio.Task[object] | None: ...


class _Tap[In, Out]:
    """The bus-facing end of a subscription: runs its middleware, then enqueues."""

    def __init__(self, middleware: Middleware[In, Out], inbox: _Inbox[Out]) -> None:
        self._middleware = middleware
        self._inbox = inbox

    def deliver(self, event: In, /) -> None:
        if not self._inbox.accepting:
            return

        try:
            result = self._middleware(event)
        except Exception:
            logger.exception("Subscriber middleware failed; dropping event")
            return

        if result is not None:
            self._inbox.offer(result)

    def end(self, *, immediate: bool) -> None:
        self._inbox.end(immediate=immediate)

    async def join(self) -> None:
        await self._inbox.join()

    @property
    def consumer(self) -> asyncio.Task[object] | None:
        return self._inbox.consumer


class EventBus[In, Out = In]:
    """Fans published events out to every subscriber, in publish order.

    Publishers send `In`; subscribers start from `Out`. The bus middleware turns
    one into the other once per event, before fan-out; each subscriber's
    middleware then runs on its own. A middleware that raises drops the event
    (for everyone, or for that subscriber) and logs the error.
    """

    @overload
    def __init__[Event](
        self: EventBus[Event, Event],
        *,
        loop: asyncio.AbstractEventLoop | None = None,
    ) -> None: ...

    @overload
    def __init__(
        self,
        *,
        middleware: Middleware[In, Out],
        loop: asyncio.AbstractEventLoop | None = None,
    ) -> None: ...

    def __init__(
        self,
        *,
        middleware: Middleware[In, Out] | None = None,
        loop: asyncio.AbstractEventLoop | None = None,
    ) -> None:
        self._loop = loop or asyncio.get_running_loop()
        # The loop only keeps weak references to tasks, so this set keeps
        # spawned tasks alive until they finish.
        self._tasks: set[asyncio.Task[object]] = set()

        # Without middleware the overloads make `Out` equal to `In`.
        self._middleware: Middleware[In, Out] = (
            middleware if middleware is not None else cast("Middleware[In, Out]", _identity)
        )
        # Makes the closed check and scheduling in `publish` atomic with
        # `shutdown`, so every accepted event is dispatched before the
        # subscriber queues are shut down.
        self._lock = Lock()
        self._closed = False
        self._sinks: dict[Subscriber[object], _Sink[Out]] = {}

    @property
    def closed(self) -> bool:
        return self._closed

    @overload
    def subscribe(self, *, maxsize: int = 0) -> Subscriber[Out]: ...

    @overload
    def subscribe[T](
        self,
        *,
        middleware: Middleware[Out, T],
        maxsize: int = 0,
    ) -> Subscriber[T]: ...

    def subscribe[T](
        self,
        *,
        middleware: Middleware[Out, T] | None = None,
        maxsize: int = 0,
    ) -> Subscriber[Out] | Subscriber[T]:
        """Start receiving events published from now on.

        With a positive `maxsize`, a full queue drops its oldest event to make
        room for the new one. Raises `EventBusClosedError` once the bus has been
        shut down.
        """
        self._check_loop()
        if self._closed:
            msg = "event bus is shut down"
            raise EventBusClosedError(msg)

        if middleware is None:
            return self._attach(_identity, maxsize)
        return self._attach(middleware, maxsize)

    def publish(self, event: In) -> None:
        """Queue `event` for every subscriber. Safe to call from any thread.

        Delivery happens on the bus's loop, so subscribers see the event on a
        later loop iteration rather than during this call. Raises
        `EventBusClosedError` once the bus has been shut down or its loop has closed.
        """
        with self._lock:
            if self._closed:
                msg = "event bus is shut down"
                raise EventBusClosedError(msg)

            try:
                self._loop.call_soon_threadsafe(self._dispatch, event)
            except RuntimeError as error:
                msg = "event loop is closed"
                raise EventBusClosedError(msg) from error

    def spawn[T](
        self, coro: Coroutine[Never, Never, T], *, name: str | None = None
    ) -> asyncio.Task[T]:
        """Run `coro` as a task owned by the bus, typically a subscriber's consumer.

        `shutdown` waits for these tasks after the subscribers finish, and
        cancels any still running if it is itself cancelled. A task that fails
        is logged without affecting other tasks or the caller. Raises
        `EventBusClosedError` once the bus has been shut down.
        """
        self._check_loop()
        if self._closed:
            coro.close()
            msg = "event bus is shut down"
            raise EventBusClosedError(msg)

        task = self._loop.create_task(coro, name=name)
        self._tasks.add(cast("asyncio.Task[object]", task))
        task.add_done_callback(self._reap)
        return task

    async def drain(self) -> None:
        """Wait until every subscriber has processed every event published so far.

        A subscriber nobody iterates never finishes, so bound this with
        `asyncio.timeout` if that can happen.
        """
        self._check_loop()
        await self._flush()
        await asyncio.gather(*(sink.join() for sink in self._sinks.values()))

    async def shutdown(self) -> None:
        """Stop accepting events, let subscribers finish, then wait for spawned tasks.

        Subscribers keep receiving events published before this call; their
        iteration ends once they have processed all of them. Bound the wait with
        `asyncio.timeout`: if this call is cancelled, undelivered events are
        discarded, all iteration ends immediately, and spawned tasks still
        running are cancelled without waiting for them. Safe to call more than
        once.
        """
        self._check_loop()
        with self._lock:
            self._closed = True

        # A consumer may shut the bus down from inside its own loop. It can't
        # process events while it waits here, so don't wait on its
        # subscriptions (or on its own task); the `finally` closes them.
        current = asyncio.current_task()
        try:
            await self._flush()
            sinks = tuple(self._sinks.values())
            for sink in sinks:
                sink.end(immediate=False)

            await asyncio.gather(*(sink.join() for sink in sinks if sink.consumer is not current))
            # Failures are already logged by `_reap`.
            await asyncio.gather(
                *(task for task in self._tasks if task is not current),
                return_exceptions=True,
            )
        except asyncio.CancelledError:
            logger.warning("Event bus shutdown was cancelled; discarding undelivered events")
            raise
        finally:
            for sink in self._sinks.values():
                sink.end(immediate=True)
            self._sinks.clear()
            for task in self._tasks:
                if task is not current:
                    task.cancel()

    def _attach[T](self, middleware: Middleware[Out, T], maxsize: int) -> Subscriber[T]:
        inbox = _Inbox[T](maxsize)
        subscriber = Subscriber(inbox, self._detach)
        self._sinks[cast("Subscriber[object]", subscriber)] = _Tap(middleware, inbox)
        return subscriber

    def _dispatch(self, event: In) -> None:
        try:
            result = self._middleware(event)
        except Exception:
            logger.exception("Event bus middleware failed; dropping event")
            return

        if result is None:
            return

        for sink in tuple(self._sinks.values()):
            sink.deliver(result)

    async def _flush(self) -> None:
        """Wait until every event accepted so far has been dispatched.

        Loop callbacks run in FIFO order, so this callback runs after every
        `_dispatch` scheduled before it.
        """
        flushed = self._loop.create_future()
        self._loop.call_soon(_resolve, flushed)
        await flushed

    def _reap(self, task: asyncio.Task[object]) -> None:
        self._tasks.discard(task)
        if task.cancelled():
            return

        if (error := task.exception()) is not None:
            logger.error("Event bus task %r failed", task.get_name(), exc_info=error)

    def _detach[T](self, subscriber: Subscriber[T]) -> None:
        self._sinks.pop(cast("Subscriber[object]", subscriber), None)

    def _check_loop(self) -> None:
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None

        if running is not self._loop:
            msg = "EventBus must be used from the event loop it was created on"
            raise RuntimeError(msg)
