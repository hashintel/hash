"""Send exact-route OpenRouter requests through its native async API."""

from typing import Final, Literal, Self, assert_never

from openrouter import OpenRouter
from openrouter.components import (
    BYOKProviderSlug,
    ChatAssistantMessage,
    ChatContentCacheControl,
    ChatContentText,
    ChatDeveloperMessage,
    ChatMessages,
    ChatRequestReasoning,
    ChatResult,
    ChatSystemMessage,
    ChatUserMessage,
    ProviderPreferences,
)
from openrouter.components import (
    ProviderName as OpenRouterProviderName,
)
from openrouter.errors import NoResponseError, OpenRouterError
from openrouter.types import UNSET
from pydantic import JsonValue, TypeAdapter, ValidationError

from atlas_tools.relation.evaluation.domain.api import (
    AccountingFailure,
    AttemptFailure,
    JudgeRequestSpec,
    MaxCompletionTokensLimit,
    MaxTokensLimit,
    ProviderName,
    ProviderResult,
    ProviderSlug,
    ResponseFailure,
    RoutingFailure,
)
from atlas_tools.relation.evaluation.transport._lifetime import SdkClientLifetime
from atlas_tools.relation.evaluation.transport._sdk import (
    NO_RETRIES,
    timeout_milliseconds,
)
from atlas_tools.relation.evaluation.transport.completion import (
    CompletionAccepted,
    CompletionFailed,
    CompletionMessage,
    CompletionOutcome,
    CompletionRejected,
    CompletionRequest,
)
from atlas_tools.relation.evaluation.transport.failure import request_failure

_CACHE_HEADERS: Final = {"X-OpenRouter-Cache": "false"}
_ANTHROPIC_PREFIX: Final = "anthropic/"
_GLOBAL_URL: Final = "https://openrouter.ai/api/v1"
_EU_URL: Final = "https://eu.openrouter.ai/api/v1"
_HTTP_OK: Final = 200
_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
_PROVIDER_NAME_ADAPTER = TypeAdapter(OpenRouterProviderName)
_PROVIDER_SLUG_ADAPTER = TypeAdapter(BYOKProviderSlug)


class _RejectedError(ValueError):
    __slots__ = ("category",)

    def __init__(
        self,
        category: Literal["response", "routing", "accounting"],
        message: str,
    ) -> None:
        super().__init__(message)
        self.category = category


def _messages(messages: tuple[CompletionMessage, ...]) -> list[ChatMessages]:
    converted: list[ChatMessages] = []

    for message in messages:
        match message.role:
            case "system":
                converted.append(ChatSystemMessage(role="system", content=message.content))
            case "developer":
                converted.append(ChatDeveloperMessage(role="developer", content=message.content))
            case "user":
                converted.append(ChatUserMessage(role="user", content=message.content))
            case "assistant":
                converted.append(ChatAssistantMessage(role="assistant", content=message.content))
            case unexpected:
                assert_never(unexpected)

    return converted


def _server_url(region: Literal["global", "eu"]) -> str:
    match region:
        case "global":
            return _GLOBAL_URL
        case "eu":
            return _EU_URL
        case unexpected:
            assert_never(unexpected)


def _cache_marked_messages(
    request: CompletionRequest,
    messages: list[ChatMessages],
) -> list[ChatMessages]:
    if not request.judge.model.startswith(_ANTHROPIC_PREFIX):
        return messages

    boundary = -2 if request.request_stage == "initial" else -4
    if len(messages) < -boundary + 1:
        raise ValueError(
            f"{request.request_stage} prompt needs at least {-boundary + 1} messages "
            "for an Anthropic cache breakpoint"
        )

    index = len(messages) + boundary
    target = messages[index]

    if not isinstance(target, ChatSystemMessage | ChatUserMessage | ChatAssistantMessage):
        raise TypeError("Anthropic cache breakpoint must target a text chat message")
    if not isinstance(target.content, str):
        raise TypeError("Anthropic cache breakpoint content must be plain text")

    marked = target.model_copy(
        update={
            "content": [
                ChatContentText(
                    type="text",
                    text=target.content,
                    cache_control=ChatContentCacheControl(type="ephemeral"),
                )
            ]
        }
    )
    return [*messages[:index], marked, *messages[index + 1 :]]


def _native_result(result: ChatResult) -> ProviderResult:
    return ProviderResult.model_validate(
        result.model_dump(mode="json", by_alias=True, exclude_unset=True),
        strict=True,
    )


def _content(result: ChatResult) -> str:
    if len(result.choices) != 1:
        raise _RejectedError("response", "completion must contain exactly one choice")

    choice = result.choices[0]
    if choice.index != 0:
        raise _RejectedError("response", "completion choice index must be zero")

    if choice.finish_reason != "stop":
        raise _RejectedError(
            "response",
            f"completion finish_reason must be stop, got {choice.finish_reason!r}",
        )

    message = choice.message.model_dump(mode="json", by_alias=True, exclude_unset=True)
    if message.get("refusal") not in (None, ""):
        raise _RejectedError("response", "completion contained a refusal")

    if message.get("tool_calls"):
        raise _RejectedError("response", "completion contained tool calls")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise _RejectedError("response", "completion content must be a non-empty string")

    return content


def _validate_usage(result: ChatResult) -> None:
    if result.usage is None:
        raise _RejectedError("accounting", "completion omitted required usage accounting")
    usage = result.usage.model_dump(mode="json", by_alias=True, exclude_unset=True)
    for field_name in ("prompt_tokens", "completion_tokens", "total_tokens"):
        value = usage.get(field_name)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise _RejectedError(
                "accounting",
                f"completion usage.{field_name} must be a non-negative integer",
            )


def _provider(result: ChatResult, expected: ProviderName) -> ProviderName:
    metadata = result.openrouter_metadata
    if metadata is None:
        raise _RejectedError("routing", "completion omitted required OpenRouter routing metadata")
    selected = tuple(endpoint for endpoint in metadata.endpoints.available if endpoint.selected)
    if len(selected) != 1:
        raise _RejectedError("routing", "completion must identify exactly one selected endpoint")
    try:
        provider_name = _PROVIDER_NAME_ADAPTER.validate_python(
            selected[0].provider,
            strict=True,
        )
    except ValidationError as error:
        raise _RejectedError(
            "routing",
            "completion returned an invalid OpenRouter provider name",
        ) from error
    if provider_name != expected:
        raise _RejectedError(
            "routing",
            f"selected endpoint used provider {provider_name!r}, expected {expected!r}",
        )
    return ProviderName(str(provider_name))


def _provider_slug(value: ProviderSlug) -> BYOKProviderSlug:
    try:
        return _PROVIDER_SLUG_ADAPTER.validate_python(str(value), strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid OpenRouter provider slug {value!r}") from error


def _validate_route(result: ChatResult, judge: JudgeRequestSpec) -> ProviderName:
    if result.model != judge.model:
        raise _RejectedError(
            "routing",
            f"completion returned model {result.model!r}, expected {judge.model!r}",
        )
    metadata = result.openrouter_metadata
    if metadata is None:
        raise _RejectedError("routing", "completion omitted required OpenRouter routing metadata")
    if metadata.requested != judge.model:
        raise _RejectedError(
            "routing",
            f"router metadata requested model {metadata.requested!r}, expected {judge.model!r}",
        )
    if metadata.strategy != "direct" or metadata.attempt != 1:
        raise _RejectedError("routing", "completion was not served by the first direct attempt")
    provider_name = _provider(result, judge.provider_name)
    if metadata.attempts:
        if len(metadata.attempts) != 1:
            raise _RejectedError("routing", "completion reported multiple provider attempts")
        route = metadata.attempts[0]
        if route.status != _HTTP_OK or route.provider != provider_name:
            raise _RejectedError("routing", "provider attempt disagrees with the exact route")
    return provider_name


def _persisted_head_matches(
    result: ProviderResult,
    judge: JudgeRequestSpec,
    metadata: dict[str, JsonValue],
) -> bool:
    attempt = metadata.get("attempt")
    return not (
        result.model != judge.model
        or metadata.get("requested") != judge.model
        or metadata.get("strategy") != "direct"
        or not isinstance(attempt, int)
        or isinstance(attempt, bool)
        or attempt != 1
    )


def _persisted_endpoint_matches(
    metadata: dict[str, JsonValue],
    expected_provider: str,
) -> bool:
    endpoints = _route_object(metadata.get("endpoints"))
    if endpoints is None:
        return False
    available = endpoints.get("available")
    if not isinstance(available, list):
        return False
    selected: list[dict[str, JsonValue]] = []
    for raw_endpoint in available:
        endpoint = _route_object(raw_endpoint)
        if endpoint is None:
            return False
        if endpoint.get("selected") is True:
            selected.append(endpoint)
    return len(selected) == 1 and selected[0].get("provider") == expected_provider


def _persisted_attempt_matches(
    metadata: dict[str, JsonValue],
    expected_provider: str,
) -> bool:
    attempts = metadata.get("attempts")
    if attempts in (None, []):
        return True
    if not isinstance(attempts, list) or len(attempts) != 1:
        return False
    route = _route_object(attempts[0])
    if route is None:
        return False
    status = route.get("status")
    return (
        isinstance(status, int)
        and not isinstance(status, bool)
        and status == _HTTP_OK
        and route.get("provider") == expected_provider
    )


def matches_pinned_route(result: ProviderResult, judge: JudgeRequestSpec) -> bool:
    """Return whether persisted native evidence satisfies every route pin.

    Only the stable routing projection is decoded. Historical evidence does
    not depend on whichever generated SDK schema happens to be installed when
    a downstream report is produced.
    """
    try:
        payload = _JSON_OBJECT_ADAPTER.validate_json(result.raw_json, strict=True)
    except ValidationError:
        return False
    metadata = _route_object(payload.get("openrouter_metadata"))
    return metadata is not None and all(
        (
            _persisted_head_matches(result, judge, metadata),
            _persisted_endpoint_matches(metadata, judge.provider_name),
            _persisted_attempt_matches(metadata, judge.provider_name),
        )
    )


def _route_object(value: JsonValue | None) -> dict[str, JsonValue] | None:
    if not isinstance(value, dict):
        return None
    return _JSON_OBJECT_ADAPTER.validate_python(value, strict=True)


def _rejection_failure(error: _RejectedError) -> AttemptFailure:
    exception_type = f"{type(error).__module__}.{type(error).__qualname__}"
    message = str(error)
    match error.category:
        case "response":
            return ResponseFailure(exception_type=exception_type, message=message)
        case "routing":
            return RoutingFailure(exception_type=exception_type, message=message)
        case "accounting":
            return AccountingFailure(exception_type=exception_type, message=message)


async def _send(client: OpenRouter, request: CompletionRequest) -> ChatResult:
    judge = request.judge
    messages = _cache_marked_messages(request, _messages(request.messages))
    provider = ProviderPreferences(
        only=[_provider_slug(judge.provider_slug)],
        allow_fallbacks=False,
        require_parameters=True,
        data_collection="deny",
        zdr=True,
    )
    reasoning = ChatRequestReasoning(effort=request.effort)
    temperature = judge.temperature if judge.temperature is not None else UNSET
    seed = judge.seed if judge.seed is not None else UNSET
    timeout_ms = timeout_milliseconds(request.timeout)
    server_url = _server_url(judge.openrouter_region)
    match judge.output_token_limit:
        case MaxTokensLimit(tokens=tokens):
            return await client.chat.send_async(
                messages=messages,
                model=judge.model,
                provider=provider,
                reasoning=reasoning,
                temperature=temperature,
                seed=seed,
                max_tokens=tokens,
                x_open_router_metadata="enabled",
                server_url=server_url,
                session_id=request.session_id,
                stream=False,
                retries=NO_RETRIES,
                timeout_ms=timeout_ms,
                http_headers=_CACHE_HEADERS,
            )
        case MaxCompletionTokensLimit(tokens=tokens):
            return await client.chat.send_async(
                messages=messages,
                model=judge.model,
                provider=provider,
                reasoning=reasoning,
                temperature=temperature,
                seed=seed,
                max_completion_tokens=tokens,
                x_open_router_metadata="enabled",
                server_url=server_url,
                session_id=request.session_id,
                stream=False,
                retries=NO_RETRIES,
                timeout_ms=timeout_ms,
                http_headers=_CACHE_HEADERS,
            )
        case unexpected:
            assert_never(unexpected)


class OpenRouterTransport:
    """A shared exact-route OpenRouter client with explicit async shutdown.

    Every request disables SDK retries, fallbacks, data collection, and response
    caching. The adapter accepts only the pinned model and provider's first
    direct route. One instance may serve concurrent requests and owns one async
    connection pool until `aclose` completes.
    """

    __slots__ = ("_client", "_closed", "_lifetime")

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("OpenRouter API key must not be empty")
        self._client = OpenRouter(api_key=api_key, retry_config=NO_RETRIES)
        self._closed = False
        self._lifetime = SdkClientLifetime(self._client)

    async def complete(self, request: CompletionRequest) -> CompletionOutcome:
        """Send and validate one visible non-streaming request.

        Raises:
            RuntimeError: The transport has already been closed.

        Expected SDK, provider, and acceptance failures are returned as typed
        outcomes. Unknown exceptions and cancellation propagate unchanged.
        """
        if self._closed:
            raise RuntimeError("OpenRouter transport is closed")
        try:
            native = await _send(self._client, request)
        except (OpenRouterError, NoResponseError) as error:
            return CompletionFailed(failure=request_failure(error))
        if not isinstance(native, ChatResult):
            raise TypeError("OpenRouter returned a stream for a non-streaming request")
        result = _native_result(native)
        try:
            content = _content(native)
            _validate_usage(native)
            provider_name = _validate_route(native, request.judge)
        except _RejectedError as error:
            return CompletionRejected(
                failure=_rejection_failure(error),
                billed_result=result,
            )
        return CompletionAccepted(
            result=result,
            content=content,
            provider_name=provider_name,
        )

    async def aclose(self) -> None:
        """Close both SDK clients, preserving unfinished work for a retry."""
        if self._closed:
            return
        await self._lifetime.aclose()
        self._closed = True

    async def __aenter__(self) -> Self:
        """Return this transport for one explicitly owned async lifetime."""
        if self._closed:
            raise RuntimeError("OpenRouter transport is closed")
        return self

    async def __aexit__(self, _exc_type: object, _exc: object, _traceback: object) -> None:
        """Close the transport at the end of its owned async lifetime."""
        await self.aclose()
