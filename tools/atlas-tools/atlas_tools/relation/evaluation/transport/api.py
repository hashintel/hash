"""Expose completion contracts and supported transports without SDK types."""

from atlas_tools.relation.evaluation.transport.completion import (
    AsyncCompletionTransport,
    CompletionAccepted,
    CompletionFailed,
    CompletionMessage,
    CompletionOutcome,
    CompletionRejected,
    CompletionRequest,
)
from atlas_tools.relation.evaluation.transport.embedding import (
    AsyncEmbeddingTransport,
    EmbeddingAccepted,
    EmbeddingFailed,
    EmbeddingOutcome,
    EmbeddingRejected,
    EmbeddingRequest,
    EmbeddingVector,
)
from atlas_tools.relation.evaluation.transport.identity import (
    request_hash,
    request_policy_payload,
)
from atlas_tools.relation.evaluation.transport.openrouter import (
    OpenRouterTransport,
    matches_pinned_route,
)
from atlas_tools.relation.evaluation.transport.openrouter_embedding import (
    OpenRouterEmbeddingTransport,
)
from atlas_tools.relation.evaluation.transport.version import (
    TransportVersions,
    transport_versions,
)

__all__ = [
    "AsyncCompletionTransport",
    "AsyncEmbeddingTransport",
    "CompletionAccepted",
    "CompletionFailed",
    "CompletionMessage",
    "CompletionOutcome",
    "CompletionRejected",
    "CompletionRequest",
    "EmbeddingAccepted",
    "EmbeddingFailed",
    "EmbeddingOutcome",
    "EmbeddingRejected",
    "EmbeddingRequest",
    "EmbeddingVector",
    "OpenRouterEmbeddingTransport",
    "OpenRouterTransport",
    "TransportVersions",
    "matches_pinned_route",
    "request_hash",
    "request_policy_payload",
    "transport_versions",
]
