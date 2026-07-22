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

from atlas_tools.common import sha256_file
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
    ClassifierCoincidentReviewBinding,
    ClassifierTargetResolutionBinding,
    EmbeddingProducerIdentity,
    EmbeddingRequestIdentity,
    EmbeddingResponseIdentity,
    EmbeddingsArtifact,
    EmbeddingsMetadata,
    LegacyClassifierBundleMetadata,
    SoftLabelsArtifact,
    SoftLabelsMetadata,
)
from atlas_tools.relation.evaluation.application.coincident_classifier import (
    classifier_coincident_review_binding,
    load_classifier_coincident_reviews,
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
    soft_labels: SoftLabelsArtifact | None,
    resolutions_directory: Path | None,
) -> ClassifierTargetResolutionBinding | None:
    if resolutions_directory is None:
        return None
    if soft_labels is None:
        raise ValueError("target resolutions require soft labels")
    artifact = load_target_resolutions(
        resolutions_directory,
        soft_labels=soft_labels,
        expected_cards_hash=closure.manifest.details.concat.cards_hash,
        expected_cards_manifest_hash=closure.manifest.details.concat.manifest_hash,
    )
    return classifier_target_resolution_binding(artifact)


def _coincident_review_binding(
    *,
    closure: VerifiedFamilyClosure,
    soft_labels: SoftLabelsArtifact | None,
    coincident_reviews_directory: Path | None,
    deliverables_directory: Path | None,
) -> ClassifierCoincidentReviewBinding | None:
    if (coincident_reviews_directory is None) != (deliverables_directory is None):
        raise ValueError("Coincident reviews and grid deliverables must be provided together")
    if coincident_reviews_directory is None or deliverables_directory is None:
        return None
    if soft_labels is None:
        raise ValueError("Coincident reviews require soft labels")
    artifact = load_classifier_coincident_reviews(
        coincident_reviews_directory,
        deliverables=deliverables_directory,
        soft_labels=soft_labels,
        expected_cards_hash=closure.manifest.details.concat.cards_hash,
    )
    return classifier_coincident_review_binding(artifact)


def _loaded_soft_labels(
    source: SoftLabelsArtifact | Path | None,
) -> SoftLabelsArtifact | None:
    if source is None:
        return None
    return source if isinstance(source, SoftLabelsArtifact) else load_soft_labels(source)


def _validate_classifier_soft_labels(
    bundle: ClassifierBundle,
    soft_labels: SoftLabelsArtifact | None,
) -> None:
    if soft_labels is None:
        return
    expected = {
        "soft-labels.parquet": sha256_file(soft_labels.path),
        "soft-labels.meta.json": sha256_file(soft_labels.sidecar_path),
    }
    observed = bundle.metadata.source_hashes
    if any(observed.get(name) != digest for name, digest in expected.items()):
        raise ValueError("classifier is bound to different soft-label artifact bytes")


def load_classifier_bundle(
    directory: Path,
    *,
    closure: VerifiedFamilyClosure,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
    soft_labels: SoftLabelsArtifact | Path | None = None,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
) -> ClassifierBundle:
    """Load a classifier after revalidating closure and reviewed targets."""
    labels = _loaded_soft_labels(soft_labels)
    target_binding = _target_resolution_binding(
        closure=closure,
        soft_labels=labels,
        resolutions_directory=resolutions_directory,
    )
    coincident_binding = _coincident_review_binding(
        closure=closure,
        soft_labels=labels,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
    )
    bundle = _load_classifier_bundle(
        directory,
        closure=closure,
        expected_source_hashes=expected_source_hashes,
        expected_target_resolutions=target_binding,
        expected_coincident_reviews=coincident_binding,
    )
    _validate_classifier_soft_labels(bundle, labels)
    return bundle


async def load_classifier_bundle_async(
    directory: Path,
    *,
    closure: VerifiedFamilyClosure,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
    soft_labels: SoftLabelsArtifact | Path | None = None,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
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
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
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
    "ClassifierCoincidentReviewBinding",
    "ClassifierTargetResolutionBinding",
    "EmbeddingProducerIdentity",
    "EmbeddingRequestIdentity",
    "EmbeddingResponseIdentity",
    "EmbeddingsArtifact",
    "EmbeddingsMetadata",
    "LegacyClassifierBundleMetadata",
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
