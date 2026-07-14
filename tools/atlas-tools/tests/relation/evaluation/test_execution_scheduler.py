from dataclasses import dataclass, field

import pytest
import trio

from atlas_tools.relation.evaluation.domain.api import ConcurrencyConfig, JudgeFamilyId
from atlas_tools.relation.evaluation.execution import scheduler as scheduler_module
from atlas_tools.relation.evaluation.execution.api import (
    ExecutionControl,
    ExecutionFailedError,
    ExecutionFailure,
    ExecutionStalledError,
    ExecutionStoppedError,
    FamilySerialiser,
    TaskCompleted,
    TaskDeferred,
    TaskFailed,
    TaskOutcome,
    TaskStopped,
    WorkItem,
    execute_ordered,
)


@dataclass(slots=True)
class ReorderingRunner:
    active: int = 0
    maximum_active: int = 0
    completion_order: list[int] = field(default_factory=list)

    async def __call__(
        self,
        item: WorkItem[int],
        _control: ExecutionControl,
    ) -> TaskOutcome[int]:
        self.active += 1
        self.maximum_active = max(self.maximum_active, self.active)
        await trio.sleep(0.03 if item.plan_index == 1 else 0.005)
        self.active -= 1
        self.completion_order.append(item.plan_index)
        return TaskCompleted(value=item.task)


def test_ramp_stays_bounded_and_commits_out_of_order_results_in_plan_order() -> None:
    async def scenario() -> None:
        runner = ReorderingRunner()
        commits: list[tuple[int, int]] = []

        async def commit(plan_index: int, value: int) -> None:
            commits.append((plan_index, value))

        values = await execute_ordered(
            (WorkItem(plan_index=index, task=index) for index in range(10)),
            runner=runner,
            concurrency=ConcurrencyConfig(initial=1, maximum=4),
            commit=commit,
        )

        assert values == tuple(range(10))
        assert commits == [(index, index) for index in range(10)]
        assert runner.completion_order.index(2) < runner.completion_order.index(1)
        assert runner.maximum_active == 4

    trio.run(scenario)


@dataclass(slots=True)
class DeferredOnceRunner:
    calls: list[int] = field(default_factory=list)
    first_deferred: bool = False

    async def __call__(
        self,
        item: WorkItem[int],
        _control: ExecutionControl,
    ) -> TaskOutcome[int]:
        self.calls.append(item.plan_index)
        if item.plan_index == 0 and not self.first_deferred:
            self.first_deferred = True
            return TaskDeferred(
                failure=ExecutionFailure(category="vote", message="temporary malformed output")
            )
        return TaskCompleted(value=item.task)


def test_vote_local_failure_repasses_after_the_current_stream_drains() -> None:
    async def scenario() -> None:
        runner = DeferredOnceRunner()
        values = await execute_ordered(
            (WorkItem(plan_index=index, task=index) for index in range(3)),
            runner=runner,
            concurrency=ConcurrencyConfig(initial=1, maximum=1),
        )

        assert runner.calls == [0, 1, 2, 0]
        assert values == (0, 1, 2)

    trio.run(scenario)


@dataclass(slots=True)
class FatalDrainRunner:
    peer_started: trio.Event
    peer_drained: trio.Event
    starts: list[tuple[int, int]] = field(default_factory=list)

    async def __call__(
        self,
        item: WorkItem[int],
        control: ExecutionControl,
    ) -> TaskOutcome[int]:
        if item.plan_index == 1:
            await self.peer_started.wait()
            return TaskFailed(
                failure=ExecutionFailure(category="systemic", message="billing disabled")
            )

        async def begin_initial() -> None:
            self.starts.append((item.plan_index, 0))

        async with control.paid_request(begin_initial):
            self.peer_started.set()
            while not control.is_stopped:
                await trio.lowlevel.checkpoint()
            self.peer_drained.set()

        async def begin_repair() -> None:
            self.starts.append((item.plan_index, 1))

        try:
            async with control.paid_request(begin_repair):
                raise AssertionError("a peer repair crossed the terminal stop")
        except ExecutionStoppedError:
            return TaskStopped()


def test_systemic_failure_drains_authorized_call_and_denies_peer_repair() -> None:
    async def scenario() -> None:
        runner = FatalDrainRunner(peer_started=trio.Event(), peer_drained=trio.Event())
        with pytest.raises(ExecutionFailedError, match="billing disabled") as raised:
            await execute_ordered(
                (WorkItem(plan_index=index, task=index) for index in range(2)),
                runner=runner,
                concurrency=ConcurrencyConfig(initial=2, maximum=2),
            )

        assert raised.value.plan_index == 1
        assert runner.peer_drained.is_set()
        assert runner.starts == [(0, 0)]

    trio.run(scenario)


@dataclass(slots=True)
class QueuedAfterFailureRunner:
    starts: list[int] = field(default_factory=list)

    async def __call__(
        self,
        item: WorkItem[int],
        control: ExecutionControl,
    ) -> TaskOutcome[int]:
        if item.plan_index == 0:
            return TaskFailed(
                failure=ExecutionFailure(category="systemic", message="billing disabled")
            )

        async def begin() -> None:
            self.starts.append(item.plan_index)

        try:
            async with control.paid_request(begin):
                return TaskCompleted(value=item.task)
        except ExecutionStoppedError:
            return TaskStopped()


def test_worker_stops_before_a_terminal_event_can_release_queued_paid_work() -> None:
    async def scenario() -> None:
        runner = QueuedAfterFailureRunner()
        control = ExecutionControl()
        command_send, command_receive = trio.open_memory_channel[WorkItem[int]](2)
        event_send, event_receive = trio.open_memory_channel[
            scheduler_module._WorkerEvent[int, int]
        ](2)
        command_send.send_nowait(WorkItem(plan_index=0, task=0))
        command_send.send_nowait(WorkItem(plan_index=1, task=1))
        command_send.close()

        await scheduler_module._worker(runner, control, command_receive, event_send)

        first = event_receive.receive_nowait()
        second = event_receive.receive_nowait()
        assert isinstance(first.outcome, TaskFailed)
        assert isinstance(second.outcome, TaskStopped)
        assert control.reason == "billing disabled"
        assert runner.starts == []

    trio.run(scenario)


def test_family_lanes_serialize_one_family_without_serializing_the_run() -> None:
    async def scenario() -> None:
        serialiser = FamilySerialiser()
        active_by_family: dict[str, int] = {}
        maximum_by_family: dict[str, int] = {}
        active_total = 0
        maximum_total = 0

        async def runner(
            item: WorkItem[str],
            _control: ExecutionControl,
        ) -> TaskOutcome[int]:
            nonlocal active_total, maximum_total
            async with serialiser.hold(JudgeFamilyId(item.task)):
                active_by_family[item.task] = active_by_family.get(item.task, 0) + 1
                maximum_by_family[item.task] = max(
                    maximum_by_family.get(item.task, 0), active_by_family[item.task]
                )
                active_total += 1
                maximum_total = max(maximum_total, active_total)
                await trio.sleep(0.01)
                active_total -= 1
                active_by_family[item.task] -= 1
            return TaskCompleted(value=item.plan_index)

        families = ("alpha", "alpha", "beta", "beta")
        await execute_ordered(
            (WorkItem(plan_index=index, task=family) for index, family in enumerate(families)),
            runner=runner,
            concurrency=ConcurrencyConfig(initial=4, maximum=4),
        )

        assert maximum_by_family == {"alpha": 1, "beta": 1}
        assert maximum_total == 2

    trio.run(scenario)


def test_no_progress_pass_reports_every_deferred_failure() -> None:
    async def scenario() -> None:
        async def runner(
            item: WorkItem[int],
            _control: ExecutionControl,
        ) -> TaskOutcome[int]:
            return TaskDeferred(
                failure=ExecutionFailure(
                    category="vote",
                    message=f"card {item.task} remains unavailable",
                )
            )

        with pytest.raises(ExecutionStalledError) as raised:
            await execute_ordered(
                (WorkItem(plan_index=index, task=index) for index in range(3)),
                runner=runner,
                concurrency=ConcurrencyConfig(initial=3, maximum=3),
            )

        assert tuple(index for index, _failure in raised.value.failures) == (0, 1, 2)
        assert "3 deferred tasks made no progress" in str(raised.value)

    trio.run(scenario)


def test_cancellation_waits_for_an_authorized_paid_call_to_finish() -> None:
    async def scenario() -> None:
        control = ExecutionControl()
        started = trio.Event()
        release = trio.Event()
        finished = trio.Event()

        async def paid_call() -> None:
            async def begin() -> None:
                started.set()

            async with control.paid_request(begin):
                await release.wait()
            finished.set()

        async with trio.open_nursery() as nursery:
            nursery.start_soon(paid_call)
            await started.wait()
            with trio.CancelScope(shield=True):
                nursery.cancel_scope.cancel()
                await trio.lowlevel.checkpoint()
                release.set()

        assert finished.is_set()

    trio.run(scenario)
