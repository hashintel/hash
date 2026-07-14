"""Schedule logical work concurrently and publish a deterministic prefix."""

from collections.abc import Awaitable, Callable, Iterable, Iterator
from dataclasses import dataclass, field
from typing import Literal, Protocol, assert_never

import trio

from atlas_tools.relation.evaluation.domain.api import ConcurrencyConfig
from atlas_tools.relation.evaluation.execution.control import ExecutionControl


@dataclass(frozen=True, slots=True, kw_only=True)
class ExecutionFailure:
    """A structured logical or systemic failure safe to pass across channels."""

    category: Literal["vote", "systemic", "infrastructure"]
    message: str

    def __post_init__(self) -> None:
        if not self.message:
            raise ValueError("execution failure message must not be empty")


@dataclass(frozen=True, slots=True, kw_only=True)
class WorkItem[TaskT]:
    """One logical task at its deterministic plan position."""

    plan_index: int
    task: TaskT

    def __post_init__(self) -> None:
        if self.plan_index < 0:
            raise ValueError("plan_index must not be negative")


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskCompleted[ValueT]:
    """A logical task whose value is ready for ordered commit."""

    value: ValueT


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskDeferred:
    """A vote-local failure eligible for a later pass."""

    failure: ExecutionFailure

    def __post_init__(self) -> None:
        if self.failure.category != "vote":
            raise ValueError("deferred work requires a vote-local failure")


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskFailed:
    """A terminal failure that stops new work and drains authorized calls."""

    failure: ExecutionFailure

    def __post_init__(self) -> None:
        if self.failure.category == "vote":
            raise ValueError("terminal work requires a systemic or infrastructure failure")


@dataclass(frozen=True, slots=True)
class TaskStopped:
    """A peer task that observed the terminal stop before its next paid call."""


type TaskOutcome[ValueT] = TaskCompleted[ValueT] | TaskDeferred | TaskFailed | TaskStopped


class TaskRunner[TaskT, ValueT](Protocol):
    """Execute one logical task while honoring the shared paid-call control."""

    async def __call__(
        self,
        item: WorkItem[TaskT],
        control: ExecutionControl,
        /,
    ) -> TaskOutcome[ValueT]: ...


type CommitCallback[ValueT] = Callable[[int, ValueT], Awaitable[None]]


class ExecutionFailedError(RuntimeError):
    """The earliest terminal task failure after authorized calls drained."""

    def __init__(self, *, plan_index: int, failure: ExecutionFailure) -> None:
        super().__init__(failure.message)
        self.plan_index = plan_index
        self.failure = failure


class ExecutionStalledError(RuntimeError):
    """Deferred work completed a full pass without one successful task."""

    def __init__(self, failures: tuple[tuple[int, ExecutionFailure], ...]) -> None:
        first_index, first_failure = failures[0]
        super().__init__(
            f"{len(failures)} deferred tasks made no progress; "
            f"first at plan index {first_index}: {first_failure.message}"
        )
        self.failures = failures


@dataclass(frozen=True, slots=True, kw_only=True)
class _WorkerEvent[TaskT, ValueT]:
    item: WorkItem[TaskT]
    outcome: TaskOutcome[ValueT]


@dataclass(slots=True)
class _WorkStream[TaskT]:
    iterator: Iterator[WorkItem[TaskT]]
    expected_index: int
    validate_order: bool = True
    staged: WorkItem[TaskT] | None = None
    exhausted: bool = False

    def take(self) -> WorkItem[TaskT] | None:
        if self.staged is None and not self.exhausted:
            self.staged = next(self.iterator, None)
            self.exhausted = self.staged is None

        item = self.staged
        self.staged = None
        if item is not None and self.validate_order:
            if item.plan_index != self.expected_index:
                raise ValueError(
                    f"plan index {item.plan_index} appeared where "
                    f"{self.expected_index} was expected"
                )
            self.expected_index += 1

        return item


@dataclass(slots=True)
class _Coordinator[TaskT, ValueT]:
    work: _WorkStream[TaskT]
    control: ExecutionControl
    commit: CommitCallback[ValueT]
    dispatch_limit: int
    maximum: int
    next_commit: int
    outstanding: int = 0
    successes_since_ramp: int = 0
    successes_this_pass: int = 0
    buffered: dict[int, ValueT] = field(default_factory=dict)
    deferred: dict[int, tuple[WorkItem[TaskT], ExecutionFailure]] = field(default_factory=dict)
    failures: dict[int, ExecutionFailure] = field(default_factory=dict)
    stopped: set[int] = field(default_factory=set)
    committed: list[ValueT] = field(default_factory=list)
    stalled: ExecutionStalledError | None = None

    async def dispatch(self, send: trio.MemorySendChannel[WorkItem[TaskT]]) -> None:
        while not self.control.is_stopped and self.outstanding < self.dispatch_limit:
            item = self.work.take()
            if item is None:
                return
            await send.send(item)
            self.outstanding += 1

    async def record(self, event: _WorkerEvent[TaskT, ValueT]) -> None:
        self.outstanding -= 1
        if self.outstanding < 0:
            raise RuntimeError("worker outcomes exceeded dispatched work")

        index = event.item.plan_index
        outcome = event.outcome
        if isinstance(outcome, TaskCompleted):
            if index in self.buffered:
                raise RuntimeError(f"duplicate completion for plan index {index}")
            self.buffered[index] = outcome.value
            self.successes_since_ramp += 1
            self.successes_this_pass += 1
        elif isinstance(outcome, TaskDeferred):
            if index in self.deferred:
                raise RuntimeError(f"duplicate deferral for plan index {index}")
            self.deferred[index] = (event.item, outcome.failure)
        elif isinstance(outcome, TaskFailed):
            self.failures.setdefault(index, outcome.failure)
            await self.control.stop(outcome.failure.message)
        elif isinstance(outcome, TaskStopped):
            self.stopped.add(index)
        else:
            assert_never(outcome)

        await self._commit_ready()
        if (
            not self.control.is_stopped
            and self.dispatch_limit < self.maximum
            and self.successes_since_ramp >= self.dispatch_limit
        ):
            self.dispatch_limit = min(self.dispatch_limit * 2, self.maximum)
            self.successes_since_ramp = 0

    async def _commit_ready(self) -> None:
        while self.next_commit in self.buffered:
            value = self.buffered.pop(self.next_commit)
            await self.commit(self.next_commit, value)
            self.committed.append(value)
            self.next_commit += 1

    def begin_deferred_pass(self) -> bool:
        if not self.work.exhausted or self.outstanding:
            return False

        if not self.deferred:
            return False

        if self.successes_this_pass == 0:
            failures = tuple(
                (index, failure) for index, (_, failure) in sorted(self.deferred.items())
            )

            self.stalled = ExecutionStalledError(failures)
            return False

        items = tuple(item for item, _ in (self.deferred[index] for index in sorted(self.deferred)))
        self.deferred.clear()
        self.work = _WorkStream(iter(items), self.work.expected_index, validate_order=False)
        self.successes_this_pass = 0

        return True


async def _worker[TaskT, ValueT](
    runner: TaskRunner[TaskT, ValueT],
    control: ExecutionControl,
    receive: trio.MemoryReceiveChannel[WorkItem[TaskT]],
    send: trio.MemorySendChannel[_WorkerEvent[TaskT, ValueT]],
) -> None:
    try:
        async with receive, send:
            async for item in receive:
                outcome = await runner(item, control)
                await send.send(_WorkerEvent(item=item, outcome=outcome))
    except BaseException as error:
        await control.stop(str(error) or type(error).__qualname__)
        raise


async def _discard_commit[ValueT](_plan_index: int, _value: ValueT) -> None:
    return None


async def _coordinate[TaskT, ValueT](
    coordinator: _Coordinator[TaskT, ValueT],
    command_send: trio.MemorySendChannel[WorkItem[TaskT]],
    event_receive: trio.MemoryReceiveChannel[_WorkerEvent[TaskT, ValueT]],
) -> None:
    while True:
        await coordinator.dispatch(command_send)

        if coordinator.outstanding:
            await coordinator.record(await event_receive.receive())
            continue

        if coordinator.control.is_stopped:
            return

        if coordinator.begin_deferred_pass():
            continue

        if coordinator.work.exhausted:
            return


async def execute_ordered[TaskT, ValueT](
    items: Iterable[WorkItem[TaskT]],
    *,
    runner: TaskRunner[TaskT, ValueT],
    concurrency: ConcurrencyConfig,
    start_index: int = 0,
    commit: CommitCallback[ValueT] = _discard_commit,
    control: ExecutionControl | None = None,
) -> tuple[ValueT, ...]:
    """Execute a contiguous plan and commit successful values in plan order.

    At most `concurrency.maximum` workers and logical tasks are active. Vote-local
    failures re-enter the plan in ascending index order after the current pass
    drains. A pass with no successes raises `ExecutionStalledError`. Systemic
    failures stop new dispatch, wake retry waits, and drain work that already
    crossed its paid-request boundary before `ExecutionFailedError` is raised.

    Unexpected worker exceptions preserve their traceback through Trio's
    nursery. The caller's commit callback is awaited exactly once for every
    value in the durable prefix.

    Raises:
        ValueError: Plan indexes are negative, duplicated, or non-contiguous.
        ExecutionFailedError: A task reports a systemic or infrastructure failure.
        ExecutionStalledError: A complete deferred pass makes no progress.
    """
    if start_index < 0:
        raise ValueError("start_index must not be negative")

    shared_control = control or ExecutionControl()
    coordinator = _Coordinator(
        work=_WorkStream(iter(items), start_index),
        control=shared_control,
        commit=commit,
        dispatch_limit=concurrency.initial,
        maximum=concurrency.maximum,
        next_commit=start_index,
    )

    command_send, command_receive = trio.open_memory_channel[WorkItem[TaskT]](concurrency.maximum)
    event_send, event_receive = trio.open_memory_channel[_WorkerEvent[TaskT, ValueT]](
        concurrency.maximum
    )

    try:
        async with trio.open_nursery() as nursery:
            for _worker_id in range(concurrency.maximum):
                nursery.start_soon(
                    _worker,
                    runner,
                    shared_control,
                    command_receive.clone(),
                    event_send.clone(),
                )

            command_receive.close()
            event_send.close()

            async with command_send, event_receive:
                await _coordinate(coordinator, command_send, event_receive)

            command_send.close()
    except BaseException as error:
        await shared_control.stop(str(error) or type(error).__qualname__)
        raise

    if coordinator.failures:
        index = min(coordinator.failures)
        raise ExecutionFailedError(plan_index=index, failure=coordinator.failures[index])

    if coordinator.stalled is not None:
        raise coordinator.stalled

    if coordinator.stopped:
        raise RuntimeError("work stopped without a causal terminal failure")

    if coordinator.deferred:
        failures = tuple(
            (index, failure) for index, (_, failure) in sorted(coordinator.deferred.items())
        )
        raise ExecutionStalledError(failures)

    return tuple(coordinator.committed)
