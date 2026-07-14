"""Expose completion contracts and supported transports without SDK types."""

from atlas_tools.relation.evaluation.domain.api import (
    ACTIVE_COMPLETION_REQUEST_POLICY_ID,
    AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID,
    COMPLETION_REQUEST_POLICY_IDS,
    HISTORICAL_COMPLETION_REQUEST_POLICY_IDS,
    LEGACY_COMPLETION_REQUEST_POLICY_ID,
    CompletionRequestPolicyId,
    HistoricalCompletionRequestPolicyId,
)
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
    EMBEDDING_REQUEST_SCHEMA_VERSION,
    AsyncEmbeddingTransport,
    EmbeddingAccepted,
    EmbeddingFailed,
    EmbeddingOutcome,
    EmbeddingRejected,
    EmbeddingRequest,
    EmbeddingUsage,
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
    normalize_openrouter_embedding_endpoint,
    openrouter_embedding_server_url,
)
from atlas_tools.relation.evaluation.transport.version import (
    TransportVersions,
    transport_versions,
)

__all__ = [
    "ACTIVE_COMPLETION_REQUEST_POLICY_ID",
    "AUTOMATIC_ANTHROPIC_COMPLETION_REQUEST_POLICY_ID",
    "COMPLETION_REQUEST_POLICY_IDS",
    "EMBEDDING_REQUEST_SCHEMA_VERSION",
    "HISTORICAL_COMPLETION_REQUEST_POLICY_IDS",
    "LEGACY_COMPLETION_REQUEST_POLICY_ID",
    "AsyncCompletionTransport",
    "AsyncEmbeddingTransport",
    "CompletionAccepted",
    "CompletionFailed",
    "CompletionMessage",
    "CompletionOutcome",
    "CompletionRejected",
    "CompletionRequest",
    "CompletionRequestPolicyId",
    "EmbeddingAccepted",
    "EmbeddingFailed",
    "EmbeddingOutcome",
    "EmbeddingRejected",
    "EmbeddingRequest",
    "EmbeddingUsage",
    "EmbeddingVector",
    "HistoricalCompletionRequestPolicyId",
    "OpenRouterEmbeddingTransport",
    "OpenRouterTransport",
    "TransportVersions",
    "matches_pinned_route",
    "normalize_openrouter_embedding_endpoint",
    "openrouter_embedding_server_url",
    "request_hash",
    "request_policy_payload",
    "transport_versions",
]
