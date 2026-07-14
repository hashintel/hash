from datetime import UTC, datetime, timedelta

from atlas_tools.relation.evaluation.application import run as evaluation_run
from atlas_tools.relation.evaluation.domain.api import (
    AcceptedAttempt,
    AttemptId,
    AttemptRoute,
    AttemptTiming,
    JudgeFamilyId,
    ModelId,
    PaidRequestIdentity,
    PhysicalAttempt,
    ProviderResult,
    ProviderSlug,
    RejectedAttempt,
    RequestHash,
    ResponseFailure,
    VoteId,
)


def _result(cost_usd: float) -> ProviderResult:
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
            },
        },
        strict=True,
    )


def _attempt(
    index: int,
    *,
    family_id: str,
    cost_usd: float,
    rejected: bool = False,
) -> PhysicalAttempt:
    now = datetime(2026, 7, 14, tzinfo=UTC)
    result = _result(cost_usd)
    outcome = (
        RejectedAttempt(
            result=result,
            failure=ResponseFailure(
                exception_type="ResponseError",
                message="completion envelope was malformed",
            ),
        )
        if rejected
        else AcceptedAttempt(result=result)
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


def test_resume_cost_history_keeps_recent_billed_results_per_family() -> None:
    attempts = (
        _attempt(1, family_id="family/a", cost_usd=0.01),
        _attempt(2, family_id="family/b", cost_usd=0.04),
        _attempt(3, family_id="family/a", cost_usd=0.02, rejected=True),
        _attempt(4, family_id="family/a", cost_usd=0.03),
    )

    history = evaluation_run._resume_billed_costs(attempts, window=2)

    assert history == {
        "family/a": (0.02, 0.03),
        "family/b": (0.04,),
    }
