"""Name completion request policies whose hashes may remain durable."""

from typing import Literal

type ActiveCompletionRequestPolicyId = Literal["explicit-prefix-breakpoint-ephemeral-v2"]
type HistoricalCompletionRequestPolicyId = Literal[
    "legacy-no-anthropic-prompt-caching-v1",
    "automatic-ephemeral-for-anthropic-models-v1",
]
type CompletionRequestPolicyId = (
    ActiveCompletionRequestPolicyId | HistoricalCompletionRequestPolicyId
)

ACTIVE_COMPLETION_REQUEST_POLICY_ID: ActiveCompletionRequestPolicyId = (
    "explicit-prefix-breakpoint-ephemeral-v2"
)
LEGACY_COMPLETION_REQUEST_POLICY_ID: HistoricalCompletionRequestPolicyId = (
    "legacy-no-anthropic-prompt-caching-v1"
)
AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID: HistoricalCompletionRequestPolicyId = (
    "automatic-ephemeral-for-anthropic-models-v1"
)

HISTORICAL_COMPLETION_REQUEST_POLICY_IDS: tuple[HistoricalCompletionRequestPolicyId, ...] = (
    LEGACY_COMPLETION_REQUEST_POLICY_ID,
    AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID,
)
COMPLETION_REQUEST_POLICY_IDS: tuple[CompletionRequestPolicyId, ...] = (
    *HISTORICAL_COMPLETION_REQUEST_POLICY_IDS,
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
)


def validate_historical_request_policy_ids(
    policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...],
) -> tuple[HistoricalCompletionRequestPolicyId, ...]:
    """Require the declared registry order with no duplicate policy IDs."""
    canonical = tuple(
        policy_id
        for policy_id in HISTORICAL_COMPLETION_REQUEST_POLICY_IDS
        if policy_id in policy_ids
    )
    if policy_ids != canonical:
        raise ValueError("historical request policy IDs must be unique and in registry order")
    return policy_ids
