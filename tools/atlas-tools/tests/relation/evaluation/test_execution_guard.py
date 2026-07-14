from datetime import timedelta

import pytest

from atlas_tools.relation.evaluation.domain.api import (
    AttemptFailure,
    FailureScope,
    GuardConfig,
    JudgeConfig,
    JudgeFamilyId,
    ModelId,
    ProviderFailure,
    ProviderName,
    ProviderResult,
    ProviderSlug,
    ResponseFailure,
    SessionId,
    TransientRetryConfig,
    TransportFailure,
)
from atlas_tools.relation.evaluation.execution.api import GridGuardPolicy
from atlas_tools.relation.evaluation.transport.api import (
    CompletionAccepted,
    CompletionFailed,
    CompletionMessage,
    CompletionRejected,
    CompletionRequest,
)


def _request() -> CompletionRequest:
    return CompletionRequest(
        messages=(
            CompletionMessage(role="system", content="rubric"),
            CompletionMessage(role="user", content="demonstration"),
            CompletionMessage(role="assistant", content="demonstration answer"),
            CompletionMessage(role="user", content="classify relation"),
        ),
        judge=JudgeConfig(
            provider_slug=ProviderSlug("provider/model"),
            provider_name=ProviderName("Provider"),
            model=ModelId("test/model"),
        ),
        effort="minimal",
        session_id=SessionId("a" * 64),
        timeout=timedelta(seconds=5),
        request_stage="initial",
    )


def _result(
    content: str,
    *,
    cached_tokens: int = 20,
    cost_usd: float = 0.01,
) -> ProviderResult:
    return ProviderResult.model_validate(
        {
            "id": "completion",
            "model": "test/model",
            "choices": [
                {
                    "finish_reason": "stop",
                    "index": 0,
                    "message": {"content": content, "role": "assistant"},
                }
            ],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 5,
                "total_tokens": 105,
                "cost": cost_usd,
                "prompt_tokens_details": {"cached_tokens": cached_tokens},
            },
        },
        strict=True,
    )


def _accepted(
    content: str = '{"verdict":"proximal"}',
    *,
    cached_tokens: int = 20,
    cost_usd: float = 0.01,
) -> CompletionAccepted:
    return CompletionAccepted(
        result=_result(content, cached_tokens=cached_tokens, cost_usd=cost_usd),
        content=content,
        provider_name=ProviderName("Provider"),
    )


def _parse(content: str) -> object:
    if content != '{"verdict":"proximal"}':
        raise ValueError("malformed verdict")
    return content


def _policy(
    *,
    established: bool = False,
    cache_check_vote: int = 10,
    cost_window: int = 10,
    retry_transport_errors: bool = True,
    initial_billed_costs_usd: tuple[float, ...] = (),
) -> GridGuardPolicy:
    return GridGuardPolicy(
        config=GuardConfig(
            cache_check_vote=cache_check_vote,
            cost_window=cost_window,
            cost_multiplier=1.5,
        ),
        retry_policy=TransientRetryConfig(retry_transport_errors=retry_transport_errors),
        pilot_cost_per_vote_usd={JudgeFamilyId("test/model"): 0.01},
        parse_verdict=_parse,
        established_families={JudgeFamilyId("test/model")} if established else (),
        initial_billed_costs_usd={
            JudgeFamilyId("test/model"): initial_billed_costs_usd
        },
    )


def _rate_limited() -> CompletionFailed:
    return CompletionFailed(
        failure=ProviderFailure(
            exception_type="ProviderError",
            message="rate limited",
            http_status_code=429,
        )
    )


@pytest.mark.parametrize(
    ("failure", "expected_scope"),
    [
        pytest.param(
            ProviderFailure(
                exception_type="ProviderError",
                message="rate limited",
                http_status_code=429,
            ),
            "vote",
            id="http-429-retries",
        ),
        pytest.param(
            ProviderFailure(
                exception_type="ProviderError",
                message="permanent outer response with embedded outage",
                http_status_code=400,
                provider_status_code=503,
            ),
            "session",
            id="permanent-http-status-vetoes-embedded-503",
        ),
        pytest.param(
            ProviderFailure(
                exception_type="ProviderError",
                message="embedded provider outage",
                provider_status_code=503,
            ),
            "vote",
            id="provider-503-retries",
        ),
        pytest.param(
            TransportFailure(
                exception_type="NetworkError",
                message="connection reset",
            ),
            "vote",
            id="plain-transport-retries",
        ),
        pytest.param(
            ProviderFailure(
                exception_type="ProviderError",
                message="bad request",
                http_status_code=400,
            ),
            "session",
            id="http-400-pages",
        ),
        pytest.param(
            ProviderFailure(
                exception_type="ProviderError",
                message="unauthorized",
                http_status_code=401,
                scope="session",
            ),
            "session",
            id="http-401-pages",
        ),
        pytest.param(
            ResponseFailure(
                exception_type="ResponseError",
                message="unclassified response failure",
            ),
            "session",
            id="unclassified-response-pages",
        ),
    ],
)
def test_unproven_opening_failure_uses_retry_policy_scope(
    failure: AttemptFailure,
    expected_scope: FailureScope,
) -> None:
    outcome = _policy().evaluate(_request(), CompletionFailed(failure=failure))

    assert isinstance(outcome, CompletionFailed)
    assert outcome.failure.scope == expected_scope


def test_opening_transport_failure_pages_when_transport_retries_are_disabled() -> None:
    failure = TransportFailure(
        exception_type="NetworkError",
        message="connection reset",
    )

    outcome = _policy(retry_transport_errors=False).evaluate(
        _request(),
        CompletionFailed(failure=failure),
    )

    assert isinstance(outcome, CompletionFailed)
    assert outcome.failure.scope == "session"


def test_malformed_accepted_opening_pages_without_losing_billed_result() -> None:
    accepted = _accepted("not json")

    outcome = _policy().evaluate(_request(), accepted)

    assert isinstance(outcome, CompletionRejected)
    assert outcome.failure.scope == "session"
    assert outcome.billed_result is accepted.result


def test_retryable_opening_then_permanent_failure_still_pages() -> None:
    policy = _policy()
    permanent = CompletionFailed(
        failure=ProviderFailure(
            exception_type="ProviderError",
            message="bad request",
            http_status_code=400,
        )
    )

    retry = policy.evaluate(_request(), _rate_limited())
    outcome = policy.evaluate(_request(), permanent)

    assert isinstance(retry, CompletionFailed)
    assert retry.failure.scope == "vote"
    assert isinstance(outcome, CompletionFailed)
    assert outcome.failure.scope == "session"
    assert "first-vote check failed" in outcome.failure.message


def test_retryable_opening_then_malformed_response_still_pages() -> None:
    policy = _policy()
    malformed = _accepted("not json")

    retry = policy.evaluate(_request(), _rate_limited())
    outcome = policy.evaluate(_request(), malformed)

    assert isinstance(retry, CompletionFailed)
    assert isinstance(outcome, CompletionRejected)
    assert outcome.failure.scope == "session"
    assert outcome.billed_result is malformed.result
    assert "opening completion did not parse" in outcome.failure.message


def test_valid_response_after_retryable_opening_establishes_family() -> None:
    policy = _policy()
    valid = _accepted()
    later_failure = CompletionFailed(
        failure=ProviderFailure(
            exception_type="ProviderError",
            message="bad request",
            http_status_code=400,
        )
    )

    retry = policy.evaluate(_request(), _rate_limited())
    accepted = policy.evaluate(_request(), valid)
    after_establishment = policy.evaluate(_request(), later_failure)

    assert isinstance(retry, CompletionFailed)
    assert accepted is valid
    assert after_establishment is later_failure


def test_established_family_skips_first_call_roster_paging() -> None:
    failure = ProviderFailure(
        exception_type="ProviderError",
        message="bad request",
        http_status_code=400,
    )

    outcome = _policy(established=True).evaluate(
        _request(),
        CompletionFailed(failure=failure),
    )

    assert outcome == CompletionFailed(failure=failure)


def test_cache_checkpoint_accepts_an_isolated_miss_after_any_hit() -> None:
    policy = _policy(cache_check_vote=2)

    first = policy.evaluate(_request(), _accepted(cached_tokens=20))
    second = policy.evaluate(_request(), _accepted(cached_tokens=0))

    assert isinstance(first, CompletionAccepted)
    assert isinstance(second, CompletionAccepted)


def test_cache_checkpoint_rejects_a_stream_that_never_warms() -> None:
    policy = _policy(cache_check_vote=2)

    first = policy.evaluate(_request(), _accepted(cached_tokens=0))
    second = policy.evaluate(_request(), _accepted(cached_tokens=0))

    assert isinstance(first, CompletionAccepted)
    assert isinstance(second, CompletionRejected)
    assert second.failure.scope == "session"
    assert second.billed_result.usage is not None
    assert second.billed_result.usage.cached_tokens == 0


def test_billed_rejection_can_trip_rolling_cost_without_losing_result() -> None:
    policy = _policy(established=True, cost_window=2)
    first = policy.evaluate(_request(), _accepted(cost_usd=0.01))
    billed = _result("malformed", cost_usd=0.04)
    rejected = CompletionRejected(
        failure=ResponseFailure(
            exception_type="ResponseError",
            message="completion envelope was malformed",
        ),
        billed_result=billed,
    )

    outcome = policy.evaluate(_request(), rejected)

    assert isinstance(first, CompletionAccepted)
    assert isinstance(outcome, CompletionRejected)
    assert outcome.failure.category == "accounting"
    assert outcome.failure.scope == "session"
    assert "rolling mean $0.025000" in outcome.failure.message
    assert outcome.billed_result is billed


def test_resumed_billed_cost_history_participates_in_next_tripwire() -> None:
    policy = _policy(
        established=True,
        cost_window=2,
        initial_billed_costs_usd=(0.02,),
    )

    outcome = policy.evaluate(_request(), _accepted(cost_usd=0.02))

    assert isinstance(outcome, CompletionRejected)
    assert outcome.failure.category == "accounting"
    assert "rolling mean $0.020000" in outcome.failure.message


def test_vote_scope_is_absent_from_historical_failure_json() -> None:
    vote_failure = TransportFailure(
        exception_type="NetworkError",
        message="connection reset",
    )
    session_failure = vote_failure.model_copy(update={"scope": "session"})

    assert "scope" not in vote_failure.model_dump(mode="json")
    assert session_failure.model_dump(mode="json")["scope"] == "session"
