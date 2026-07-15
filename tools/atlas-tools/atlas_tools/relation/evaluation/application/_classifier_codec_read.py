"""Read and strictly validate family-bound classifier bundles."""

from collections.abc import Mapping, Sequence
from functools import partial
from pathlib import Path
from types import MappingProxyType

import numpy as np
import trio
from numpy.typing import NDArray

from atlas_tools.relation.evaluation.analysis.api import (
    ApplicabilityModel,
    ClassifierFit,
    CrossFitFold,
    MultinomialModel,
    OutOfFoldPrediction,
    PolicyClassifier,
)
from atlas_tools.relation.evaluation.application._analysis_codec import (
    CLASSIFIER_ARRAYS_FILENAME,
    CLASSIFIER_METADATA_FILENAME,
    CLASSIFIER_OUT_OF_FOLD_FILENAME,
    OUT_OF_FOLD_SCHEMA,
    OutOfFoldDiskRow,
    decode_rows,
    fold_assignment_hash,
    load_model,
    read_bytes,
    read_deterministic_npz,
    read_parquet,
    relation_order_hash,
    require_canonical_order,
    require_exact_mapping,
    verify_content_hashes,
    verify_expected_sources,
)
from atlas_tools.relation.evaluation.application._classifier_codec_validation import (
    SCHEMA_HASHES,
    algorithms,
    closure_binding,
    require_array_shapes,
    validate_closure_rows,
    validate_out_of_fold,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierArrays,
    ClassifierBundle,
    ClassifierBundleMetadata,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex
from atlas_tools.relation.family_closure.api import VerifiedFamilyClosure

type FloatArray = NDArray[np.float64]


def _classifier_from_arrays(
    metadata: ClassifierBundleMetadata,
    arrays: Mapping[str, FloatArray],
) -> PolicyClassifier:
    coefficients = arrays["coefficients"]
    intercepts = arrays["intercepts"]
    mean = arrays["applicability_mean"]
    inverse_scales = arrays["applicability_inverse_scales"]
    training_distances = arrays["applicability_training_distances"]
    return PolicyClassifier(
        config=metadata.config,
        model=MultinomialModel(
            dimension=metadata.embedding_dimension,
            coefficients=(
                tuple(float(value) for value in coefficients[0]),
                tuple(float(value) for value in coefficients[1]),
                tuple(float(value) for value in coefficients[2]),
            ),
            intercepts=(
                float(intercepts[0]),
                float(intercepts[1]),
                float(intercepts[2]),
            ),
            iterations=metadata.model_iterations,
        ),
        temperature=metadata.temperature,
        applicability=ApplicabilityModel(
            dimension=metadata.embedding_dimension,
            mean=tuple(float(value) for value in mean),
            inverse_scales=tuple(float(value) for value in inverse_scales),
            training_distances=tuple(float(value) for value in training_distances),
        ),
    )


def _cross_fit_folds_from_arrays(
    metadata: ClassifierBundleMetadata,
    arrays: Mapping[str, FloatArray],
    rows: Sequence[OutOfFoldPrediction],
) -> tuple[CrossFitFold, ...]:
    means = arrays["cross_fit_applicability_mean"]
    inverse_scales = arrays["cross_fit_applicability_inverse_scales"]
    distances = arrays["cross_fit_applicability_training_distances"]
    offset = 0
    folds: list[CrossFitFold] = []
    for fold in range(metadata.config.folds):
        validation_relation_ids = tuple(row.relation_id for row in rows if row.fold == fold)
        training_count = len(rows) - len(validation_relation_ids)
        upper = offset + training_count
        folds.append(
            CrossFitFold(
                fold=fold,
                validation_relation_ids=validation_relation_ids,
                temperature=metadata.cross_fit_temperatures[fold],
                applicability=ApplicabilityModel(
                    dimension=metadata.embedding_dimension,
                    mean=tuple(float(value) for value in means[fold]),
                    inverse_scales=tuple(float(value) for value in inverse_scales[fold]),
                    training_distances=tuple(float(value) for value in distances[offset:upper]),
                ),
            )
        )
        offset = upper
    if offset != len(distances):
        raise ValueError("cross-fit applicability arrays have trailing distances")
    return tuple(folds)


def load_classifier_bundle(
    directory: Path,
    *,
    closure: VerifiedFamilyClosure,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> ClassifierBundle:
    """Load a classifier only after strict cross-file and numeric validation.

    Loaded arrays are copied behind immutable byte buffers. Calling
    `setflags(write=True)` on them therefore fails instead of bypassing a
    read-only flag on mutable owned memory.

    Raises:
        ValueError: Metadata, source hashes, bytes, schemas, arrays, folds,
            probabilities, applicability, or card order disagree.

    """
    metadata_path = directory / CLASSIFIER_METADATA_FILENAME
    arrays_path = directory / CLASSIFIER_ARRAYS_FILENAME
    out_of_fold_path = directory / CLASSIFIER_OUT_OF_FOLD_FILENAME
    metadata = load_model(metadata_path, ClassifierBundleMetadata)
    if metadata.closure != closure_binding(closure):
        raise ValueError("classifier metadata is bound to a different family closure")
    require_exact_mapping(
        metadata.schema_hashes,
        SCHEMA_HASHES,
        label="classifier schema hashes",
    )
    verify_expected_sources(metadata.source_hashes, expected_source_hashes)
    arrays_payload = read_bytes(arrays_path)
    out_of_fold_payload = read_bytes(out_of_fold_path)
    verify_content_hashes(
        metadata.content_hashes,
        {
            CLASSIFIER_ARRAYS_FILENAME: arrays_payload,
            CLASSIFIER_OUT_OF_FOLD_FILENAME: out_of_fold_payload,
        },
    )
    decoded_arrays = read_deterministic_npz(arrays_path, arrays_payload)
    require_array_shapes(
        decoded_arrays,
        dimension=metadata.embedding_dimension,
        rows=metadata.rows,
        folds=metadata.config.folds,
    )
    classifier = _classifier_from_arrays(metadata, decoded_arrays)
    table = read_parquet(out_of_fold_path, out_of_fold_payload, OUT_OF_FOLD_SCHEMA)
    disk_rows = decode_rows(out_of_fold_path, table, OutOfFoldDiskRow)
    try:
        rows = tuple(row.to_prediction() for row in disk_rows)
    except ValueError as error:
        raise ValueError(
            f"invalid out-of-fold prediction in {out_of_fold_path}: {error}"
        ) from error
    if len(rows) != metadata.rows:
        raise ValueError("out-of-fold row count does not match metadata")
    require_canonical_order(tuple(row.relation_id for row in rows))
    if relation_order_hash(rows) != metadata.relation_order_hash:
        raise ValueError("classifier relation/card order does not match metadata")
    if fold_assignment_hash(rows) != metadata.fold_assignment_hash:
        raise ValueError("classifier fold assignment does not match metadata")
    cross_fit_folds = _cross_fit_folds_from_arrays(metadata, decoded_arrays, rows)
    require_exact_mapping(
        metadata.algorithms,
        algorithms(classifier, cross_fit_folds),
        label="classifier algorithms",
    )
    fold_by_relation_id = MappingProxyType({row.relation_id: row.fold for row in rows})
    validate_out_of_fold(
        rows,
        classifier,
        cross_fit_folds,
        metadata.metrics,
        fold_by_relation_id,
    )
    validate_closure_rows(rows, closure)
    arrays = ClassifierArrays(
        coefficients=decoded_arrays["coefficients"],
        intercepts=decoded_arrays["intercepts"],
        applicability_mean=decoded_arrays["applicability_mean"],
        applicability_inverse_scales=decoded_arrays["applicability_inverse_scales"],
        applicability_training_distances=decoded_arrays["applicability_training_distances"],
        cross_fit_applicability_mean=decoded_arrays["cross_fit_applicability_mean"],
        cross_fit_applicability_inverse_scales=decoded_arrays[
            "cross_fit_applicability_inverse_scales"
        ],
        cross_fit_applicability_training_distances=decoded_arrays[
            "cross_fit_applicability_training_distances"
        ],
    )
    fit = ClassifierFit(
        classifier=classifier,
        cross_fit_folds=cross_fit_folds,
        out_of_fold=rows,
        metrics=metadata.metrics,
        fold_by_relation_id=fold_by_relation_id,
    )
    return ClassifierBundle(
        directory=directory,
        metadata_path=metadata_path,
        arrays_path=arrays_path,
        out_of_fold_path=out_of_fold_path,
        metadata=metadata,
        fit=fit,
        arrays=arrays,
    )


async def load_classifier_bundle_async(
    directory: Path,
    *,
    closure: VerifiedFamilyClosure,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> ClassifierBundle:
    """Validate a classifier bundle without blocking Trio's event loop."""
    expected = None if expected_source_hashes is None else dict(expected_source_hashes)
    operation = partial(
        load_classifier_bundle,
        directory,
        closure=closure,
        expected_source_hashes=expected,
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)
