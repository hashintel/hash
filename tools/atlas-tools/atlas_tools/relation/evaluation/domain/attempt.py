"""Preserve provider and billing evidence at each paid-call boundary.

Provider responses are stored as canonical JSON bytes. This keeps replay
independent of SDK releases while a small projection exposes only the facts
needed for routing, response, and accounting invariants.
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

from atlas_tools.common import canonical_json_bytes
from atlas_tools.relation.domain.api import FrozenModel, NonEmptyStr
from atlas_tools.relation.evaluation.domain.identity import (
    AttemptId,
    JudgeFamilyId,
    ModelId,
    ProviderSlug,
    RequestHash,
    RequestStage,
    VoteId,
)
from atlas_tools.relation.evaluation.domain.scalar import (
    HttpStatusCode,
    NonNegativeDuration,
    NonNegativeFiniteFloat,
    PositiveDuration,
)

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
    model: ModelId
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
        """Restore the provider object without exposing mutable state."""
        return _JSON_OBJECT_ADAPTER.validate_json(self.raw_json, strict=True)


type FailureScope = Literal["vote", "session"]
type FailureKind = Literal["transport", "provider", "response", "routing", "accounting"]


class _Failure(FrozenModel):
    kind: FailureKind
    exception_type: NonEmptyStr
    message: NonEmptyStr
    scope: FailureScope = Field(default="vote", exclude_if=lambda value: value == "vote")

    @property
    def category(self) -> FailureKind:
        """Expose the discriminant under the execution-policy vocabulary."""
        return self.kind


class TransportFailure(_Failure):
    """Describe a request failure for which no HTTP response was available."""

    kind: Literal["transport"] = "transport"
    retry_after: PositiveDuration | None = None


class ProviderFailure(_Failure):
    """Describe direct and embedded HTTP failure evidence from a provider."""

    kind: Literal["provider"] = "provider"
    http_status_code: HttpStatusCode | None = None
    provider_status_code: HttpStatusCode | None = None
    retry_after: PositiveDuration | None = None
    response_body: str | None = None

    @model_validator(mode="after")
    def check_status(self) -> Self:
        if self.http_status_code is None and self.provider_status_code is None:
            raise ValueError("provider failure requires a direct or embedded status")
        return self


class ResponseFailure(_Failure):
    """Describe a provider response that violated the completion contract."""

    kind: Literal["response"] = "response"
    response_body: str | None = None


class RoutingFailure(_Failure):
    """Describe a completion that violated its exact route pins."""

    kind: Literal["routing"] = "routing"


class AccountingFailure(_Failure):
    """Describe missing usage, cache, or billed-cost evidence."""

    kind: Literal["accounting"] = "accounting"


type AttemptFailure = Annotated[
    TransportFailure | ProviderFailure | ResponseFailure | RoutingFailure | AccountingFailure,
    Field(discriminator="kind"),
]


def failure_statuses(failure: AttemptFailure) -> tuple[int, ...]:
    """Return direct then embedded status evidence when the variant has it."""
    if not isinstance(failure, ProviderFailure):
        return ()
    return tuple(
        status
        for status in (failure.http_status_code, failure.provider_status_code)
        if status is not None
    )


def failure_retry_after(failure: AttemptFailure) -> timedelta | None:
    """Return a positive retry delay only for variants that can carry one."""
    if isinstance(failure, TransportFailure | ProviderFailure):
        return failure.retry_after
    return None


class PaidRequestIdentity(FrozenModel):
    """Name one deterministic paid request before and after transport."""

    attempt_id: AttemptId
    vote_id: VoteId
    request_hash: RequestHash
    stage: RequestStage
    stage_attempt: NonNegativeInt


class AttemptRoute(FrozenModel):
    """Pin the model family and provider route used for one request."""

    family_id: JudgeFamilyId
    provider_slug: ProviderSlug
    model_requested: ModelId


class AttemptTiming(FrozenModel):
    """Bound one physical provider exchange in wall and active time."""

    request_at: AwareDatetime
    response_at: AwareDatetime
    latency: NonNegativeDuration

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.response_at < self.request_at:
            raise ValueError("response_at must not precede request_at")
        return self


class AcceptedAttempt(FrozenModel):
    """Carry a completion whose content and usage passed local validation."""

    kind: Literal["accepted"] = "accepted"
    result: ProviderResult

    @model_validator(mode="after")
    def check_usage(self) -> Self:
        if self.result.usage is None:
            raise ValueError("accepted completion requires usage accounting")
        return self


class RejectedAttempt(FrozenModel):
    """Carry billable provider evidence rejected by a local contract."""

    kind: Literal["rejected"] = "rejected"
    result: ProviderResult
    failure: AttemptFailure


class FailedAttempt(FrozenModel):
    """Carry a failed exchange for which no provider result was available."""

    kind: Literal["failed"] = "failed"
    failure: AttemptFailure


type AttemptOutcome = Annotated[
    AcceptedAttempt | RejectedAttempt | FailedAttempt,
    Field(discriminator="kind"),
]


class PhysicalAttempt(FrozenModel):
    """Record one versioned paid-call boundary as a closed state machine."""

    kind: Literal["physical-attempt"] = "physical-attempt"
    schema_version: Literal[2] = 2
    identity: PaidRequestIdentity
    route: AttemptRoute
    outcome: AttemptOutcome
    timing: AttemptTiming

    @property
    def attempt_id(self) -> AttemptId:
        return self.identity.attempt_id

    @property
    def vote_id(self) -> VoteId:
        return self.identity.vote_id

    @property
    def request_hash(self) -> RequestHash:
        return self.identity.request_hash

    @property
    def request_stage(self) -> RequestStage:
        return self.identity.stage

    @property
    def stage_attempt(self) -> int:
        return self.identity.stage_attempt

    @property
    def family_id(self) -> JudgeFamilyId:
        return self.route.family_id

    @property
    def provider_slug(self) -> ProviderSlug:
        return self.route.provider_slug

    @property
    def model_requested(self) -> ModelId:
        return self.route.model_requested

    @property
    def result(self) -> ProviderResult | None:
        if isinstance(self.outcome, AcceptedAttempt | RejectedAttempt):
            return self.outcome.result
        return None

    @property
    def failure(self) -> AttemptFailure | None:
        if isinstance(self.outcome, RejectedAttempt | FailedAttempt):
            return self.outcome.failure
        return None

    @property
    def request_at(self) -> datetime:
        return self.timing.request_at

    @property
    def response_at(self) -> datetime:
        return self.timing.response_at

    @property
    def latency(self) -> timedelta:
        return self.timing.latency


class InFlightRequest(FrozenModel):
    """Prove that a paid request may lack a durable outcome."""

    kind: Literal["in-flight-request"] = "in-flight-request"
    schema_version: Literal[2] = 2
    identity: PaidRequestIdentity
    created_at: AwareDatetime

    @property
    def attempt_id(self) -> AttemptId:
        return self.identity.attempt_id

    @property
    def vote_id(self) -> VoteId:
        return self.identity.vote_id

    @property
    def request_hash(self) -> RequestHash:
        return self.identity.request_hash

    @property
    def request_stage(self) -> RequestStage:
        return self.identity.stage

    @property
    def stage_attempt(self) -> int:
        return self.identity.stage_attempt


def request_age(*, marker: InFlightRequest, now: datetime) -> timedelta:
    """Measure unresolved billing age while rejecting mixed timezones."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    age = now - marker.created_at
    if age < timedelta():
        raise ValueError("now must not precede marker creation")
    return age
