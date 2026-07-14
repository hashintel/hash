"""OpenRouter transport, response validation, and usage accounting for relation evals."""

import math
import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Final, Protocol, Self, assert_never, cast

from openrouter import OpenRouter
from openrouter.components import (
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


def _selected_provider(result: ChatResult, judge: JudgeConfig) -> str:
    metadata = result.openrouter_metadata
    if metadata is None:
        raise ValueError("completion omitted required OpenRouter routing metadata")
    selected = [endpoint for endpoint in metadata.endpoints.available if endpoint.selected]
    if len(selected) != 1:
        raise ValueError("completion metadata must identify exactly one selected endpoint")
    provider_name = selected[0].provider
    if provider_name != judge.provider_name:
        raise ValueError(
            f"selected endpoint used provider {provider_name!r}, expected {judge.provider_name!r}"
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


def _route_provider(result: ChatResult, judge: JudgeConfig) -> str:
    if result.model != judge.model:
        raise ValueError(f"completion returned model {result.model!r}, expected {judge.model!r}")
    metadata = result.openrouter_metadata
    if metadata is None:
        raise ValueError("completion omitted required OpenRouter routing metadata")
    if metadata.requested != judge.model:
        raise ValueError(
            f"router metadata requested model {metadata.requested!r}, expected {judge.model!r}"
        )
    if metadata.strategy != "direct" or metadata.attempt != 1:
        raise ValueError("completion was not served by the first direct provider attempt")

    provider_name = _selected_provider(result, judge)
    _validate_detailed_route_attempts(result, provider_name)
    return provider_name


def accepted_completion(result: ChatResult, judge: JudgeConfig) -> AcceptedCompletion:
    """Validate a completion envelope, usage, model, provider, and direct route."""
    content = _completion_content(result)
    _validate_usage(result)
    return AcceptedCompletion(
        content=content,
        provider_name=_route_provider(result, judge),
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
