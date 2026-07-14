"""Represent and hash provider-independent logical vote work.

`vote_id` is a content hash of every field that can alter a request. It is the
idempotency key for resume, import, and ordered commit. Operational controls
such as concurrency and cost caps are intentionally absent from the identity.
"""

from collections.abc import Iterator
from functools import cached_property
from typing import Literal, Protocol

from pydantic import NonNegativeInt, computed_field

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.domain._model import FrozenModel
from atlas_tools.relation.evaluation.domain.configuration import JudgeRequestSpec
from atlas_tools.relation.evaluation.domain.identity import (
    AttemptId,
    BundleId,
    CardHash,
    PromptPackHash,
    ReasoningEffort,
    RequestHash,
    SessionId,
    VoteId,
)
from atlas_tools.relation_cards.common.cards import RelationId


class VoteTask(FrozenModel):
    """Describe one logical vote without execution or storage state."""

    judge: JudgeRequestSpec
    bundle_id: BundleId
    relation_id: RelationId
    card_hash: CardHash
    effort: ReasoningEffort
    repeat_index: NonNegativeInt
    prompt_pack_hash: PromptPackHash
    rubric_version: Literal["rubric-v1"]

    @computed_field
    @cached_property
    def vote_id(self) -> VoteId:
        """Return the stable logical identity used by resume and import."""
        return task_hash(self)


class VotePlan(Protocol):
    """Yield a deterministic stream while keeping memory independent of plan size."""

    @property
    def expected_votes(self) -> int: ...

    def tasks(self) -> Iterator[VoteTask]: ...


def task_hash(task: VoteTask) -> VoteId:
    """Hash the legacy-compatible request identity in canonical key order."""
    return VoteId(
        sha256_bytes(
            canonical_json_bytes(
                {
                    "bundle_id": task.bundle_id,
                    "card_hash": task.card_hash,
                    "effort": task.effort,
                    "provider_name": task.judge.provider_name,
                    "provider_slug": task.judge.provider_slug,
                    "openrouter_region": task.judge.openrouter_region,
                    "family_id": task.judge.family_id,
                    "output_token_limit": task.judge.output_token_limit.model_dump(mode="json"),
                    "model": task.judge.model,
                    "prompt_pack_hash": task.prompt_pack_hash,
                    "relation_id": task.relation_id,
                    "repeat_index": task.repeat_index,
                    "rubric_version": task.rubric_version,
                    "seed": task.judge.seed,
                    "temperature": task.judge.temperature,
                }
            )
        )
    )


def session_id(task: VoteTask) -> SessionId:
    """Group requests that may share provider-side prompt-cache state."""
    return SessionId(
        sha256_bytes(
            canonical_json_bytes(
                {
                    "bundle": task.bundle_id,
                    "effort": task.effort,
                    "family": task.judge.family_id,
                }
            )
        )
    )


def attempt_id(*, request_hash: RequestHash, stage_attempt: int) -> AttemptId:
    """Derive a physical-attempt identity and reject negative ordinals."""
    if stage_attempt < 0:
        raise ValueError("stage_attempt must not be negative")

    return AttemptId(
        sha256_bytes(
            canonical_json_bytes(
                {
                    "request_hash": request_hash,
                    "stage_attempt": stage_attempt,
                }
            )
        )
    )
