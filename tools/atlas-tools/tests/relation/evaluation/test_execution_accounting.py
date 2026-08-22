from datetime import UTC, datetime, timedelta

import pytest
import trio
from trio.testing import wait_all_tasks_blocked

from atlas_tools.relation.evaluation.domain.api import (
    AttemptId,
    AttemptRoute,
    AttemptTiming,
    FailedAttempt,
    JudgeFamilyId,
    ModelId,
    PaidRequestIdentity,
    PhysicalAttempt,
    ProviderSlug,
    RequestHash,
    TransportFailure,
    VoteId,
)
from atlas_tools.relation.evaluation.execution.api import CostLedger, CostLimitReachedError


def _unknown_cost_attempt() -> PhysicalAttempt:
    now = datetime(2026, 7, 14, tzinfo=UTC)
    return PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=AttemptId("a" * 64),
            vote_id=VoteId("b" * 64),
            request_hash=RequestHash("c" * 64),
            stage="initial",
            stage_attempt=0,
        ),
        route=AttemptRoute(
            family_id=JudgeFamilyId("judge/a"),
            provider_slug=ProviderSlug("provider-a"),
            model_requested=ModelId("model/a"),
        ),
        outcome=FailedAttempt(
            failure=TransportFailure(
                exception_type="ConnectionError",
                message="connection ended after request transmission",
            )
        ),
        timing=AttemptTiming(
            request_at=now,
            response_at=now,
            latency=timedelta(),
        ),
    )


def test_cost_admission_waits_for_durable_unknown_cost_settlement() -> None:
    async def scenario() -> None:
        ledger = CostLedger(maximum_usd=1.0)
        await ledger.reserve()
        persist_entered = trio.Event()
        release_persist = trio.Event()
        second_denied = trio.Event()

        async def persist(_attempt: PhysicalAttempt) -> str:
            persist_entered.set()
            await release_persist.wait()
            return "durable"

        async def settle_first() -> None:
            durable = await ledger.persist_and_settle(_unknown_cost_attempt(), persist)
            assert durable == "durable"

        async def admit_second() -> None:
            await persist_entered.wait()
            with pytest.raises(CostLimitReachedError, match="incomplete provider costs"):
                await ledger.reserve()
            second_denied.set()

        async with trio.open_nursery() as nursery:
            nursery.start_soon(settle_first)
            nursery.start_soon(admit_second)
            await persist_entered.wait()
            await wait_all_tasks_blocked()
            assert not second_denied.is_set()
            release_persist.set()
            await second_denied.wait()

    trio.run(scenario)
