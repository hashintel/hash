"""OpenRouter transport, response validation, and usage accounting for relation evals."""

import math
import os
from collections import deque
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import timedelta
from threading import Lock, Semaphore
from typing import Final, Protocol, Self, assert_never, cast

from openrouter import OpenRouter
from openrouter.components import (
    AnthropicCacheControlDirective,
    ChatMessages,
    ChatRequestReasoning,
    ChatResult,
    ProviderPreferences,
)
from openrouter.types import UNSET
from openrouter.utils.retries import BackoffStrategy, RetryConfig
from pydantic import JsonValue

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.eval.contract import (
    JudgeConfig,
    MaxCompletionTokensLimit,
    MaxTokensLimit,
    OpenRouterRegion,
    RequestStage,
    VoteTask,
    session_id,
)
from atlas_tools.relation.eval.schema import PhysicalAttemptRow, ReasoningEffort

_NO_RETRIES: Final = RetryConfig(
    strategy="none",
    backoff=BackoffStrategy(0, 0, 1.0, 0),
    retry_connection_errors=False,
)
_RESPONSE_CACHE_HEADERS: Final = {"X-OpenRouter-Cache": "false"}
_ANTHROPIC_MODEL_PREFIX: Final = "anthropic/"
_ANTHROPIC_PROMPT_CACHING: Final = "automatic-ephemeral-for-anthropic-models-v1"
_HTTP_OK: Final = 200
_GLOBAL_OPENROUTER_SERVER_URL: Final = "https://openrouter.ai/api/v1"
_EU_OPENROUTER_SERVER_URL: Final = "https://eu.openrouter.ai/api/v1"


@dataclass(frozen=True)
class AcceptedCompletion:
    content: str
    provider_name: str


@dataclass(frozen=True)
class UsageAccounting:
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_cached: int = 0
    tokens_cache_write: int = 0
    tokens_reasoning: int = 0
    known_cost_usd: float = 0.0
    cost_complete: bool = True

    @property
    def cost_usd(self) -> float | None:
        return self.known_cost_usd if self.cost_complete else None

    def combine(self, other: Self) -> Self:
        return type(self)(
            tokens_in=self.tokens_in + other.tokens_in,
            tokens_out=self.tokens_out + other.tokens_out,
            tokens_cached=self.tokens_cached + other.tokens_cached,
            tokens_cache_write=self.tokens_cache_write + other.tokens_cache_write,
            tokens_reasoning=self.tokens_reasoning + other.tokens_reasoning,
            known_cost_usd=self.known_cost_usd + other.known_cost_usd,
            cost_complete=self.cost_complete and other.cost_complete,
        )

    def mark_incomplete(self) -> Self:
        return type(self)(
            tokens_in=self.tokens_in,
            tokens_out=self.tokens_out,
            tokens_cached=self.tokens_cached,
            tokens_cache_write=self.tokens_cache_write,
            tokens_reasoning=self.tokens_reasoning,
            known_cost_usd=self.known_cost_usd,
            cost_complete=False,
        )


class CompletionTransport(Protocol):
    """One visible non-streaming request; SDK retries must remain disabled."""

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult: ...


class CloseableCompletionTransport(CompletionTransport, Protocol):
    """A worker-owned completion transport with an explicit lifecycle."""

    def close(self) -> None: ...


class CompletionTransportFactory(Protocol):
    """Create a fresh transport whose owning worker must close it."""

    def __call__(self) -> CloseableCompletionTransport: ...


def request_policy_payload() -> dict[str, JsonValue]:
    """Return fresh, JSON-native data binding hashes to the transport request policy."""
    return {
        "allow_fallbacks": False,
        "anthropic_prompt_caching": _ANTHROPIC_PROMPT_CACHING,
        "cache_headers": dict(_RESPONSE_CACHE_HEADERS),
        "data_collection": "deny",
        "metadata": "enabled",
        "require_parameters": True,
        "retries": "none",
        "stream": False,
        "zdr": True,
    }


def request_hash(
    messages: Sequence[ChatMessages],
    task: VoteTask,
    stage: RequestStage,
    timeout: timedelta,
) -> Sha256Hex:
    """Hash one request together with the exact OpenRouter transport policy."""
    return sha256_bytes(
        canonical_json_bytes(
            {
                "effort": task.effort,
                "output_token_limit": task.judge.output_token_limit.model_dump(mode="json"),
                "messages": [
                    message.model_dump(mode="json", by_alias=True, exclude_unset=True)
                    for message in messages
                ],
                "model": task.judge.model,
                "provider_name": task.judge.provider_name,
                "provider_slug": task.judge.provider_slug,
                "openrouter_region": task.judge.openrouter_region,
                "request_policy": request_policy_payload(),
                "seed": task.judge.seed,
                "session_id": session_id(task),
                "stage": stage,
                "temperature": task.judge.temperature,
                "timeout": timeout.total_seconds(),
                "vote_id": task.vote_id,
            }
        )
    )


def openrouter_server_url(region: OpenRouterRegion) -> str:
    match region:
        case "global":
            return _GLOBAL_OPENROUTER_SERVER_URL
        case "eu":
            return _EU_OPENROUTER_SERVER_URL
        case unexpected:
            assert_never(unexpected)


def _environment_api_key() -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY is required to execute judge calls")
    return api_key


def _validate_api_key(api_key: str) -> None:
    if not api_key:
        raise ValueError("OpenRouter API key must not be empty")


def _duration_milliseconds(duration: timedelta) -> int:
    milliseconds = round(duration.total_seconds() * 1000)
    if milliseconds <= 0:
        raise ValueError("request timeout must be positive")
    return milliseconds


def _prompt_cache_directive(judge: JudgeConfig) -> AnthropicCacheControlDirective | None:
    """Return the top-level prompt-caching directive for Anthropic-vendor models.

    Anthropic routes require explicit cache breakpoints; OpenRouter's automatic
    mode places the breakpoint on the last cacheable block, so the shared shell
    and few-shot prefix is served from cache on every subsequent call. Other
    vendors either cache implicitly or do not consume the directive, and it is
    a billing/infrastructure concern, so it stays outside vote identity.
    """
    if judge.model.startswith(_ANTHROPIC_MODEL_PREFIX):
        return AnthropicCacheControlDirective(type="ephemeral")
    return None


class OpenRouterTransport:
    """Native OpenRouter adapter with exact routing and privacy constraints."""

    def __init__(self, api_key: str) -> None:
        _validate_api_key(api_key)
        self._client = OpenRouter(api_key=api_key, retry_config=_NO_RETRIES)
        self._closed = False

    @classmethod
    def from_environment(cls) -> Self:
        return cls(_environment_api_key())

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        provider = ProviderPreferences(
            only=[judge.provider_slug],
            allow_fallbacks=False,
            require_parameters=True,
            data_collection="deny",
            zdr=True,
        )
        reasoning = ChatRequestReasoning(effort=effort)
        temperature = judge.temperature if judge.temperature is not None else UNSET
        seed = judge.seed if judge.seed is not None else UNSET
        cache_control = _prompt_cache_directive(judge)
        match judge.output_token_limit:
            case MaxTokensLimit(tokens=tokens):
                result = self._client.chat.send(
                    messages=messages,
                    model=judge.model,
                    provider=provider,
                    reasoning=reasoning,
                    temperature=temperature,
                    seed=seed,
                    max_tokens=tokens,
                    cache_control=cache_control,
                    x_open_router_metadata="enabled",
                    server_url=openrouter_server_url(judge.openrouter_region),
                    session_id=session_id,
                    stream=False,
                    retries=_NO_RETRIES,
                    timeout_ms=_duration_milliseconds(timeout),
                    http_headers=_RESPONSE_CACHE_HEADERS,
                )
            case MaxCompletionTokensLimit(tokens=tokens):
                result = self._client.chat.send(
                    messages=messages,
                    model=judge.model,
                    provider=provider,
                    reasoning=reasoning,
                    temperature=temperature,
                    seed=seed,
                    max_completion_tokens=tokens,
                    cache_control=cache_control,
                    x_open_router_metadata="enabled",
                    server_url=openrouter_server_url(judge.openrouter_region),
                    session_id=session_id,
                    stream=False,
                    retries=_NO_RETRIES,
                    timeout_ms=_duration_milliseconds(timeout),
                    http_headers=_RESPONSE_CACHE_HEADERS,
                )
            case unexpected:
                assert_never(unexpected)
        if not isinstance(result, ChatResult):
            raise TypeError("OpenRouter returned a stream for a non-streaming request")
        return result

    def close(self) -> None:
        if not self._closed:
            self._client.__exit__(None, None, None)
            self._closed = True


@dataclass(frozen=True)
class OpenRouterTransportFactory:
    """Callable configuration that gives each Trio worker its own OpenRouter client."""

    api_key: str = field(repr=False)

    def __post_init__(self) -> None:
        _validate_api_key(self.api_key)

    @classmethod
    def from_environment(cls) -> Self:
        return cls(api_key=_environment_api_key())

    def __call__(self) -> OpenRouterTransport:
        return OpenRouterTransport(self.api_key)


class GridGuardError(RuntimeError):
    """A family stream guard fired; the run stops resumably and pages the operator."""


class _FamilyStreamState:
    """One family's fresh-call accounting behind the shared guard lock."""

    def __init__(self) -> None:
        self.semaphore = Semaphore(1)
        self.calls = 0
        self.recent_costs: deque[float] = deque()


class FamilyStreamGuards:
    """Per-family serialization plus the grid's three fresh-stream guards.

    Shared across every worker's transport so the whole run sees one stream
    per family. The semaphore keeps at most one physical request in flight
    per family (families run in parallel with each other, never interleaved
    within themselves — the property that keeps the prefix cache hot). The
    guards observe only fresh calls; imported pilot votes never pass here.

    1. First-vote check: the family's first call must succeed, come back on
       the pinned model, and parse to a verdict. A failure is a roster
       problem, not a retry problem.
    2. Cache assertion: from the configured call index, every accepted
       completion must report cached prompt tokens; a cold cache halts.
    3. Cost tripwire: the rolling mean of reported costs must stay under the
       configured multiple of the family's pilot-measured per-vote cost.
    """

    def __init__(
        self,
        *,
        cache_check_vote: int,
        cost_window: int,
        cost_multiplier: float,
        pilot_cost_per_vote_usd: Mapping[str, float],
        parse_verdict: Callable[[str], object],
    ) -> None:
        self._cache_check_vote = cache_check_vote
        self._cost_window = cost_window
        self._cost_multiplier = cost_multiplier
        self._pilot_costs = dict(pilot_cost_per_vote_usd)
        self._parse_verdict = parse_verdict
        self._guard = Lock()
        self._families: dict[str, _FamilyStreamState] = {}

    def _state(self, family_id: str) -> _FamilyStreamState:
        with self._guard:
            state = self._families.get(family_id)
            if state is None:
                state = _FamilyStreamState()
                self._families[family_id] = state
            return state

    def guarded_complete(
        self,
        inner: CompletionTransport,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        state = self._state(judge.family_id)
        with state.semaphore:
            with self._guard:
                call_index = state.calls
                state.calls += 1
            try:
                result = inner.complete(
                    messages=messages,
                    judge=judge,
                    effort=effort,
                    session_id=session_id,
                    timeout=timeout,
                )
            except Exception as error:
                if call_index == 0:
                    raise GridGuardError(
                        f"first-vote check failed for {judge.family_id}: the stream's "
                        f"opening request errored ({error}); this is a roster problem, "
                        "not a retry problem — paging the operator"
                    ) from error
                raise
            self._check_result(judge, call_index, result)
            return result

    def _check_result(self, judge: JudgeConfig, call_index: int, result: ChatResult) -> None:
        if call_index == 0:
            if result.model != judge.model:
                raise GridGuardError(
                    f"first-vote check failed for {judge.family_id}: returned model "
                    f"{result.model!r} does not carry the pinned name"
                )
            content = _completion_content(result)
            try:
                self._parse_verdict(content)
            except ValueError as error:
                raise GridGuardError(
                    f"first-vote check failed for {judge.family_id}: the opening "
                    f"completion does not parse to a verdict ({error})"
                ) from error
        usage = aggregate_usage([result])
        if call_index + 1 >= self._cache_check_vote and usage.tokens_cached <= 0:
            raise GridGuardError(
                f"cache assertion failed for {judge.family_id}: call "
                f"{call_index + 1} reports no cached prompt tokens; a cold cache at "
                "this depth is a surcharge, not a warm-up"
            )
        expected = self._pilot_costs.get(judge.family_id)
        if expected is None or usage.cost_usd is None:
            return
        with self._guard:
            state = self._families[judge.family_id]
            state.recent_costs.append(usage.cost_usd)
            while len(state.recent_costs) > self._cost_window:
                state.recent_costs.popleft()
            if len(state.recent_costs) < self._cost_window:
                return
            rolling_mean = sum(state.recent_costs) / len(state.recent_costs)
        ceiling = self._cost_multiplier * expected
        if rolling_mean > ceiling:
            raise GridGuardError(
                f"cost tripwire fired for {judge.family_id}: rolling mean "
                f"${rolling_mean:.6f}/vote over the last {self._cost_window} votes "
                f"exceeds {self._cost_multiplier}x the pilot-measured "
                f"${expected:.6f}/vote"
            )


@dataclass
class GuardedTransport:
    """A worker transport routed through the shared family stream guards."""

    inner: CloseableCompletionTransport
    guards: FamilyStreamGuards

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        return self.guards.guarded_complete(
            self.inner,
            messages=messages,
            judge=judge,
            effort=effort,
            session_id=session_id,
            timeout=timeout,
        )

    def close(self) -> None:
        self.inner.close()


@dataclass
class GuardedTransportFactory:
    """Share one family guard table across every worker's transport."""

    inner: CompletionTransportFactory
    guards: FamilyStreamGuards

    def __call__(self) -> GuardedTransport:
        return GuardedTransport(inner=self.inner(), guards=self.guards)


def _completion_content(result: ChatResult) -> str:
    if len(result.choices) != 1:
        raise ValueError("completion must contain exactly one choice")
    choice = result.choices[0]
    if choice.index != 0:
        raise ValueError("completion choice index must be zero")
    if choice.finish_reason != "stop":
        raise ValueError(f"completion finish_reason must be stop, got {choice.finish_reason!r}")

    message = choice.message.model_dump(mode="json", by_alias=True, exclude_unset=True)
    if message.get("refusal") not in (None, ""):
        raise ValueError("completion contained a refusal")
    if message.get("tool_calls"):
        raise ValueError("completion contained tool calls")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("completion content must be a non-empty string")
    return content


def _validate_usage(result: ChatResult) -> None:
    if result.usage is None:
        raise ValueError("completion omitted required usage accounting")
    usage = result.usage.model_dump(mode="json", by_alias=True, exclude_unset=True)
    for field_name in ("prompt_tokens", "completion_tokens", "total_tokens"):
        value = usage.get(field_name)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError(f"completion usage.{field_name} must be a non-negative integer")


def _selected_provider(result: ChatResult, expected_provider_name: str) -> str:
    metadata = result.openrouter_metadata
    if metadata is None:
        raise ValueError("completion omitted required OpenRouter routing metadata")
    selected = [endpoint for endpoint in metadata.endpoints.available if endpoint.selected]
    if len(selected) != 1:
        raise ValueError("completion metadata must identify exactly one selected endpoint")
    provider_name = selected[0].provider
    if provider_name != expected_provider_name:
        raise ValueError(
            f"selected endpoint used provider {provider_name!r}, "
            f"expected {expected_provider_name!r}"
        )
    return provider_name


def _validate_detailed_route_attempts(result: ChatResult, provider_name: str) -> None:
    metadata = result.openrouter_metadata
    if metadata is None or not metadata.attempts:
        return
    if len(metadata.attempts) != 1:
        raise ValueError("completion reported multiple provider attempts for an exact route")
    route = metadata.attempts[0]
    if route.status != _HTTP_OK:
        raise ValueError(f"provider attempt status must be {_HTTP_OK}, got {route.status}")
    if route.provider != provider_name:
        raise ValueError("provider attempt disagrees with the selected endpoint")


def validate_pinned_route(result: ChatResult, *, model: str, provider_name: str) -> str:
    """Enforce the exact live routing contract over a native completion.

    This is the single source of truth for route acceptance: the transport
    applies it before a completion is accepted, and the analysis re-evaluates
    persisted results with the same rule. OpenRouter's detailed ``attempts``
    array is optional; when present it must agree with the selected endpoint.
    """
    if result.model != model:
        raise ValueError(f"completion returned model {result.model!r}, expected {model!r}")
    metadata = result.openrouter_metadata
    if metadata is None:
        raise ValueError("completion omitted required OpenRouter routing metadata")
    if metadata.requested != model:
        raise ValueError(
            f"router metadata requested model {metadata.requested!r}, expected {model!r}"
        )
    if metadata.strategy != "direct" or metadata.attempt != 1:
        raise ValueError("completion was not served by the first direct provider attempt")

    selected_provider = _selected_provider(result, provider_name)
    _validate_detailed_route_attempts(result, selected_provider)
    return selected_provider


def matches_pinned_route(result: ChatResult, *, model: str, provider_name: str) -> bool:
    """Return whether a persisted result satisfies the live routing contract."""
    try:
        validate_pinned_route(result, model=model, provider_name=provider_name)
    except ValueError:
        return False
    return True


def accepted_completion(result: ChatResult, judge: JudgeConfig) -> AcceptedCompletion:
    """Validate a completion envelope, usage, model, provider, and direct route."""
    content = _completion_content(result)
    _validate_usage(result)
    return AcceptedCompletion(
        content=content,
        provider_name=validate_pinned_route(
            result,
            model=judge.model,
            provider_name=judge.provider_name,
        ),
    )


def _usage_number(payload: Mapping[str, JsonValue], field_name: str) -> int:
    value = payload.get(field_name)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"native usage field {field_name} is missing or invalid")
    return value


def _nested_usage_number(
    payload: Mapping[str, JsonValue],
    parent: str,
    field_name: str,
) -> int:
    details = payload.get(parent)
    if details is None:
        return 0
    if not isinstance(details, dict):
        raise TypeError(f"native usage field {parent} must be an object when present")
    value = details.get(field_name)
    if value is None:
        return 0
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"native usage field {parent}.{field_name} must be a non-negative integer")
    return value


def _usage_cost(payload: Mapping[str, JsonValue]) -> float | None:
    cost = payload.get("cost")
    if isinstance(cost, bool) or not isinstance(cost, int | float) or not math.isfinite(cost):
        return None
    known_cost = float(cost)
    if known_cost < 0:
        raise ValueError("native usage cost must not be negative")
    return known_cost


def aggregate_usage(results: Sequence[ChatResult]) -> UsageAccounting:
    """Aggregate native usage over one or more successful OpenRouter responses."""
    accounting = UsageAccounting()
    for result in results:
        if result.usage is None:
            raise ValueError("cannot aggregate a result without usage")
        usage = cast(
            "dict[str, JsonValue]",
            result.usage.model_dump(mode="json", by_alias=True, exclude_unset=True),
        )
        known_cost = _usage_cost(usage)
        result_accounting = UsageAccounting(
            tokens_in=_usage_number(usage, "prompt_tokens"),
            tokens_out=_usage_number(usage, "completion_tokens"),
            tokens_cached=_nested_usage_number(usage, "prompt_tokens_details", "cached_tokens"),
            tokens_cache_write=_nested_usage_number(
                usage, "prompt_tokens_details", "cache_write_tokens"
            ),
            tokens_reasoning=_nested_usage_number(
                usage, "completion_tokens_details", "reasoning_tokens"
            ),
            known_cost_usd=known_cost if known_cost is not None else 0.0,
            cost_complete=known_cost is not None,
        )
        accounting = accounting.combine(result_accounting)
    return accounting


def aggregate_physical_usage(
    attempts: Sequence[PhysicalAttemptRow],
) -> UsageAccounting:
    """Aggregate persisted attempts, marking cost incomplete when an outcome is unknown."""
    accounting = UsageAccounting()
    for attempt in attempts:
        if attempt.result is None:
            accounting = accounting.mark_incomplete()
            continue
        try:
            result_accounting = aggregate_usage([attempt.result])
        except TypeError, ValueError:
            accounting = accounting.mark_incomplete()
            continue
        accounting = accounting.combine(result_accounting)
    return accounting
