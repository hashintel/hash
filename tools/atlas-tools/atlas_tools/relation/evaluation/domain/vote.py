"""Define the normalized, schema-versioned logical vote record.

The vote journal stores only stable logical projections and references to
accepted physical attempts. Native provider payloads remain authoritative in
the attempt journal, so one response is never copied into two durable rows.
"""

from datetime import datetime, timedelta
from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, Field, NonNegativeInt, model_validator

from atlas_tools.relation.evaluation.domain._model import FrozenModel
from atlas_tools.relation.evaluation.domain.configuration import JudgeRequestSpec
from atlas_tools.relation.evaluation.domain.identity import (
    AttemptId,
    BundleId,
    CardHash,
    FiniteFloat,
    JudgeFamilyId,
    ModelId,
    NonEmptyStr,
    NonNegativeFiniteFloat,
    PromptPackHash,
    ProviderName,
    ReasoningEffort,
    VoteId,
    VoteVerdict,
    bundle_parts,
)
from atlas_tools.relation_cards.common.cards import RelationId


class VoteIdentity(FrozenModel):
    """Identify one logical vote and the relation it adjudicates."""

    vote_id: VoteId
    relation_id: RelationId


class VoteProvenance(FrozenModel):
    """Bind a vote to its exact card, rubric, and prompt pack."""

    card_hash: CardHash
    rubric_version: NonEmptyStr
    prompt_pack_hash: PromptPackHash


class VoteRequest(FrozenModel):
    """Record the provider-independent task and its pinned route."""

    judge: JudgeRequestSpec
    bundle_id: BundleId
    effort: ReasoningEffort
    temperature: FiniteFloat | None
    seed: int | None
    repeat_index: NonNegativeInt


class VoteDecision(FrozenModel):
    """Record the final adjudication and any malformed initial completion."""

    verdict: VoteVerdict
    reason: str
    raw_completion: str
    initial_raw_completion: str | None = None

    @property
    def parse_retries(self) -> Literal[0, 1]:
        """Return whether the final decision followed the sole repair call."""
        return 1 if self.initial_raw_completion is not None else 0

    @property
    def abstained(self) -> bool:
        """Return whether both parse attempts failed to form a verdict."""
        return self.verdict == "ABSTAIN"


class VoteEvidence(FrozenModel):
    """Link the decision to accepted attempts and the returned model."""

    accepted_attempt_ids: Annotated[
        tuple[AttemptId, ...],
        Field(min_length=1, max_length=2),
    ]
    model_returned: ModelId

    @model_validator(mode="after")
    def check_attempt_ids(self) -> Self:
        if len(self.accepted_attempt_ids) != len(set(self.accepted_attempt_ids)):
            raise ValueError("accepted attempt IDs must be unique")
        return self


class VoteAccounting(FrozenModel):
    """Project token usage and whether the complete billed cost is known."""

    tokens_in: NonNegativeInt
    tokens_out: NonNegativeInt
    tokens_cached: NonNegativeInt
    tokens_cache_write: NonNegativeInt = 0
    tokens_reasoning: NonNegativeInt = 0
    known_cost_usd: NonNegativeFiniteFloat
    cost_complete: bool

    @property
    def cost_usd(self) -> NonNegativeFiniteFloat | None:
        """Return total cost only when every accepted usage reported cost."""
        return self.known_cost_usd if self.cost_complete else None


class VoteTiming(FrozenModel):
    """Bound wall-clock execution and active provider latency."""

    request_at: AwareDatetime
    response_at: AwareDatetime
    latency: Annotated[timedelta, Field(ge=timedelta())]

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.response_at < self.request_at:
            raise ValueError("response_at must not precede request_at")
        return self


class Vote(FrozenModel):
    """Compose one versioned vote from independent durable contracts."""

    schema_version: Literal[2] = 2
    identity: VoteIdentity
    provenance: VoteProvenance
    request: VoteRequest
    decision: VoteDecision
    evidence: VoteEvidence
    accounting: VoteAccounting
    timing: VoteTiming

    @model_validator(mode="after")
    def check_evidence_count(self) -> Self:
        expected = self.decision.parse_retries + 1
        if len(self.evidence.accepted_attempt_ids) != expected:
            raise ValueError(
                f"vote has {len(self.evidence.accepted_attempt_ids)} accepted attempts, "
                f"expected {expected}"
            )
        return self

    @property
    def vote_id(self) -> VoteId:
        return self.identity.vote_id

    @property
    def relation_id(self) -> RelationId:
        return self.identity.relation_id

    @property
    def card_hash(self) -> CardHash:
        return self.provenance.card_hash

    @property
    def rubric_version(self) -> str:
        return self.provenance.rubric_version

    @property
    def prompt_pack_hash(self) -> PromptPackHash:
        return self.provenance.prompt_pack_hash

    @property
    def family_id(self) -> JudgeFamilyId:
        return self.request.judge.family_id

    @property
    def provider(self) -> ProviderName:
        return self.request.judge.provider_name

    @property
    def model_returned(self) -> ModelId:
        return self.evidence.model_returned

    @property
    def bundle_id(self) -> BundleId:
        return self.request.bundle_id

    @property
    def shell_id(self) -> str:
        return bundle_parts(self.bundle_id)[0]

    @property
    def framing_id(self) -> str:
        return bundle_parts(self.bundle_id)[1]

    @property
    def effort(self) -> ReasoningEffort:
        return self.request.effort

    @property
    def temperature(self) -> FiniteFloat | None:
        return self.request.temperature

    @property
    def seed(self) -> int | None:
        return self.request.seed

    @property
    def repeat_index(self) -> int:
        return self.request.repeat_index

    @property
    def verdict(self) -> VoteVerdict:
        return self.decision.verdict

    @property
    def reason(self) -> str:
        return self.decision.reason

    @property
    def raw_completion(self) -> str:
        return self.decision.raw_completion

    @property
    def initial_raw_completion(self) -> str | None:
        return self.decision.initial_raw_completion

    @property
    def parse_retries(self) -> Literal[0, 1]:
        return self.decision.parse_retries

    @property
    def abstained(self) -> bool:
        return self.decision.abstained

    @property
    def accepted_attempt_ids(self) -> tuple[AttemptId, ...]:
        return self.evidence.accepted_attempt_ids

    @property
    def tokens_in(self) -> int:
        return self.accounting.tokens_in

    @property
    def tokens_out(self) -> int:
        return self.accounting.tokens_out

    @property
    def tokens_cached(self) -> int:
        return self.accounting.tokens_cached

    @property
    def tokens_cache_write(self) -> int:
        return self.accounting.tokens_cache_write

    @property
    def tokens_reasoning(self) -> int:
        return self.accounting.tokens_reasoning

    @property
    def known_cost_usd(self) -> NonNegativeFiniteFloat:
        return self.accounting.known_cost_usd

    @property
    def cost_complete(self) -> bool:
        return self.accounting.cost_complete

    @property
    def cost_usd(self) -> NonNegativeFiniteFloat | None:
        return self.accounting.cost_usd

    @property
    def request_at(self) -> datetime:
        return self.timing.request_at

    @property
    def response_at(self) -> datetime:
        return self.timing.response_at

    @property
    def latency(self) -> timedelta:
        return self.timing.latency


class VoteSummary(FrozenModel):
    """Carry only the baseline facts needed to derive grid refinement."""

    vote_id: VoteId
    relation_id: RelationId
    family_id: JudgeFamilyId
    verdict: VoteVerdict
