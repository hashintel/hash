"""Define provider-neutral contracts for one embedding batch."""

import math
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal, Protocol

from atlas_tools.relation.evaluation.domain.api import AttemptFailure

type EmbeddingVector = tuple[float, ...]

EMBEDDING_REQUEST_SCHEMA_VERSION = 1


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingRequest:
    """Pin one ordered, non-empty embedding batch and its expected shape."""

    schema_version: Literal[1] = EMBEDDING_REQUEST_SCHEMA_VERSION
    endpoint_url: str
    texts: tuple[str, ...]
    model: str
    dimension: int
    timeout: timedelta

    def __post_init__(self) -> None:
        if not self.texts:
            raise ValueError("embedding request texts must not be empty")
        if any(not text.strip() for text in self.texts):
            raise ValueError("embedding request texts must contain non-whitespace content")
        if self.schema_version != EMBEDDING_REQUEST_SCHEMA_VERSION:
            raise ValueError("unsupported embedding request schema version")
        if not self.endpoint_url:
            raise ValueError("embedding request endpoint URL must not be empty")
        if not self.model:
            raise ValueError("embedding request model must not be empty")
        if isinstance(self.dimension, bool) or self.dimension <= 0:
            raise ValueError("embedding request dimension must be positive")
        if self.timeout <= timedelta():
            raise ValueError("embedding request timeout must be positive")


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingUsage:
    """Record provider accounting returned with one embedding batch."""

    input_tokens: int
    total_tokens: int
    cost_usd: float | None

    def __post_init__(self) -> None:
        if type(self.input_tokens) is not int or self.input_tokens < 0:
            raise ValueError("embedding input tokens must be a non-negative integer")
        if type(self.total_tokens) is not int or self.total_tokens < self.input_tokens:
            raise ValueError("embedding total tokens must cover input tokens")
        if self.cost_usd is not None and (
            type(self.cost_usd) is not float
            or not math.isfinite(self.cost_usd)
            or self.cost_usd < 0.0
        ):
            raise ValueError("embedding cost must be a non-negative finite float")


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingAccepted:
    """An ordered embedding batch satisfying its declared vector shape."""

    model: str
    dimension: int
    vectors: tuple[EmbeddingVector, ...]
    usage: EmbeddingUsage | None = None

    def __post_init__(self) -> None:
        if not self.model:
            raise ValueError("embedding outcome model must not be empty")
        if isinstance(self.dimension, bool) or self.dimension <= 0:
            raise ValueError("embedding outcome dimension must be positive")
        if not self.vectors:
            raise ValueError("embedding outcome vectors must not be empty")
        if any(len(vector) != self.dimension for vector in self.vectors):
            raise ValueError("embedding vectors must match the declared dimension")
        if any(not isinstance(value, float) for vector in self.vectors for value in vector):
            raise TypeError("embedding vectors must contain floats")
        if any(not math.isfinite(value) for vector in self.vectors for value in vector):
            raise ValueError("embedding vectors must contain only finite floats")


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingFailed:
    """A provider exchange that returned no embedding response."""

    failure: AttemptFailure


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingRejected:
    """A returned embedding response that violated the local contract."""

    failure: AttemptFailure
    usage: EmbeddingUsage | None = None


type EmbeddingOutcome = EmbeddingAccepted | EmbeddingFailed | EmbeddingRejected


class AsyncEmbeddingTransport(Protocol):
    """Return one visible embedding exchange without hidden retries."""

    async def embed(self, request: EmbeddingRequest) -> EmbeddingOutcome:
        """Send and validate one ordered embedding batch."""

    async def aclose(self) -> None:
        """Close every owned network client and connection pool."""
