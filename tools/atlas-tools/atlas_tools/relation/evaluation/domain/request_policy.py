"""Name completion request policies whose hashes may remain durable."""

from typing import Literal, Self

from pydantic import PositiveInt, field_validator, model_validator

from atlas_tools.relation.domain.api import FrozenModel, Sha256Hex
from atlas_tools.relation.evaluation.domain.identity import AttemptId

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


class HistoricalRequestEvidence(FrozenModel):
    """Bind historical request policies to one finite journal prefix."""

    request_policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...]
    attempt_count: PositiveInt
    attempts_prefix_hash: Sha256Hex

    @field_validator("request_policy_ids")
    @classmethod
    def check_request_policy_ids(
        cls,
        policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...],
    ) -> tuple[HistoricalCompletionRequestPolicyId, ...]:
        if not policy_ids:
            raise ValueError("historical request evidence requires a request policy")
        return validate_historical_request_policy_ids(policy_ids)


class HistoricalRequestSubset(FrozenModel):
    """Bind selected imported attempts to their verified source prefix."""

    source_evidence: HistoricalRequestEvidence
    attempt_ids: tuple[AttemptId, ...] = ()

    @field_validator("attempt_ids")
    @classmethod
    def check_attempt_ids(cls, attempt_ids: tuple[AttemptId, ...]) -> tuple[AttemptId, ...]:
        if tuple(sorted(set(attempt_ids))) != attempt_ids:
            raise ValueError("historical request subset attempt IDs must be sorted and unique")
        return attempt_ids

    @model_validator(mode="after")
    def check_size(self) -> Self:
        if len(self.attempt_ids) > self.source_evidence.attempt_count:
            raise ValueError("historical request subset exceeds its source prefix")
        return self
