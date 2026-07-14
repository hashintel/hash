from dataclasses import dataclass, field

import trio
from trio.testing import wait_all_tasks_blocked

from atlas_tools.relation.evaluation.domain.api import ConcurrencyConfig
from atlas_tools.relation.evaluation.execution.api import (
    ExecutionControl,
    FamilySerialiser,
    TaskCompleted,
    TaskOutcome,
    WorkItem,
    execute_ordered,
)


def test_same_family_overlaps_after_a_successful_ramp() -> None:
    async def scenario() -> None:
        families = FamilySerialiser(maximum=4)

        async with families.hold("alpha") as permit:
            permit.succeeded()

        entered = tuple(trio.Event() for _ in range(3))
        release = trio.Event()

        async def exchange(index: int) -> None:
            async with families.hold("alpha") as permit:
                entered[index].set()
                await release.wait()
                permit.succeeded()

        async with trio.open_nursery() as nursery:
            for index in range(3):
                nursery.start_soon(exchange, index)

            await wait_all_tasks_blocked()
            assert sum(event.is_set() for event in entered) == 2
            release.set()

    trio.run(scenario)


def test_family_windows_ramp_independently() -> None:
    async def scenario() -> None:
        families = FamilySerialiser(maximum=2)
        alpha_entered = trio.Event()
        alpha_peer_entered = trio.Event()
        alpha_release = trio.Event()
        beta_entered = (trio.Event(), trio.Event())
        beta_release = trio.Event()

        async def alpha_exchange(entered: trio.Event) -> None:
            async with families.hold("alpha") as permit:
                entered.set()
                await alpha_release.wait()
                permit.succeeded()

        async def beta_exchange(index: int) -> None:
            async with families.hold("beta") as permit:
                beta_entered[index].set()
                await beta_release.wait()
                permit.succeeded()

        async with trio.open_nursery() as nursery:
            nursery.start_soon(alpha_exchange, alpha_entered)
            await alpha_entered.wait()

            async with families.hold("beta") as permit:
                permit.succeeded()

            nursery.start_soon(alpha_exchange, alpha_peer_entered)
            nursery.start_soon(beta_exchange, 0)
            nursery.start_soon(beta_exchange, 1)
            await wait_all_tasks_blocked()

            assert not alpha_peer_entered.is_set()
            assert all(event.is_set() for event in beta_entered)
            beta_release.set()
            alpha_release.set()

    trio.run(scenario)


def test_rate_limit_resets_only_its_family_and_stale_successes_cannot_reramp() -> None:
    async def scenario() -> None:
        families = FamilySerialiser(maximum=4)

        # One success opens width two; two more successful exchanges open four.
        for _ in range(3):
            async with families.hold("alpha") as permit:
                permit.succeeded()

        entered = tuple(trio.Event() for _ in range(4))
        finish = tuple(trio.Event() for _ in range(4))
        finished = tuple(trio.Event() for _ in range(4))

        async def old_exchange(index: int) -> None:
            async with families.hold("alpha") as permit:
                entered[index].set()
                await finish[index].wait()
                if index == 0:
                    permit.failed(rate_limited=True)
                else:
                    permit.succeeded()
            finished[index].set()

        newcomer_entered = trio.Event()
        newcomer_release = trio.Event()

        async def newcomer() -> None:
            async with families.hold("alpha") as permit:
                newcomer_entered.set()
                await newcomer_release.wait()
                permit.succeeded()

        async with trio.open_nursery() as nursery:
            for index in range(4):
                nursery.start_soon(old_exchange, index)
            for event in entered:
                await event.wait()

            finish[0].set()
            await finished[0].wait()
            nursery.start_soon(newcomer)
            await wait_all_tasks_blocked()
            assert not newcomer_entered.is_set()

            # These successes were admitted before the 429 and cannot count
            # toward a post-reset ramp.
            for index in (1, 2):
                finish[index].set()
                await finished[index].wait()
                await wait_all_tasks_blocked()
                assert not newcomer_entered.is_set()

            finish[3].set()
            await newcomer_entered.wait()
            newcomer_release.set()

    trio.run(scenario)


@dataclass(slots=True)
class _ControlledRunner:
    families: FamilySerialiser
    entered: tuple[trio.Event, ...]
    release: tuple[trio.Event, ...]
    finished: tuple[trio.Event, ...]
    completion_order: list[int] = field(default_factory=list)

    async def __call__(
        self,
        item: WorkItem[int],
        _control: ExecutionControl,
    ) -> TaskOutcome[int]:
        async with self.families.hold("alpha") as permit:
            self.entered[item.plan_index].set()
            await self.release[item.plan_index].wait()
            permit.succeeded()
        self.completion_order.append(item.plan_index)
        self.finished[item.plan_index].set()
        return TaskCompleted(value=item.task)


def test_adaptive_overlap_keeps_logical_commits_deterministic() -> None:
    async def scenario() -> None:
        entered = tuple(trio.Event() for _ in range(3))
        release = tuple(trio.Event() for _ in range(3))
        finished = tuple(trio.Event() for _ in range(3))
        runner = _ControlledRunner(
            families=FamilySerialiser(maximum=2),
            entered=entered,
            release=release,
            finished=finished,
        )
        commits: list[tuple[int, int]] = []
        committed = tuple(trio.Event() for _ in range(3))
        result: list[tuple[int, ...]] = []

        async def commit(plan_index: int, value: int) -> None:
            commits.append((plan_index, value))
            committed[plan_index].set()

        async def execute() -> None:
            result.append(
                await execute_ordered(
                    (WorkItem(plan_index=index, task=index) for index in range(3)),
                    runner=runner,
                    concurrency=ConcurrencyConfig(initial=1, maximum=3),
                    commit=commit,
                )
            )

        async with trio.open_nursery() as nursery:
            nursery.start_soon(execute)
            await entered[0].wait()
            await wait_all_tasks_blocked()
            assert not entered[1].is_set()
            assert not entered[2].is_set()

            release[0].set()
            await committed[0].wait()
            await entered[1].wait()
            await entered[2].wait()

            release[2].set()
            await finished[2].wait()
            await wait_all_tasks_blocked()
            assert runner.completion_order == [0, 2]
            assert commits == [(0, 0)]

            release[1].set()

        assert runner.completion_order == [0, 2, 1]
        assert commits == [(0, 0), (1, 1), (2, 2)]
        assert result == [(0, 1, 2)]

    trio.run(scenario)
