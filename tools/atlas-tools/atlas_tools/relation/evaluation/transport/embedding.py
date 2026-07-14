"""Define provider-neutral contracts for one embedding batch."""

import math
from dataclasses import dataclass
from datetime import timedelta
from typing import Protocol

from atlas_tools.relation.evaluation.domain.api import AttemptFailure

type EmbeddingVector = tuple[float, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingRequest:
    """Pin one ordered, non-empty embedding batch and its expected shape."""

    texts: tuple[str, ...]
    model: str
    dimension: int
    timeout: timedelta

    def __post_init__(self) -> None:
        if not self.texts:
            raise ValueError("embedding request texts must not be empty")
        if any(not text.strip() for text in self.texts):
            raise ValueError("embedding request texts must contain non-whitespace content")
        if not self.model:
            raise ValueError("embedding request model must not be empty")
        if isinstance(self.dimension, bool) or self.dimension <= 0:
            raise ValueError("embedding request dimension must be positive")
        if self.timeout <= timedelta():
            raise ValueError("embedding request timeout must be positive")


@dataclass(frozen=True, slots=True, kw_only=True)
class EmbeddingAccepted:
    """An ordered embedding batch satisfying its declared vector shape."""

    model: str
    dimension: int
    vectors: tuple[EmbeddingVector, ...]

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


type EmbeddingOutcome = EmbeddingAccepted | EmbeddingFailed | EmbeddingRejected


class AsyncEmbeddingTransport(Protocol):
    """Return one visible embedding exchange without hidden retries."""

    async def embed(self, request: EmbeddingRequest) -> EmbeddingOutcome:
        """Send and validate one ordered embedding batch."""

    async def aclose(self) -> None:
        """Close every owned network client and connection pool."""
