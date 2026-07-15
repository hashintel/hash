"""Send validated embedding batches through OpenRouter's native async API."""

import math
from typing import Literal, Self
from urllib.parse import urlsplit, urlunsplit

from openrouter import OpenRouter
from openrouter.errors import NoResponseError, OpenRouterError
from openrouter.operations.createembeddings import CreateEmbeddingsResponseBody

from atlas_tools.relation.evaluation.domain.api import (
    AccountingFailure,
    ResponseFailure,
    RoutingFailure,
    normalize_embedding_endpoint_url,
)
from atlas_tools.relation.evaluation.transport._lifetime import SdkClientLifetime
from atlas_tools.relation.evaluation.transport._sdk import (
    NO_RETRIES,
    timeout_milliseconds,
)
from atlas_tools.relation.evaluation.transport.embedding import (
    EmbeddingAccepted,
    EmbeddingFailed,
    EmbeddingOutcome,
    EmbeddingRejected,
    EmbeddingRequest,
    EmbeddingUsage,
    EmbeddingVector,
)
from atlas_tools.relation.evaluation.transport.failure import request_failure


def normalize_openrouter_embedding_endpoint(endpoint_url: str) -> str:
    """Validate and canonicalize one OpenRouter embeddings operation URL.

    The normalized URL is stable cache identity. It excludes credentials,
    queries, and fragments and removes a trailing slash from the operation
    path.

    Raises:
        ValueError: The URL is not an HTTPS ``/embeddings`` operation.

    """
    return normalize_embedding_endpoint_url(endpoint_url)


def openrouter_embedding_server_url(endpoint_url: str) -> str:
    """Return the SDK server base for a validated operation URL."""
    operation_url = normalize_openrouter_embedding_endpoint(endpoint_url)
    parsed = urlsplit(operation_url)
    base_path = parsed.path.removesuffix("/embeddings")
    return urlunsplit((parsed.scheme, parsed.netloc, base_path, "", ""))


class _RejectedError(ValueError):
    __slots__ = ("category",)

    def __init__(
        self,
        category: Literal["accounting", "response", "routing"],
        message: str,
    ) -> None:
        super().__init__(message)
        self.category = category


def _rejection(
    error: _RejectedError,
    *,
    usage: EmbeddingUsage | None = None,
) -> EmbeddingRejected:
    failure_types = {
        "accounting": AccountingFailure,
        "response": ResponseFailure,
        "routing": RoutingFailure,
    }
    failure_type = failure_types[error.category]
    return EmbeddingRejected(
        failure=failure_type(
            exception_type=f"{type(error).__module__}.{type(error).__qualname__}",
            message=str(error),
        ),
        usage=usage,
    )


def _vector(value: list[float] | str, *, dimension: int, index: int) -> EmbeddingVector:
    if isinstance(value, str):
        raise _RejectedError(
            "response",
            f"embedding {index} used base64 despite float encoding",
        )

    if len(value) != dimension:
        raise _RejectedError(
            "response",
            f"embedding {index} has dimension {len(value)}, expected {dimension}",
        )

    vector = tuple(float(component) for component in value)
    if any(not math.isfinite(component) for component in vector):
        raise _RejectedError(
            "response",
            f"embedding {index} contains a non-finite value",
        )

    return vector


def _canonical_response_model(response_model: str, request_model: str) -> str:
    if response_model == request_model:
        return request_model

    _provider, separator, provider_model = request_model.partition("/")
    if separator and response_model == provider_model:
        return request_model

    raise _RejectedError(
        "routing",
        f"embedding response used model {response_model!r}, expected {request_model!r}",
    )


def _accepted(
    response: CreateEmbeddingsResponseBody,
    request: EmbeddingRequest,
    usage: EmbeddingUsage | None,
) -> EmbeddingAccepted:
    model = _canonical_response_model(response.model, request.model)

    if len(response.data) != len(request.texts):
        raise _RejectedError(
            "response",
            f"embedding response returned {len(response.data)} vectors for "
            f"{len(request.texts)} inputs",
        )

    indices = tuple(datum.index for datum in response.data)
    expected = tuple(range(len(request.texts)))
    if None in indices or tuple(sorted(indices)) != expected:
        raise _RejectedError(
            "response",
            "embedding response indices do not cover the request batch exactly",
        )

    by_index = {datum.index: datum for datum in response.data}
    vectors = tuple(
        _vector(
            by_index[index].embedding,
            dimension=request.dimension,
            index=index,
        )
        for index in expected
    )

    return EmbeddingAccepted(
        model=model,
        dimension=request.dimension,
        vectors=vectors,
        usage=usage,
    )


def _usage(response: CreateEmbeddingsResponseBody) -> EmbeddingUsage | None:
    if response.usage is not None:
        try:
            return EmbeddingUsage(
                input_tokens=response.usage.prompt_tokens,
                total_tokens=response.usage.total_tokens,
                cost_usd=response.usage.cost,
            )
        except (TypeError, ValueError) as error:
            raise _RejectedError("accounting", f"invalid embedding usage: {error}") from error
    return None


class OpenRouterEmbeddingTransport:
    """Own one SDK client for bounded, retry-visible embedding batches.

    The caller owns batching policy and must close this adapter. Each call uses
    the generated async embeddings method and disables SDK retries explicitly.
    Filesystem caches, parquet output, and credential lookup stay outside this
    boundary.
    """

    __slots__ = (
        "_client",
        "_closed",
        "_lifetime",
        "_maximum_batch_size",
        "_server_url",
    )

    def __init__(
        self,
        api_key: str,
        *,
        maximum_batch_size: int,
        server_url: str | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("OpenRouter API key must not be empty")

        if isinstance(maximum_batch_size, bool) or maximum_batch_size <= 0:
            raise ValueError("maximum_batch_size must be positive")

        if server_url is not None and not server_url:
            raise ValueError("server_url must not be empty")

        self._client = OpenRouter(api_key=api_key, retry_config=NO_RETRIES)
        self._maximum_batch_size = maximum_batch_size
        self._server_url = server_url
        self._closed = False
        self._lifetime = SdkClientLifetime(self._client)

    async def embed(self, request: EmbeddingRequest) -> EmbeddingOutcome:
        """Send and validate one ordered batch.

        Raises:
            RuntimeError: The adapter is closed.
            ValueError: The caller exceeds the configured batch bound.

        Known SDK and provider failures are returned as `EmbeddingFailed`.
        Malformed provider responses are returned as `EmbeddingRejected`.
        Unknown exceptions and cancellation propagate unchanged.
        """
        if self._closed:
            raise RuntimeError("OpenRouter embedding transport is closed")

        if len(request.texts) > self._maximum_batch_size:
            raise ValueError(
                f"embedding batch has {len(request.texts)} texts, maximum is "
                f"{self._maximum_batch_size}"
            )

        try:
            request_server_url = openrouter_embedding_server_url(request.endpoint_url)
        except ValueError as error:
            return _rejection(_RejectedError("routing", str(error)))
        if self._server_url is not None and self._server_url.rstrip("/") != request_server_url:
            return _rejection(
                _RejectedError(
                    "routing",
                    "embedding request endpoint disagrees with the configured SDK server",
                )
            )

        try:
            response = await self._client.embeddings.generate_async(
                input=list(request.texts),
                model=request.model,
                dimensions=request.dimension,
                encoding_format="float",
                retries=NO_RETRIES,
                server_url=request_server_url,
                timeout_ms=timeout_milliseconds(request.timeout),
            )
        except (OpenRouterError, NoResponseError) as error:
            return EmbeddingFailed(failure=request_failure(error))

        if not isinstance(response, CreateEmbeddingsResponseBody):
            return _rejection(
                _RejectedError("response", "embedding endpoint returned a non-object response")
            )

        usage: EmbeddingUsage | None = None
        try:
            usage = _usage(response)
            return _accepted(response, request, usage)
        except _RejectedError as error:
            return _rejection(error, usage=usage)

    async def aclose(self) -> None:
        """Close both SDK clients, preserving unfinished work for a retry."""
        if self._closed:
            return
        await self._lifetime.aclose()
        self._closed = True

    async def __aenter__(self) -> Self:
        """Return this adapter for one explicitly owned async lifetime."""
        if self._closed:
            raise RuntimeError("OpenRouter embedding transport is closed")
        return self

    async def __aexit__(self, _exc_type: object, _exc: object, _traceback: object) -> None:
        """Close the adapter at the end of its owned async lifetime."""
        await self.aclose()
