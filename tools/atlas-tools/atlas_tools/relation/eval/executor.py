"""Concurrent, resumable Trio execution for relation-evaluation vote plans."""

from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path
from typing import assert_never

import outcome
import trio

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.eval.accounting import CostGate
from atlas_tools.relation.eval.contract import BaseRunConfig, PreparedCards, VotePlan, VoteTask
from atlas_tools.relation.eval.control import ExecutionControl, ExecutionStoppedError
from atlas_tools.relation.eval.journal import JournalPaths, append_jsonl
from atlas_tools.relation.eval.resume import PendingWork, load_resumable_journals
from atlas_tools.relation.eval.schema import PhysicalAttemptRow, VoteRow
from atlas_tools.relation.eval.transport import (
    CompletionTransport,
    CompletionTransportFactory,
    OpenRouterTransportFactory,
)
from atlas_tools.relation.eval.vote import execute_logical_vote

_EXECUTION_PHASE = "Executing relation-evaluation votes"


@dataclass(frozen=True)
class ExecuteVoteCommand:
    plan_index: int
    task: VoteTask
    attempts: tuple[PhysicalAttemptRow, ...]


@dataclass(frozen=True)
class StopWorkerCommand:
    """Retire one worker after its current logical vote, if any, completes."""


type WorkerCommand = ExecuteVoteCommand | StopWorkerCommand


@dataclass(frozen=True)
class VoteCompleted:
    plan_index: int
    vote: VoteRow


@dataclass(frozen=True)
class VoteFailed:
    plan_index: int
    error: Exception


@dataclass(frozen=True)
class VoteStopped:
    """A non-causal peer stop before another logical vote could complete."""

    plan_index: int


@dataclass(frozen=True)
class WorkerStopped:
    worker_id: int
    close_error: Exception | None


type VoteOutcome = VoteCompleted | VoteFailed | VoteStopped
type WorkerEvent = VoteOutcome | WorkerStopped


@dataclass(frozen=True)
class _ExecutionRequest:
    paths: JournalPaths
    prepared: PreparedCards
    config: BaseRunConfig
    plan: VotePlan
    transport_factory: CompletionTransportFactory | None
    transport: CompletionTransport | None
    progress: ProgressReporter
    execution_control: ExecutionControl


@dataclass(frozen=True)
class _TransportLease:
    transport: CompletionTransport
    close: Callable[[], None] | None


@dataclass(frozen=True)
class _TransportSource:
    factory: CompletionTransportFactory | None
    injected: CompletionTransport | None

    def create(self, worker_id: int) -> _TransportLease:
        if self.injected is not None:
            if worker_id != 0:
                raise RuntimeError("an injected transport can only be leased to worker zero")
            return _TransportLease(self.injected, None)
        if self.factory is None:
            raise RuntimeError("executor transport source has no factory")
        transport = self.factory()
        return _TransportLease(transport, transport.close)


@dataclass
class _WorkSource:
    iterator: Iterator[ExecuteVoteCommand]
    staged: ExecuteVoteCommand | None = None
    exhausted: bool = False

    def has_more(self) -> bool:
        if self.staged is not None:
            return True
        if self.exhausted:
            return False
        self.staged = next(self.iterator, None)
        self.exhausted = self.staged is None
        return not self.exhausted

    def take(self) -> ExecuteVoteCommand | None:
        if not self.has_more():
            return None
        command = self.staged
        self.staged = None
        return command


@dataclass
class _DispatchState:
    worker_limit: int
    maximum_workers: int
    execution_control: ExecutionControl
    active_workers: int = 0
    next_worker_id: int = 0
    outstanding_votes: int = 0
    successful_since_ramp: int = 0
    stopped: bool = False
    infrastructure_error: Exception | None = None

    def stop(self) -> None:
        self.execution_control.stop()
        self.stopped = True

    def stop_for(self, error: Exception) -> None:
        self.stop()
        if self.infrastructure_error is None:
            self.infrastructure_error = error


@dataclass
class _CommitState:
    votes: list[VoteRow]
    next_plan_index: int
    buffered: dict[int, VoteOutcome] = field(default_factory=dict)
    failures: dict[int, Exception] = field(default_factory=dict)

    def remember(self, event: VoteOutcome) -> None:
        if event.plan_index in self.buffered:
            raise RuntimeError(f"duplicate worker outcome for plan index {event.plan_index}")
        self.buffered[event.plan_index] = event
        if isinstance(event, VoteFailed):
            self.failures[event.plan_index] = event.error


def _normal_exception(captured: outcome.Error) -> Exception:
    error = captured.error
    if isinstance(error, Exception):
        return error
    raise error


def _capture_vote(
    command: ExecuteVoteCommand,
    request: _ExecutionRequest,
    transport: CompletionTransport,
    cost_gate: CostGate,
) -> VoteOutcome:
    completed = outcome.capture(
        execute_logical_vote,
        command.task,
        command.attempts,
        paths=request.paths,
        prepared=request.prepared,
        transport=transport,
        timeout=request.config.request_timeout,
        retry_policy=request.config.transient_retries,
        cost_gate=cost_gate,
        execution_control=request.execution_control,
    )
    if isinstance(completed, outcome.Error):
        error = _normal_exception(completed)
        if isinstance(error, ExecutionStoppedError):
            return VoteStopped(command.plan_index)
        request.execution_control.stop()
        return VoteFailed(command.plan_index, error)
    return VoteCompleted(command.plan_index, completed.value)


def _capture_close(close: Callable[[], None]) -> Exception | None:
    closed = outcome.capture(close)
    return _normal_exception(closed) if isinstance(closed, outcome.Error) else None


async def _worker(
    *,
    worker_id: int,
    lease: _TransportLease,
    commands: trio.MemoryReceiveChannel[WorkerCommand],
    events: trio.MemorySendChannel[WorkerEvent],
    request: _ExecutionRequest,
    cost_gate: CostGate,
    call_limiter: trio.CapacityLimiter,
) -> None:
    async with commands, events:
        normal_retirement = False
        close_error: Exception | None = None
        try:
            async for command in commands:
                match command:
                    case StopWorkerCommand():
                        break
                    case ExecuteVoteCommand():
                        event = await trio.to_thread.run_sync(
                            partial(_capture_vote, command, request, lease.transport, cost_gate),
                            abandon_on_cancel=False,
                            limiter=call_limiter,
                        )
                        await events.send(event)
                    case unexpected:
                        assert_never(unexpected)
            normal_retirement = True
        finally:
            if lease.close is not None:
                with trio.CancelScope(shield=True):
                    close_error = await trio.to_thread.run_sync(
                        partial(_capture_close, lease.close),
                        abandon_on_cancel=False,
                        limiter=call_limiter,
                    )
        if normal_retirement:
            await events.send(WorkerStopped(worker_id, close_error))


def _planned_commands(pending: PendingWork) -> Iterator[ExecuteVoteCommand]:
    for work in pending.attempted_votes:
        yield ExecuteVoteCommand(work.plan_index, work.task, work.attempts)
    plan_index = pending.committed_vote_count + len(pending.attempted_votes)
    for task in pending.take_unstarted_tasks():
        yield ExecuteVoteCommand(plan_index, task, ())
        plan_index += 1


def _transport_source(request: _ExecutionRequest) -> _TransportSource:
    if request.transport is not None:
        return _TransportSource(None, request.transport)
    factory = request.transport_factory or OpenRouterTransportFactory.from_environment()
    return _TransportSource(factory, None)


async def _spawn_workers(
    *,
    target: int,
    state: _DispatchState,
    source: _TransportSource,
    nursery: trio.Nursery,
    command_receive: trio.MemoryReceiveChannel[WorkerCommand],
    event_send: trio.MemorySendChannel[WorkerEvent],
    request: _ExecutionRequest,
    cost_gate: CostGate,
    call_limiter: trio.CapacityLimiter,
) -> None:
    while state.active_workers < target and not state.stopped:
        worker_id = state.next_worker_id
        created = outcome.capture(source.create, worker_id)
        if isinstance(created, outcome.Error):
            state.stop_for(_normal_exception(created))
            return
        state.next_worker_id += 1
        state.active_workers += 1
        nursery.start_soon(
            partial(
                _worker,
                worker_id=worker_id,
                lease=created.value,
                commands=command_receive.clone(),
                events=event_send.clone(),
                request=request,
                cost_gate=cost_gate,
                call_limiter=call_limiter,
            )
        )


async def _dispatch_available(
    state: _DispatchState,
    work: _WorkSource,
    command_send: trio.MemorySendChannel[WorkerCommand],
) -> None:
    while not state.stopped and state.outstanding_votes < state.worker_limit:
        try:
            command = work.take()
        except (RuntimeError, ValueError) as error:
            state.stop_for(error)
            return
        if command is None:
            return
        await command_send.send(command)
        state.outstanding_votes += 1


def _capture_append_vote(path: Path, vote: VoteRow) -> Exception | None:
    appended = outcome.capture(append_jsonl, path, vote)
    return _normal_exception(appended) if isinstance(appended, outcome.Error) else None


async def _commit_ready(
    state: _CommitState,
    paths: JournalPaths,
    progress: ProgressReporter,
) -> Exception | None:
    while True:
        prior_error = state.failures.get(state.next_plan_index)
        if prior_error is not None:
            return prior_error
        event = state.buffered.get(state.next_plan_index)
        if event is None:
            return None
        if isinstance(event, VoteFailed):
            return event.error
        if isinstance(event, VoteStopped):
            return None
        append_error = await trio.to_thread.run_sync(
            partial(_capture_append_vote, paths.votes_jsonl, event.vote),
            abandon_on_cancel=False,
        )
        if append_error is not None:
            state.failures[state.next_plan_index] = append_error
            return append_error
        state.buffered.pop(state.next_plan_index)
        state.votes.append(event.vote)
        state.next_plan_index += 1
        progress.advance()


async def _maybe_ramp(
    *,
    state: _DispatchState,
    work: _WorkSource,
    source: _TransportSource,
    nursery: trio.Nursery,
    command_receive: trio.MemoryReceiveChannel[WorkerCommand],
    event_send: trio.MemorySendChannel[WorkerEvent],
    request: _ExecutionRequest,
    cost_gate: CostGate,
    call_limiter: trio.CapacityLimiter,
) -> None:
    if (
        state.stopped
        or state.worker_limit >= state.maximum_workers
        or state.successful_since_ramp < state.worker_limit
    ):
        return
    try:
        has_more_work = work.has_more()
    except (RuntimeError, ValueError) as error:
        state.stop_for(error)
        return
    if not has_more_work:
        return
    target = min(state.worker_limit * 2, state.maximum_workers)
    await _spawn_workers(
        target=target,
        state=state,
        source=source,
        nursery=nursery,
        command_receive=command_receive,
        event_send=event_send,
        request=request,
        cost_gate=cost_gate,
        call_limiter=call_limiter,
    )
    if not state.stopped:
        state.worker_limit = target
        state.successful_since_ramp = 0


def _record_worker_event(
    event: WorkerEvent,
    dispatch: _DispatchState,
    commits: _CommitState,
) -> bool:
    if isinstance(event, WorkerStopped):
        dispatch.stop_for(RuntimeError(f"worker {event.worker_id} stopped before retirement"))
        if event.close_error is not None:
            dispatch.stop_for(event.close_error)
        return False
    dispatch.outstanding_votes -= 1
    if dispatch.outstanding_votes < 0:
        dispatch.stop_for(RuntimeError("worker outcomes exceeded dispatched logical votes"))
        return False
    commits.remember(event)
    if isinstance(event, VoteFailed):
        dispatch.stop()
        return False
    if isinstance(event, VoteStopped):
        dispatch.stop()
        return False
    dispatch.successful_since_ramp += 1
    return True


async def _retire_workers(
    state: _DispatchState,
    command_send: trio.MemorySendChannel[WorkerCommand],
    event_receive: trio.MemoryReceiveChannel[WorkerEvent],
) -> None:
    worker_count = state.active_workers
    for _worker_index in range(worker_count):
        await command_send.send(StopWorkerCommand())
    stopped: set[int] = set()
    close_errors: dict[int, Exception] = {}
    while len(stopped) < worker_count:
        event = await event_receive.receive()
        if not isinstance(event, WorkerStopped):
            state.stop_for(RuntimeError("received a vote outcome after the dispatch drain"))
        elif event.worker_id in stopped:
            state.stop_for(RuntimeError(f"worker {event.worker_id} reported retirement twice"))
        else:
            stopped.add(event.worker_id)
            if event.close_error is not None:
                close_errors[event.worker_id] = event.close_error
    state.active_workers = 0
    if close_errors:
        state.stop_for(close_errors[min(close_errors)])


def _raise_execution_error(commits: _CommitState, dispatch: _DispatchState) -> None:
    if commits.failures:
        raise commits.failures[min(commits.failures)]
    if dispatch.infrastructure_error is not None:
        raise dispatch.infrastructure_error


async def _run_worker_pool(
    request: _ExecutionRequest,
    source: _TransportSource,
    work: _WorkSource,
    cost_gate: CostGate,
    commits: _CommitState,
) -> None:
    maximum = request.config.concurrency.maximum
    call_limiter = trio.CapacityLimiter(maximum)
    command_send, command_receive = trio.open_memory_channel[WorkerCommand](maximum)
    event_send, event_receive = trio.open_memory_channel[WorkerEvent](maximum)
    dispatch = _DispatchState(
        request.config.concurrency.initial,
        maximum,
        request.execution_control,
    )
    async with (
        command_send,
        command_receive,
        event_send,
        event_receive,
        trio.open_nursery() as nursery,
    ):
        await _spawn_workers(
            target=dispatch.worker_limit,
            state=dispatch,
            source=source,
            nursery=nursery,
            command_receive=command_receive,
            event_send=event_send,
            request=request,
            cost_gate=cost_gate,
            call_limiter=call_limiter,
        )
        await _dispatch_available(dispatch, work, command_send)
        while dispatch.outstanding_votes:
            event = await event_receive.receive()
            completed = _record_worker_event(event, dispatch, commits)
            if await _commit_ready(commits, request.paths, request.progress) is not None:
                dispatch.stop()
            if completed and not dispatch.stopped:
                await _maybe_ramp(
                    state=dispatch,
                    work=work,
                    source=source,
                    nursery=nursery,
                    command_receive=command_receive,
                    event_send=event_send,
                    request=request,
                    cost_gate=cost_gate,
                    call_limiter=call_limiter,
                )
            await _dispatch_available(dispatch, work, command_send)
        await _retire_workers(dispatch, command_send, event_receive)
    _raise_execution_error(commits, dispatch)


async def _execute_plan_async(request: _ExecutionRequest) -> list[VoteRow]:
    request.progress.phase(_EXECUTION_PHASE, total=request.plan.expected_votes)
    journals = await trio.to_thread.run_sync(
        partial(
            load_resumable_journals,
            paths=request.paths,
            prepared=request.prepared,
            plan=request.plan,
            timeout=request.config.request_timeout,
        ),
        abandon_on_cancel=False,
    )
    if journals.pending.committed_vote_count:
        request.progress.advance(journals.pending.committed_vote_count)
    work = _WorkSource(_planned_commands(journals.pending))
    if not work.has_more():
        if len(journals.votes) != request.plan.expected_votes:
            raise ValueError(
                f"completed {len(journals.votes)} votes, expected {request.plan.expected_votes}"
            )
        return journals.votes

    commits = _CommitState(list(journals.votes), journals.pending.committed_vote_count)
    try:
        await _run_worker_pool(
            request,
            _transport_source(request),
            work,
            CostGate.from_attempts(
                maximum_usd=request.config.max_cost_usd,
                attempts=journals.attempts,
            ),
            commits,
        )
    except BaseException:
        request.execution_control.stop()
        raise
    if work.has_more() or len(commits.votes) != request.plan.expected_votes:
        raise ValueError(
            f"completed {len(commits.votes)} votes, expected {request.plan.expected_votes}"
        )
    return commits.votes


def execute_plan(
    *,
    paths: JournalPaths,
    prepared: PreparedCards,
    config: BaseRunConfig,
    plan: VotePlan,
    transport_factory: CompletionTransportFactory | None = None,
    transport: CompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> list[VoteRow]:
    """Execute or resume a plan with durable ordered commits and bounded concurrency."""
    if transport_factory is not None and transport is not None:
        raise ValueError("pass transport_factory or transport, not both")
    if transport is not None and config.concurrency.maximum != 1:
        raise ValueError("a single injected transport requires concurrency.maximum == 1")
    return trio.run(
        _execute_plan_async,
        _ExecutionRequest(
            paths,
            prepared,
            config,
            plan,
            transport_factory,
            transport,
            progress,
            ExecutionControl(),
        ),
    )
