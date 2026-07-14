from datetime import timedelta
from typing import ClassVar, Self

import pytest
import trio
from openrouter.errors import NoResponseError
from openrouter.operations.createembeddings import (
    CreateEmbeddingsData,
    CreateEmbeddingsResponseBody,
)
from openrouter.utils.retries import RetryConfig

from atlas_tools.relation.evaluation.transport import (
    openrouter_embedding as embedding_module,
)
from atlas_tools.relation.evaluation.transport.api import (
    EmbeddingAccepted,
    EmbeddingFailed,
    EmbeddingRejected,
    EmbeddingRequest,
    OpenRouterEmbeddingTransport,
)

MODEL = "openai/text-embedding-3-large"


def _request(*, texts: tuple[str, ...] = ("alpha", "beta")) -> EmbeddingRequest:
    return EmbeddingRequest(
        texts=texts,
        model=MODEL,
        dimension=3,
        timeout=timedelta(seconds=4),
    )


def _response(
    vectors: tuple[list[float], ...],
    *,
    indices: tuple[int | None, ...] | None = None,
    model: str = MODEL,
) -> CreateEmbeddingsResponseBody:
    resolved = indices or tuple(range(len(vectors)))
    return CreateEmbeddingsResponseBody(
        data=[
            CreateEmbeddingsData(
                embedding=vector,
                index=index,
                object="embedding",
            )
            for vector, index in zip(vectors, resolved, strict=True)
        ],
        model=model,
        object="list",
    )


class FakeEmbeddings:
    def __init__(self, owner: FakeOpenRouter) -> None:
        self._owner = owner

    async def generate_async(
        self,
        **kwargs: object,
    ) -> CreateEmbeddingsResponseBody | str:
        self._owner.calls.append(kwargs)
        response = self._owner.response
        if isinstance(response, Exception):
            raise response
        return response


class FakeOpenRouter:
    instances: ClassVar[list[Self]] = []
    response: ClassVar[CreateEmbeddingsResponseBody | str | Exception] = _response(
        ([1.0, 2.0, 3.0], [4.0, 5.0, 6.0])
    )

    def __init__(self, *, api_key: str, retry_config: RetryConfig) -> None:
        self.api_key = api_key
        self.retry_config = retry_config
        self.embeddings = FakeEmbeddings(self)
        self.calls: list[dict[str, object]] = []
        self.async_closed = False
        self.sync_closed = False
        self.instances.append(self)

    async def __aexit__(self, _kind: object, _error: object, _traceback: object) -> None:
        self.async_closed = True

    def __exit__(self, _kind: object, _error: object, _traceback: object) -> None:
        self.sync_closed = True


class _AsyncCloseError(RuntimeError):
    pass


class _FailingCloseProbe:
    instances: ClassVar[list[Self]] = []

    def __init__(self, *, api_key: str, retry_config: RetryConfig) -> None:
        del api_key, retry_config
        self.async_exit_calls = 0
        self.sync_exit_calls = 0
        self.instances.append(self)

    async def __aexit__(self, _kind: object, _error: object, _traceback: object) -> None:
        self.async_exit_calls += 1
        if self.async_exit_calls == 1:
            raise _AsyncCloseError("asynchronous SDK close failed")

    def __exit__(self, _kind: object, _error: object, _traceback: object) -> None:
        self.sync_exit_calls += 1


def test_native_async_embedding_orders_vectors_and_pins_request_policy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = _response(
            ([4.0, 5.0, 6.0], [1.0, 2.0, 3.0]),
            indices=(1, 0),
        )
        monkeypatch.setattr(embedding_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterEmbeddingTransport(
            "secret",
            maximum_batch_size=8,
            server_url="https://openrouter.test/api/v1",
        )

        outcome = await transport.embed(_request())

        assert isinstance(outcome, EmbeddingAccepted)
        assert outcome.model == MODEL
        assert outcome.dimension == 3
        assert outcome.vectors == (
            (1.0, 2.0, 3.0),
            (4.0, 5.0, 6.0),
        )
        client = FakeOpenRouter.instances[0]
        kwargs = client.calls[0]
        assert kwargs["input"] == ["alpha", "beta"]
        assert kwargs["model"] == MODEL
        assert kwargs["dimensions"] == 3
        assert kwargs["encoding_format"] == "float"
        assert kwargs["timeout_ms"] == 4_000
        assert kwargs["server_url"] == "https://openrouter.test/api/v1"
        retries = kwargs["retries"]
        assert isinstance(retries, RetryConfig)
        assert retries.strategy == "none"
        assert retries.retry_connection_errors is False

        await transport.aclose()
        await transport.aclose()
        assert client.async_closed
        assert client.sync_closed
        with pytest.raises(RuntimeError, match="closed"):
            await transport.embed(_request())

    trio.run(scenario)


def test_embedding_close_remains_retryable_after_async_sdk_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        _FailingCloseProbe.instances.clear()
        monkeypatch.setattr(embedding_module, "OpenRouter", _FailingCloseProbe)
        transport = OpenRouterEmbeddingTransport("secret", maximum_batch_size=8)
        client = _FailingCloseProbe.instances[-1]

        with pytest.raises(_AsyncCloseError, match="asynchronous SDK close failed"):
            await transport.aclose()
        await transport.aclose()

        assert client.async_exit_calls == 2
        assert client.sync_exit_calls == 1

    trio.run(scenario)


def test_embedding_batch_bound_fails_before_any_provider_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        monkeypatch.setattr(embedding_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterEmbeddingTransport("secret", maximum_batch_size=2)

        with pytest.raises(ValueError, match="maximum is 2"):
            await transport.embed(_request(texts=("alpha", "beta", "gamma")))

        assert FakeOpenRouter.instances[0].calls == []
        await transport.aclose()

    trio.run(scenario)


def test_embedding_request_rejects_empty_or_blank_batches() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        _request(texts=())
    with pytest.raises(ValueError, match="non-whitespace"):
        _request(texts=("alpha", "  "))


@pytest.mark.parametrize(
    ("response", "message"),
    [
        pytest.param(
            _response(([1.0, 2.0, 3.0],)),
            "1 vectors for 2 inputs",
            id="cardinality",
        ),
        pytest.param(
            _response(
                ([1.0, 2.0, 3.0], [4.0, 5.0, 6.0]),
                indices=(0, 0),
            ),
            "indices do not cover",
            id="indices",
        ),
        pytest.param(
            _response(([1.0, 2.0], [4.0, 5.0, 6.0])),
            "dimension 2, expected 3",
            id="dimension",
        ),
        pytest.param(
            _response(([1.0, float("nan"), 3.0], [4.0, 5.0, 6.0])),
            "non-finite",
            id="nan",
        ),
        pytest.param(
            _response(([1.0, float("inf"), 3.0], [4.0, 5.0, 6.0])),
            "non-finite",
            id="infinity",
        ),
        pytest.param(
            _response(
                ([1.0, 2.0, 3.0], [4.0, 5.0, 6.0]),
                model="foreign/model",
            ),
            "foreign/model",
            id="model",
        ),
    ],
)
def test_malformed_embedding_response_is_a_typed_rejection(
    monkeypatch: pytest.MonkeyPatch,
    response: CreateEmbeddingsResponseBody,
    message: str,
) -> None:
    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = response
        monkeypatch.setattr(embedding_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterEmbeddingTransport("secret", maximum_batch_size=8)

        outcome = await transport.embed(_request())

        assert isinstance(outcome, EmbeddingRejected)
        assert message in outcome.failure.message
        await transport.aclose()

    trio.run(scenario)


def test_known_sdk_embedding_failure_is_a_typed_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def scenario() -> None:
        FakeOpenRouter.instances.clear()
        FakeOpenRouter.response = NoResponseError("embedding connection ended")
        monkeypatch.setattr(embedding_module, "OpenRouter", FakeOpenRouter)
        transport = OpenRouterEmbeddingTransport("secret", maximum_batch_size=8)

        outcome = await transport.embed(_request())

        assert isinstance(outcome, EmbeddingFailed)
        assert outcome.failure.category == "transport"
        assert "connection ended" in outcome.failure.message
        await transport.aclose()

    trio.run(scenario)
