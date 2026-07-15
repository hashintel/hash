"""Write deterministic, family-bound classifier bundles."""

from collections.abc import Mapping
from functools import partial
from pathlib import Path
from types import MappingProxyType

import trio

from atlas_tools.relation.evaluation.analysis.api import ClassifierFit
from atlas_tools.relation.evaluation.application._analysis_codec import (
    OutOfFoldDiskRow,
    atomic_replace,
    deterministic_npz,
    fold_assignment_hash,
    model_bytes,
    parquet_bytes,
    relation_order_hash,
    sha256_bytes,
)
from atlas_tools.relation.evaluation.application._analysis_schema import (
    CLASSIFIER_ARRAYS_FILENAME,
    CLASSIFIER_METADATA_FILENAME,
    CLASSIFIER_OUT_OF_FOLD_FILENAME,
    OUT_OF_FOLD_SCHEMA,
)
from atlas_tools.relation.evaluation.application._classifier_codec_validation import (
    SCHEMA_HASHES,
    algorithms,
    array_mapping,
    classifier_arrays,
    closure_binding,
    validate_closure_rows,
    validate_fit,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierBundle,
    ClassifierBundleMetadata,
    ClassifierTargetResolutionBinding,
    hash_mapping,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex
from atlas_tools.relation.family_closure.api import VerifiedFamilyClosure


def write_classifier_bundle(
    directory: Path,
    fit: ClassifierFit,
    *,
    source_hashes: Mapping[str, Sha256Hex],
    closure: VerifiedFamilyClosure,
    target_resolutions: ClassifierTargetResolutionBinding | None = None,
) -> ClassifierBundle:
    """Write a classifier bundle whose metadata binds every numeric artifact.

    Numeric arrays use deterministic uncompressed NPZ members with no pickle
    support. The JSON manifest is published only after both content files are
    durable, making it the bundle's commit marker.

    Raises:
        ValueError: Fit rows, folds, probabilities, applicability, or metadata
            disagree with one another.
        OSError: A bundle file cannot be durably published.

    """
    rows = validate_fit(fit)
    validate_closure_rows(rows, closure)
    classifier = fit.classifier
    arrays = classifier_arrays(fit)
    arrays_payload = deterministic_npz(array_mapping(arrays))
    disk_rows = tuple(OutOfFoldDiskRow.from_prediction(row) for row in rows)
    out_of_fold_payload = parquet_bytes(disk_rows, OUT_OF_FOLD_SCHEMA)
    algorithm_mapping = algorithms(classifier, fit.cross_fit_folds, target_resolutions)
    metadata = ClassifierBundleMetadata(
        schema_hashes=SCHEMA_HASHES,
        algorithms=algorithm_mapping,
        algorithm_hash=hash_mapping(algorithm_mapping),
        source_hashes=dict(source_hashes),
        content_hashes={
            CLASSIFIER_ARRAYS_FILENAME: sha256_bytes(arrays_payload),
            CLASSIFIER_OUT_OF_FOLD_FILENAME: sha256_bytes(out_of_fold_payload),
        },
        rows=len(rows),
        relation_order_hash=relation_order_hash(rows),
        fold_assignment_hash=fold_assignment_hash(rows),
        embedding_dimension=classifier.model.dimension,
        model_iterations=classifier.model.iterations,
        temperature=classifier.temperature,
        cross_fit_temperatures=tuple(fold.temperature for fold in fit.cross_fit_folds),
        closure=closure_binding(closure),
        target_resolutions=target_resolutions,
        config=classifier.config,
        metrics=fit.metrics,
    )
    metadata_path = directory / CLASSIFIER_METADATA_FILENAME
    arrays_path = directory / CLASSIFIER_ARRAYS_FILENAME
    out_of_fold_path = directory / CLASSIFIER_OUT_OF_FOLD_FILENAME
    atomic_replace(arrays_path, arrays_payload)
    atomic_replace(out_of_fold_path, out_of_fold_payload)
    atomic_replace(metadata_path, model_bytes(metadata))
    canonical_fit = ClassifierFit(
        classifier=classifier,
        cross_fit_folds=fit.cross_fit_folds,
        out_of_fold=rows,
        metrics=fit.metrics,
        fold_by_relation_id=MappingProxyType({row.relation_id: row.fold for row in rows}),
    )
    return ClassifierBundle(
        directory=directory,
        metadata_path=metadata_path,
        arrays_path=arrays_path,
        out_of_fold_path=out_of_fold_path,
        metadata=metadata,
        fit=canonical_fit,
        arrays=arrays,
    )


async def write_classifier_bundle_async(
    directory: Path,
    fit: ClassifierFit,
    *,
    source_hashes: Mapping[str, Sha256Hex],
    closure: VerifiedFamilyClosure,
    target_resolutions: ClassifierTargetResolutionBinding | None = None,
) -> ClassifierBundle:
    """Write a classifier bundle without blocking Trio's event loop."""
    operation = partial(
        write_classifier_bundle,
        directory,
        fit,
        source_hashes=dict(source_hashes),
        closure=closure,
        target_resolutions=target_resolutions,
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)
