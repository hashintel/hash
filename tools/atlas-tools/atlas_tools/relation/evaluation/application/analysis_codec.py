"""Expose deterministic, self-verifying downstream analysis codecs.

Writers normalize rows by relation ID and publish metadata last. Loaders fail
closed on byte, schema, algorithm, provenance, dimension, fold, probability,
or ordered-card disagreement. Every synchronous filesystem operation has a
Trio-to-thread counterpart with the same contract.
"""

from collections.abc import Mapping
from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.application._analysis_schema import (
    CLASSIFIER_ARRAYS_FILENAME,
    CLASSIFIER_METADATA_FILENAME,
    CLASSIFIER_OUT_OF_FOLD_FILENAME,
)
from atlas_tools.relation.evaluation.application._classifier_codec import (
    load_classifier_bundle as _load_classifier_bundle,
)
from atlas_tools.relation.evaluation.application._classifier_codec import (
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
    ClassifierTargetResolutionBinding,
    EmbeddingProducerIdentity,
    EmbeddingRequestIdentity,
    EmbeddingResponseIdentity,
    EmbeddingsArtifact,
    EmbeddingsMetadata,
    SoftLabelsArtifact,
    SoftLabelsMetadata,
)
from atlas_tools.relation.evaluation.application.target_resolution import (
    classifier_target_resolution_binding,
    load_target_resolutions,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex
from atlas_tools.relation.family_closure.api import VerifiedFamilyClosure


def _target_resolution_binding(
    *,
    closure: VerifiedFamilyClosure,
    soft_labels: SoftLabelsArtifact | Path | None,
    resolutions_directory: Path | None,
) -> ClassifierTargetResolutionBinding | None:
    if (soft_labels is None) != (resolutions_directory is None):
        raise ValueError("soft labels and target resolutions must be provided together")
    if soft_labels is None or resolutions_directory is None:
        return None
    artifact = load_target_resolutions(
        resolutions_directory,
        soft_labels=soft_labels,
        expected_cards_hash=closure.manifest.details.concat.cards_hash,
        expected_cards_manifest_hash=closure.manifest.details.concat.manifest_hash,
    )
    return classifier_target_resolution_binding(artifact)


def load_classifier_bundle(
    directory: Path,
    *,
    closure: VerifiedFamilyClosure,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
    soft_labels: SoftLabelsArtifact | Path | None = None,
    resolutions_directory: Path | None = None,
) -> ClassifierBundle:
    """Load a classifier after revalidating closure and reviewed targets."""
    target_binding = _target_resolution_binding(
        closure=closure,
        soft_labels=soft_labels,
        resolutions_directory=resolutions_directory,
    )
    return _load_classifier_bundle(
        directory,
        closure=closure,
        expected_source_hashes=expected_source_hashes,
        expected_target_resolutions=target_binding,
    )


async def load_classifier_bundle_async(
    directory: Path,
    *,
    closure: VerifiedFamilyClosure,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
    soft_labels: SoftLabelsArtifact | Path | None = None,
    resolutions_directory: Path | None = None,
) -> ClassifierBundle:
    """Revalidate a classifier without blocking Trio's event loop."""
    operation = partial(
        load_classifier_bundle,
        directory,
        closure=closure,
        expected_source_hashes=(
            None if expected_source_hashes is None else dict(expected_source_hashes)
        ),
        soft_labels=soft_labels,
        resolutions_directory=resolutions_directory,
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)


__all__ = [
    "CLASSIFIER_ARRAYS_FILENAME",
    "CLASSIFIER_METADATA_FILENAME",
    "CLASSIFIER_OUT_OF_FOLD_FILENAME",
    "ClassifierArrays",
    "ClassifierBundle",
    "ClassifierBundleMetadata",
    "ClassifierClosureBinding",
    "ClassifierTargetResolutionBinding",
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
