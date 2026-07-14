"""Preserve provider evidence without admitting SDK types into the domain.

Provider responses are stored as canonical JSON bytes, which makes the opaque
portion immutable and keeps replay independent of an SDK release. A small
validated projection exposes only facts needed for vote and accounting
invariants. Serialization emits the original object shape expected by existing
JSONL artifacts.
"""

from datetime import datetime, timedelta
from typing import Annotated, Literal, Self

from pydantic import (
    AwareDatetime,
    Field,
    JsonValue,
    NonNegativeInt,
    TypeAdapter,
    model_serializer,
    model_validator,
)

from atlas_tools.common import Sha256Hex, canonical_json_bytes
from atlas_tools.relation.evaluation.domain._model import FrozenModel
from atlas_tools.relation.evaluation.domain.identity import (
    BundleId,
    FiniteFloat,
    FramingId,
    NonEmptyStr,
    NonNegativeFiniteFloat,
    ReasoningEffort,
    RequestStage,
    ShellId,
    VoteVerdict,
    bundle_id,
)
from atlas_tools.relation_cards.common.cards import RelationId

_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
_NON_NEGATIVE_INT_ADAPTER = TypeAdapter(NonNegativeInt)
_NON_NEGATIVE_FLOAT_ADAPTER = TypeAdapter(NonNegativeFiniteFloat)


def _object_field(payload: dict[str, JsonValue], name: str) -> dict[str, JsonValue] | None:
    value = payload.get(name)
    if value is None:
        return None
    return _JSON_OBJECT_ADAPTER.validate_python(value, strict=True)


def _required_string(payload: dict[str, JsonValue], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value:
        raise ValueError(f"provider result {name} must be a non-empty string")
    return value


def _optional_non_negative_int(payload: dict[str, JsonValue] | None, name: str) -> int:
    if payload is None or name not in payload:
        return 0
    return _NON_NEGATIVE_INT_ADAPTER.validate_python(payload[name], strict=True)


def _required_non_negative_int(payload: dict[str, JsonValue], name: str) -> int:
    if name not in payload:
        raise ValueError(f"provider usage omitted {name}")
    return _NON_NEGATIVE_INT_ADAPTER.validate_python(payload[name], strict=True)


class CompletionUsage(FrozenModel):
    """Project the accounting fields used by local correctness checks."""

    prompt_tokens: NonNegativeInt
    completion_tokens: NonNegativeInt
    cached_tokens: NonNegativeInt = 0
    cache_write_tokens: NonNegativeInt = 0
    reasoning_tokens: NonNegativeInt = 0
    cost_usd: NonNegativeFiniteFloat | None = None


def _usage(payload: dict[str, JsonValue]) -> CompletionUsage | None:
    usage = _object_field(payload, "usage")
    if usage is None:
        return None
    prompt_details = _object_field(usage, "prompt_tokens_details")
    completion_details = _object_field(usage, "completion_tokens_details")
    raw_cost = usage.get("cost")
    cost = (
        None
        if raw_cost is None
        else _NON_NEGATIVE_FLOAT_ADAPTER.validate_python(raw_cost, strict=True)
    )
    return CompletionUsage(
        prompt_tokens=_required_non_negative_int(usage, "prompt_tokens"),
        completion_tokens=_required_non_negative_int(usage, "completion_tokens"),
        cached_tokens=_optional_non_negative_int(prompt_details, "cached_tokens"),
        cache_write_tokens=_optional_non_negative_int(prompt_details, "cache_write_tokens"),
        reasoning_tokens=_optional_non_negative_int(completion_details, "reasoning_tokens"),
        cost_usd=cost,
    )


def _content(payload: dict[str, JsonValue]) -> str | None:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    message = first.get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    return content if isinstance(content, str) else None


class ProviderResult(FrozenModel):
    """Keep a native completion immutable while projecting stable evidence."""

    raw_json: bytes = Field(repr=False)
    model: NonEmptyStr
    content: str | None
    usage: CompletionUsage | None

    @model_validator(mode="before")
    @classmethod
    def validate_native_payload(cls, value: object) -> object:
        if isinstance(value, cls):
            return value
        payload = _JSON_OBJECT_ADAPTER.validate_python(value, strict=True)
        return {
            "raw_json": canonical_json_bytes(payload),
            "model": _required_string(payload, "model"),
            "content": _content(payload),
            "usage": _usage(payload),
        }

    @model_serializer
    def serialize_native_payload(self) -> dict[str, JsonValue]:
        """Restore the provider object without exposing a mutable reference."""
        return _JSON_OBJECT_ADAPTER.validate_json(self.raw_json, strict=True)


type FailureScope = Literal["vote", "session"]


class AttemptFailure(FrozenModel):
    """Persist a normalized failure and its execution scope.

    Vote scope is the backward-compatible default and is omitted from JSON.
    Session scope is explicit evidence that execution must stop new paid work.
    """

    category: Literal["transport", "provider", "response", "routing", "accounting"]
    exception_type: NonEmptyStr
    message: NonEmptyStr
    http_status_code: int | None = None
    provider_status_code: int | None = None
    retry_after: Annotated[timedelta, Field(gt=timedelta())] | None = None
    response_body: str | None = None
    scope: FailureScope = Field(default="vote", exclude_if=lambda value: value == "vote")


class PhysicalAttempt(FrozenModel):
    """Record one paid-call boundary, including locally rejected responses."""

    attempt_id: Sha256Hex
    vote_id: Sha256Hex
    request_stage: RequestStage
    stage_attempt: NonNegativeInt
    request_hash: Sha256Hex
    family_id: NonEmptyStr
    provider_slug: NonEmptyStr
    model_requested: NonEmptyStr
    result: ProviderResult | None
    failure: AttemptFailure | None
    ts_request: AwareDatetime
    ts_response: AwareDatetime
    latency: Annotated[timedelta, Field(ge=timedelta())]

    @model_validator(mode="after")
    def check_outcome(self) -> Self:
        if self.result is None and self.failure is None:
            raise ValueError("an attempt must contain a result or failure")
        if self.ts_response < self.ts_request:
            raise ValueError("ts_response must not precede ts_request")
        return self


class InFlightRequest(FrozenModel):
    """Prove that a request may have incurred cost before an outcome was durable."""

    attempt_id: Sha256Hex
    vote_id: Sha256Hex
    request_hash: Sha256Hex
    request_stage: RequestStage
    stage_attempt: NonNegativeInt
    created_at: AwareDatetime


class Vote(FrozenModel):
    """Record one logical verdict and every accepted provider completion."""

    vote_id: Sha256Hex
    relation_id: RelationId
    card_hash: Sha256Hex
    family_id: NonEmptyStr
    provider: NonEmptyStr
    model_returned: NonEmptyStr
    shell_id: ShellId
    framing_id: FramingId
    bundle_id: BundleId
    rubric_version: NonEmptyStr
    prompt_pack_hash: Sha256Hex
    verdict: VoteVerdict
    reason: str
    raw_completion: str
    parse_retries: Literal[0, 1]
    abstained: bool
    initial_raw_completion: str | None = None
    attempt_results: tuple[ProviderResult, ...]
    effort: ReasoningEffort
    temperature: FiniteFloat | None
    seed: int | None
    repeat_index: NonNegativeInt
    tokens_in: NonNegativeInt
    tokens_out: NonNegativeInt
    tokens_cached: NonNegativeInt
    tokens_cache_write: NonNegativeInt = 0
    tokens_reasoning: NonNegativeInt = 0
    known_cost_usd: NonNegativeFiniteFloat
    cost_complete: bool
    cost_usd: NonNegativeFiniteFloat | None
    ts_request: AwareDatetime
    ts_response: AwareDatetime
    latency: Annotated[timedelta, Field(ge=timedelta())]

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        if self.bundle_id != bundle_id(shell=self.shell_id, framing=self.framing_id):
            raise ValueError("bundle_id must match shell_id and framing_id")
        if self.abstained != (self.verdict == "ABSTAIN"):
            raise ValueError("abstained must be true if and only if verdict is ABSTAIN")
        if (self.initial_raw_completion is not None) != (self.parse_retries == 1):
            raise ValueError("initial_raw_completion must be set iff parse_retries is 1")
        if len(self.attempt_results) != self.parse_retries + 1:
            raise ValueError("attempt_results must contain one result per logical model call")
        if any(result.usage is None for result in self.attempt_results):
            raise ValueError("every accepted result must include usage")
        if self.attempt_results[-1].model != self.model_returned:
            raise ValueError("model_returned must match the final native result")
        if self.cost_complete != (self.cost_usd is not None):
            raise ValueError("cost_usd must be set if and only if cost_complete is true")
        if self.cost_usd is not None and self.cost_usd != self.known_cost_usd:
            raise ValueError("complete cost_usd must equal known_cost_usd")
        if self.ts_response < self.ts_request:
            raise ValueError("ts_response must not precede ts_request")
        return self


class VoteSummary(FrozenModel):
    """Carry only the baseline facts needed to derive grid refinement."""

    vote_id: Sha256Hex
    relation_id: RelationId
    family_id: NonEmptyStr
    verdict: VoteVerdict


def request_age(*, marker: InFlightRequest, now: datetime) -> timedelta:
    """Measure unresolved billing age while rejecting mixed timezone semantics."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    age = now - marker.created_at
    if age < timedelta():
        raise ValueError("now must not precede marker creation")
    return age
