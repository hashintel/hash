"""Expose deterministic, self-verifying downstream analysis codecs.

Writers normalize rows by relation ID and publish metadata last. Loaders fail
closed on byte, schema, algorithm, provenance, dimension, fold, probability,
or ordered-card disagreement. Every synchronous filesystem operation has a
Trio-to-thread counterpart with the same contract.
"""

from atlas_tools.relation.evaluation.application._analysis_codec import (
    CLASSIFIER_ARRAYS_FILENAME,
    CLASSIFIER_METADATA_FILENAME,
    CLASSIFIER_OUT_OF_FOLD_FILENAME,
)
from atlas_tools.relation.evaluation.application._classifier_codec import (
    load_classifier_bundle,
    load_classifier_bundle_async,
    write_classifier_bundle,
    write_classifier_bundle_async,
)
from atlas_tools.relation.evaluation.application._embedding_codec import (
    load_embeddings,
    load_embeddings_async,
    write_embeddings,
    write_embeddings_async,
)
from atlas_tools.relation.evaluation.application._soft_label_codec import (
    load_soft_labels,
    load_soft_labels_async,
    write_soft_labels,
    write_soft_labels_async,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierArrays,
    ClassifierBundle,
    ClassifierBundleMetadata,
    ClassifierClosureBinding,
    EmbeddingProducerIdentity,
    EmbeddingRequestIdentity,
    EmbeddingResponseIdentity,
    EmbeddingsArtifact,
    EmbeddingsMetadata,
    SoftLabelsArtifact,
    SoftLabelsMetadata,
)

__all__ = [
    "CLASSIFIER_ARRAYS_FILENAME",
    "CLASSIFIER_METADATA_FILENAME",
    "CLASSIFIER_OUT_OF_FOLD_FILENAME",
    "ClassifierArrays",
    "ClassifierBundle",
    "ClassifierBundleMetadata",
    "ClassifierClosureBinding",
    "EmbeddingProducerIdentity",
    "EmbeddingRequestIdentity",
    "EmbeddingResponseIdentity",
    "EmbeddingsArtifact",
    "EmbeddingsMetadata",
    "SoftLabelsArtifact",
    "SoftLabelsMetadata",
    "load_classifier_bundle",
    "load_classifier_bundle_async",
    "load_embeddings",
    "load_embeddings_async",
    "load_soft_labels",
    "load_soft_labels_async",
    "write_classifier_bundle",
    "write_classifier_bundle_async",
    "write_embeddings",
    "write_embeddings_async",
    "write_soft_labels",
    "write_soft_labels_async",
]
