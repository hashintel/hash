from datetime import timedelta
from typing import ClassVar, Self

import pytest
import trio
from openrouter.components import (
    ChatAssistantMessage,
    ChatChoice,
    ChatContentText,
    ChatDeveloperMessage,
    ChatResult,
    ChatSystemMessage,
    ChatUsage,
    ChatUsageCompletionTokensDetails,
    ChatUsagePromptTokensDetails,
    ChatUserMessage,
    EndpointInfo,
    EndpointsMetadata,
    OpenRouterMetadata,
    ProviderPreferences,
    RouterAttempt,
)
from openrouter.errors import NoResponseError
from openrouter.utils.retries import RetryConfig

from atlas_tools.relation.evaluation.domain.api import (
    JudgeConfig,
    MaxCompletionTokensLimit,
    MaxTokensLimit,
    ProviderResult,
    RequestStage,
)
from atlas_tools.relation.evaluation.transport import openrouter as openrouter_module
from atlas_tools.relation.evaluation.transport.api import (
    CompletionAccepted,
    CompletionFailed,
    CompletionMessage,
    CompletionRejected,
    CompletionRequest,
    OpenRouterTransport,
    TransportVersions,
    matches_pinned_route,
    transport_versions,
)

MODEL = "test/model"
PROVIDER_SLUG = "test-provider/endpoint"
PROVIDER_NAME = "Test Provider"

type NativeMessage = (
    ChatAssistantMessage | ChatDeveloperMessage | ChatSystemMessage | ChatUserMessage
)


def _native_messages(value: object) -> list[NativeMessage]:
    if not isinstance(value, list):
        raise TypeError("native messages must be a list")
    messages: list[NativeMessage] = []
    for message in value:
        if not isinstance(
            message,
            ChatAssistantMessage | ChatDeveloperMessage | ChatSystemMessage | ChatUserMessage,
        ):
            raise TypeError(f"unexpected native message {type(message).__qualname__}")
        messages.append(message)
    return messages


def _result(
    *,
    model: str = MODEL,
    provider_name: str = PROVIDER_NAME,
    requested_model: str = MODEL,
    content: str = '{"verdict":"proximal"}',
    cached_tokens: int = 80,
    cost: float | None = 0.01,
) -> ChatResult:
    return ChatResult(
        choices=[
            ChatChoice(
                finish_reason="stop",
                index=0,
                message=ChatAssistantMessage(role="assistant", content=content),
            )
        ],
        created=1,
        id="completion",
        model=model,
        object="chat.completion",
        system_fingerprint=None,
        openrouter_metadata=OpenRouterMetadata(
            attempt=1,
            endpoints=EndpointsMetadata(
                available=[
                    EndpointInfo(model=model, provider=provider_name, selected=True),
                ],
                total=1,
            ),
            is_byok=False,
            region=None,
            requested=requested_model,
            strategy="direct",
            summary="test route",
            attempts=[RouterAttempt(model=model, provider=provider_name, status=200)],
        ),
        usage=ChatUsage(
            prompt_tokens=100,
            completion_tokens=5,
            total_tokens=105,
            cost=cost,
            prompt_tokens_details=ChatUsagePromptTokensDetails(cached_tokens=cached_tokens),
            completion_tokens_details=ChatUsageCompletionTokensDetails(reasoning_tokens=2),
        ),
    )


def _judge(
    *,
    model: str = MODEL,
    output_token_limit: MaxTokensLimit | MaxCompletionTokensLimit | None = None,
) -> JudgeConfig:
    return JudgeConfig(
        provider_slug=PROVIDER_SLUG,
        provider_name=PROVIDER_NAME,
        model=model,
        temperature=0.0,
        seed=17,
        output_token_limit=output_token_limit or MaxCompletionTokensLimit(tokens=256),
    )


def _request(
    *,
    judge: JudgeConfig | None = None,
    request_stage: RequestStage = "initial",
    messages: tuple[CompletionMessage, ...] | None = None,
) -> CompletionRequest:
    return CompletionRequest(
        messages=messages
        or (
            CompletionMessage(role="system", content="rubric"),
            CompletionMessage(role="user", content="demonstration"),
            CompletionMessage(role="assistant", content="demonstration answer"),
            CompletionMessage(role="user", content="classify this relation"),
        ),
        judge=judge or _judge(),
        effort="minimal",
        session_id="family-session",
        timeout=timedelta(seconds=5),
        request_stage=request_stage,
    )


class FakeChat:
    def __init__(self, owner: FakeOpenRouter) -> None:
        self._owner = owner

    async def send_async(self, **kwargs: object) -> ChatResult:
        self._owner.calls.append(kwargs)
        response = self._owner.response
        if isinstance(response, Exception):
            raise response
        return response


class FakeOpenRouter:
    instances: ClassVar[list[Self]] = []
    response: ClassVar[ChatResult | Exception] = _result()

    def __init__(self, *, api_key: str, retry_config: RetryConfig) -> None:
        self.api_key = api_key
        self.retry_config = retry_config
        self.chat = FakeChat(self)
        self.calls: list[dict[str, object]] = []
        self.async_closed = False
        self.sync_closed = False
        self.instances.append(self)

    async def __aexit__(self, _kind: object, _error: object, _traceback: object) -> None:
        self.async_closed = True

    def __exit__(self, _kind: object, _error: object, _traceback: object) -> None:
        self.sync_closed = True


@pytest.mark.parametrize(
    ("limit", "expected", "unexpected"),
    [
        pytest.param(MaxTokensLimit(tokens=512), "max_tokens", "max_completion_tokens"),
        pytest.param(
            MaxCompletionTokensLimit(tokens=512),
            "max_completion_tokens",
            "max_tokens",
        ),
    ],
)
def test_native_async_request_pins_route_privacy_timeout_and_visible_retry_policy(
    monkeypatch: pytest.MonkeyPatch,
    limit: MaxTokensLimit | MaxCompletionTokensLimit,
    expected: str,
    unexpected: str,
) -> None:
    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = _result()
        monkeypatch.setattr(openrouter_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterTransport("secret")

        response = await transport.complete(_request(judge=_judge(output_token_limit=limit)))
        client = FakeOpenRouter.instances[0]
        kwargs = client.calls[0]
        provider = kwargs["provider"]

        assert isinstance(response, CompletionAccepted)
        assert response.content == '{"verdict":"proximal"}'
        assert response.result.usage is not None
        assert response.result.usage.cached_tokens == 80
        assert isinstance(provider, ProviderPreferences)
        assert provider.only == [PROVIDER_SLUG]
        assert provider.allow_fallbacks is False
        assert provider.require_parameters is True
        assert provider.data_collection == "deny"
        assert provider.zdr is True
        assert kwargs["stream"] is False
        assert kwargs["timeout_ms"] == 5_000
        assert kwargs["server_url"] == "https://openrouter.ai/api/v1"
        assert kwargs["x_open_router_metadata"] == "enabled"
        assert kwargs["http_headers"] == {"X-OpenRouter-Cache": "false"}
        assert kwargs[expected] == 512
        assert unexpected not in kwargs
        retries = kwargs["retries"]
        assert isinstance(retries, RetryConfig)
        assert retries.strategy == "none"
        assert retries.retry_connection_errors is False
        assert kwargs["temperature"] == 0.0
        assert kwargs["seed"] == 17
        assert "cache_control" not in kwargs

        await transport.aclose()
        await transport.aclose()
        assert client.async_closed
        assert client.sync_closed

    trio.run(scenario)


@pytest.mark.parametrize(
    ("request_stage", "messages", "boundary"),
    [
        pytest.param(
            "initial",
            (
                CompletionMessage(role="system", content="rubric"),
                CompletionMessage(role="user", content="demonstration"),
                CompletionMessage(role="assistant", content="demonstration answer"),
                CompletionMessage(role="user", content="classify this relation"),
            ),
            2,
            id="initial",
        ),
        pytest.param(
            "repair",
            (
                CompletionMessage(role="system", content="rubric"),
                CompletionMessage(role="user", content="demonstration"),
                CompletionMessage(role="assistant", content="demonstration answer"),
                CompletionMessage(role="user", content="classify this relation"),
                CompletionMessage(role="assistant", content="not json"),
                CompletionMessage(role="user", content="Reply with only the JSON object."),
            ),
            2,
            id="repair",
        ),
    ],
)
def test_anthropic_request_marks_only_the_stable_prefix_boundary(
    monkeypatch: pytest.MonkeyPatch,
    request_stage: RequestStage,
    messages: tuple[CompletionMessage, ...],
    boundary: int,
) -> None:
    async def scenario() -> None:
        model = "anthropic/test-model"
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = _result(model=model, requested_model=model)
        monkeypatch.setattr(openrouter_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterTransport("secret")

        await transport.complete(
            _request(
                judge=_judge(model=model),
                request_stage=request_stage,
                messages=messages,
            )
        )

        native_messages = _native_messages(FakeOpenRouter.instances[0].calls[0]["messages"])
        marked = native_messages[boundary]
        assert isinstance(marked.content, list)
        assert len(marked.content) == 1
        block = marked.content[0]
        assert isinstance(block, ChatContentText)
        assert block.text == messages[boundary].content
        assert block.cache_control is not None
        assert block.cache_control.type == "ephemeral"
        assert all(
            isinstance(message.content, str)
            for index, message in enumerate(native_messages)
            if index != boundary
        )
        assert "cache_control" not in FakeOpenRouter.instances[0].calls[0]
        await transport.aclose()

    trio.run(scenario)


def test_non_anthropic_request_leaves_message_content_unmodified(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = _result()
        monkeypatch.setattr(openrouter_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterTransport("secret")

        await transport.complete(_request())

        kwargs = FakeOpenRouter.instances[0].calls[0]
        native_messages = _native_messages(kwargs["messages"])
        assert [message.content for message in native_messages] == [
            "rubric",
            "demonstration",
            "demonstration answer",
            "classify this relation",
        ]
        assert "cache_control" not in kwargs
        await transport.aclose()

    trio.run(scenario)


def test_rejected_route_retains_native_result_for_durable_audit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = _result(provider_name="Unexpected Provider")
        monkeypatch.setattr(openrouter_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterTransport("secret")

        outcome = await transport.complete(_request())

        assert isinstance(outcome, CompletionRejected)
        assert outcome.failure.category == "routing"
        assert "selected endpoint used provider" in outcome.failure.message
        assert outcome.billed_result.model == MODEL
        assert outcome.billed_result.content == '{"verdict":"proximal"}'
        await transport.aclose()

    trio.run(scenario)


def test_persisted_route_check_uses_native_evidence_not_vote_summaries() -> None:
    accepted = ProviderResult.model_validate(
        _result().model_dump(mode="json", by_alias=True, exclude_unset=True),
        strict=True,
    )
    wrong_provider = ProviderResult.model_validate(
        _result(provider_name="Unexpected Provider").model_dump(
            mode="json",
            by_alias=True,
            exclude_unset=True,
        ),
        strict=True,
    )

    assert matches_pinned_route(accepted, _judge())
    assert not matches_pinned_route(accepted, _judge(model="different/model"))
    assert not matches_pinned_route(wrong_provider, _judge())


def test_sdk_request_failure_is_normalized_without_swallowing_cancellation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = NoResponseError("connection ended without a response")
        monkeypatch.setattr(openrouter_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterTransport("secret")

        outcome = await transport.complete(_request())

        assert isinstance(outcome, CompletionFailed)
        assert outcome.failure.category == "transport"
        assert "without a response" in outcome.failure.message
        await transport.aclose()

    trio.run(scenario)


@pytest.mark.parametrize("status", [401, 402])
def test_account_status_failure_is_explicitly_session_scoped(
    monkeypatch: pytest.MonkeyPatch,
    status: int,
) -> None:
    class AccountResponseError(NoResponseError):
        status_code: int

        def __init__(self) -> None:
            super().__init__(f"account status {status}")
            self.status_code = status

    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = AccountResponseError()
        monkeypatch.setattr(openrouter_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterTransport("secret")

        outcome = await transport.complete(_request())

        assert isinstance(outcome, CompletionFailed)
        assert outcome.failure.scope == "session"
        await transport.aclose()

    trio.run(scenario)


def test_transport_versions_expose_validated_implementation_pins() -> None:
    pins = transport_versions()

    assert pins.openrouter_sdk_version
    assert pins.openrouter_openapi_version
    with pytest.raises(ValueError, match="sdk_version"):
        TransportVersions(
            openrouter_sdk_version="",
            openrouter_openapi_version=pins.openrouter_openapi_version,
        )
