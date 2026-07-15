from datetime import UTC, datetime, timedelta
from typing import Literal

from atlas_tools.relation.evaluation.domain.api import (
    AcceptedAttempt,
    AttemptId,
    AttemptRoute,
    AttemptTiming,
    FailedAttempt,
    JudgeFamilyId,
    ModelId,
    PaidRequestIdentity,
    PhysicalAttempt,
    ProviderFailure,
    ProviderResult,
    ProviderSlug,
    RejectedAttempt,
    RequestHash,
    ResponseFailure,
    VoteId,
)
from atlas_tools.relation.evaluation.execution.api import (
    GridGuardFamilySeed,
    grid_guard_family_seeds,
)


def _result(cost_usd: float, *, cached_tokens: int) -> ProviderResult:
    return ProviderResult.model_validate(
        {
            "id": "completion",
            "model": "model/a",
            "choices": [
                {
                    "finish_reason": "stop",
                    "index": 0,
                    "message": {"content": "answer", "role": "assistant"},
                }
            ],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 2,
                "total_tokens": 12,
                "cost": cost_usd,
                "prompt_tokens_details": {"cached_tokens": cached_tokens},
            },
        },
        strict=True,
    )


def _attempt(
    index: int,
    *,
    family_id: str,
    cost_usd: float,
    cached_tokens: int,
    outcome_kind: Literal["accepted", "rejected", "failed"] = "accepted",
) -> PhysicalAttempt:
    now = datetime(2026, 7, 14, tzinfo=UTC)
    match outcome_kind:
        case "accepted":
            outcome = AcceptedAttempt(result=_result(cost_usd, cached_tokens=cached_tokens))
        case "rejected":
            outcome = RejectedAttempt(
                result=_result(cost_usd, cached_tokens=cached_tokens),
                failure=ResponseFailure(
                    exception_type="ResponseError",
                    message="completion envelope was malformed",
                ),
            )
        case "failed":
            outcome = FailedAttempt(
                failure=ProviderFailure(
                    exception_type="ProviderError",
                    message="rate limited",
                    http_status_code=429,
                )
            )
    return PhysicalAttempt(
        identity=PaidRequestIdentity(
            attempt_id=AttemptId(f"{index:064x}"),
            vote_id=VoteId(f"{index + 10:064x}"),
            request_hash=RequestHash(f"{index + 20:064x}"),
            stage="initial",
            stage_attempt=0,
        ),
        route=AttemptRoute(
            family_id=JudgeFamilyId(family_id),
            provider_slug=ProviderSlug("provider/a"),
            model_requested=ModelId("model/a"),
        ),
        outcome=outcome,
        timing=AttemptTiming(
            request_at=now,
            response_at=now,
            latency=timedelta(),
        ),
    )


def test_resume_seed_replays_billed_result_evidence_per_family() -> None:
    attempts = (
        _attempt(
            1,
            family_id="family/b",
            cost_usd=0.04,
            cached_tokens=4,
            outcome_kind="rejected",
        ),
        _attempt(2, family_id="family/a", cost_usd=0.01, cached_tokens=1),
        _attempt(
            3,
            family_id="family/a",
            cost_usd=9.99,
            cached_tokens=999,
            outcome_kind="failed",
        ),
        _attempt(
            4,
            family_id="family/a",
            cost_usd=0.02,
            cached_tokens=2,
            outcome_kind="rejected",
        ),
        _attempt(5, family_id="family/a", cost_usd=0.03, cached_tokens=0),
    )

    seeds = grid_guard_family_seeds(attempts, cost_window=2)

    assert seeds == (
        GridGuardFamilySeed(
            family_id=JudgeFamilyId("family/a"),
            established=True,
            billed_calls=3,
            cached_tokens=3,
            recent_costs_usd=(0.02, 0.03),
        ),
        GridGuardFamilySeed(
            family_id=JudgeFamilyId("family/b"),
            established=False,
            billed_calls=1,
            cached_tokens=4,
            recent_costs_usd=(0.04,),
        ),
    )
