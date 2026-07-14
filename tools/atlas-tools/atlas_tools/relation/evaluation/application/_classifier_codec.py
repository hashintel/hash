"""Persist and reconstruct deterministic policy-classifier bundles."""

import math
from bisect import bisect_left
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
    ClassifierMetrics,
    CrossFitFold,
    MultinomialModel,
    OutOfFoldPrediction,
    PolicyClassifier,
)
from atlas_tools.relation.evaluation.application._analysis_codec import (
    ARRAY_SCHEMA,
    CLASSIFIER_ARRAYS_FILENAME,
    CLASSIFIER_METADATA_FILENAME,
    CLASSIFIER_OUT_OF_FOLD_FILENAME,
    METADATA_SCHEMA,
    ORDERING_ALGORITHM,
    OUT_OF_FOLD_SCHEMA,
    PARQUET_ALGORITHM,
    OutOfFoldDiskRow,
    atomic_replace,
    decode_rows,
    deterministic_npz,
    fold_assignment_hash,
    immutable_float64,
    load_model,
    model_bytes,
    ordered_rows,
    parquet_bytes,
    read_bytes,
    read_deterministic_npz,
    read_parquet,
    relation_order_hash,
    require_canonical_order,
    require_exact_mapping,
    schema_hash,
    sha256_bytes,
    verify_content_hashes,
    verify_expected_sources,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierArrays,
    ClassifierBundle,
    ClassifierBundleMetadata,
    hash_mapping,
)
from atlas_tools.relation.evaluation.domain.api import (
    RelationFamilyId,
    RelationId,
    Sha256Hex,
)

type FloatArray = NDArray[np.float64]

_SCHEMA_HASHES = {
    "arrays": schema_hash(ARRAY_SCHEMA),
    "metadata": schema_hash(METADATA_SCHEMA),
    "out_of_fold": schema_hash(OUT_OF_FOLD_SCHEMA),
}


def _algorithms(
    classifier: PolicyClassifier,
    cross_fit_folds: Sequence[CrossFitFold],
) -> dict[str, str]:
    algorithms = {fold.algorithm for fold in cross_fit_folds}
    if len(algorithms) != 1:
        raise ValueError("cross-fit folds must use one supported algorithm")
    [cross_fit_algorithm] = algorithms
    return {
        "applicability": classifier.applicability.algorithm,
        "array_container": "npz-stored-npy-f64-le-v1",
        "calibration": classifier.calibration,
        "cross_fit": cross_fit_algorithm,
        "multinomial": classifier.model.algorithm,
        "ordering": ORDERING_ALGORITHM,
        "parquet": PARQUET_ALGORITHM,
    }


def _classifier_arrays(fit: ClassifierFit) -> ClassifierArrays:
    classifier = fit.classifier
    model = classifier.model
    applicability = classifier.applicability
    cross_fit_applicability = tuple(fold.applicability for fold in fit.cross_fit_folds)
    return ClassifierArrays(
        coefficients=immutable_float64(np.asarray(model.coefficients, dtype=np.float64)),
        intercepts=immutable_float64(np.asarray(model.intercepts, dtype=np.float64)),
        applicability_mean=immutable_float64(np.asarray(applicability.mean, dtype=np.float64)),
        applicability_inverse_scales=immutable_float64(
            np.asarray(applicability.inverse_scales, dtype=np.float64)
        ),
        applicability_training_distances=immutable_float64(
            np.asarray(applicability.training_distances, dtype=np.float64)
        ),
        cross_fit_applicability_mean=immutable_float64(
            np.asarray([model.mean for model in cross_fit_applicability], dtype=np.float64)
        ),
        cross_fit_applicability_inverse_scales=immutable_float64(
            np.asarray(
                [model.inverse_scales for model in cross_fit_applicability],
                dtype=np.float64,
            )
        ),
        cross_fit_applicability_training_distances=immutable_float64(
            np.concatenate(
                [
                    np.asarray(model.training_distances, dtype=np.float64)
                    for model in cross_fit_applicability
                ]
            )
        ),
    )


def _array_mapping(arrays: ClassifierArrays) -> dict[str, FloatArray]:
    return {
        "applicability_inverse_scales": arrays.applicability_inverse_scales,
        "applicability_mean": arrays.applicability_mean,
        "applicability_training_distances": arrays.applicability_training_distances,
        "coefficients": arrays.coefficients,
        "cross_fit_applicability_inverse_scales": (
            arrays.cross_fit_applicability_inverse_scales
        ),
        "cross_fit_applicability_mean": arrays.cross_fit_applicability_mean,
        "cross_fit_applicability_training_distances": (
            arrays.cross_fit_applicability_training_distances
        ),
        "intercepts": arrays.intercepts,
    }


def _softmax(
    logits: tuple[float, float, float],
    temperature: float,
) -> tuple[float, float, float]:
    scaled = tuple(value / temperature for value in logits)
    maximum = max(scaled)
    exponents = tuple(math.exp(value - maximum) for value in scaled)
    total = math.fsum(exponents)
    return exponents[0] / total, exponents[1] / total, exponents[2] / total


def _probabilities_close(
    observed: tuple[float, float, float],
    expected: tuple[float, float, float],
) -> bool:
    return all(
        math.isclose(left, right, rel_tol=1e-12, abs_tol=1e-12)
        for left, right in zip(observed, expected, strict=True)
    )


def _validate_prediction(
    row: OutOfFoldPrediction,
    evidence: CrossFitFold,
) -> None:
    raw = _softmax(row.logits, 1.0)
    observed_raw = (row.raw.coincident, row.raw.proximal, row.raw.overlay)
    if not _probabilities_close(observed_raw, raw):
        raise ValueError(f"raw probabilities disagree with logits for {row.relation_id}")
    if row.calibration_temperature != evidence.temperature:
        raise ValueError(
            f"calibration temperature disagrees with fold evidence for {row.relation_id}"
        )
    calibrated = _softmax(row.logits, evidence.temperature)
    observed_calibrated = (
        row.calibrated.coincident,
        row.calibrated.proximal,
        row.calibrated.overlay,
    )
    if not _probabilities_close(observed_calibrated, calibrated):
        raise ValueError(f"calibrated probabilities disagree with logits for {row.relation_id}")
    distances = evidence.applicability.training_distances
    expected_applicability = 1.0 - bisect_left(distances, row.distance) / len(distances)
    if not math.isclose(
        row.applicability,
        expected_applicability,
        rel_tol=1e-12,
        abs_tol=1e-12,
    ):
        raise ValueError(f"applicability disagrees with training distances for {row.relation_id}")


def _validate_cross_fit_evidence(
    rows: Sequence[OutOfFoldPrediction],
    classifier: PolicyClassifier,
    cross_fit_folds: Sequence[CrossFitFold],
) -> dict[int, CrossFitFold]:
    fold_numbers = tuple(fold.fold for fold in cross_fit_folds)
    if fold_numbers != tuple(range(classifier.config.folds)):
        raise ValueError("cross-fit evidence does not cover folds in canonical order")
    observed_by_fold = {
        fold: tuple(row.relation_id for row in rows if row.fold == fold)
        for fold in range(classifier.config.folds)
    }
    for fold in cross_fit_folds:
        if fold.validation_relation_ids != observed_by_fold[fold.fold]:
            raise ValueError(f"cross-fit validation relations disagree for fold {fold.fold}")
        if fold.applicability.dimension != classifier.model.dimension:
            raise ValueError(f"cross-fit applicability dimension differs for fold {fold.fold}")
        expected_training = len(rows) - len(fold.validation_relation_ids)
        if len(fold.applicability.training_distances) != expected_training:
            raise ValueError(f"cross-fit applicability sample count differs for fold {fold.fold}")
    return {fold.fold: fold for fold in cross_fit_folds}


def _validate_out_of_fold(
    rows: Sequence[OutOfFoldPrediction],
    classifier: PolicyClassifier,
    cross_fit_folds: Sequence[CrossFitFold],
    metrics: ClassifierMetrics,
    fold_by_relation_id: Mapping[RelationId, int],
) -> None:
    if len(rows) != metrics.training_cards:
        raise ValueError("out-of-fold row count does not match classifier metrics")
    require_canonical_order(tuple(row.relation_id for row in rows))
    observed_assignment = {row.relation_id: row.fold for row in rows}
    if observed_assignment != dict(fold_by_relation_id):
        raise ValueError("out-of-fold rows disagree with the fold assignment")
    folds = {row.fold for row in rows}
    if folds != set(range(classifier.config.folds)):
        raise ValueError("out-of-fold predictions do not cover every configured fold")
    evidence_by_fold = _validate_cross_fit_evidence(rows, classifier, cross_fit_folds)
    family_folds: dict[RelationFamilyId, int] = {}
    for row in rows:
        evidence = evidence_by_fold[row.fold]
        previous = family_folds.setdefault(row.family_id, row.fold)
        if previous != row.fold:
            raise ValueError(f"out-of-fold predictions leak relation family {row.family_id}")
        _validate_prediction(row, evidence)


def _validate_fit(fit: ClassifierFit) -> tuple[OutOfFoldPrediction, ...]:
    ordered = ordered_rows(fit.out_of_fold, lambda row: row.relation_id)
    if len(fit.classifier.applicability.training_distances) != fit.metrics.training_cards:
        raise ValueError("applicability sample count does not match classifier metrics")
    _validate_out_of_fold(
        ordered,
        fit.classifier,
        fit.cross_fit_folds,
        fit.metrics,
        fit.fold_by_relation_id,
    )
    return ordered


def write_classifier_bundle(
    directory: Path,
    fit: ClassifierFit,
    *,
    source_hashes: Mapping[str, Sha256Hex],
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
    rows = _validate_fit(fit)
    classifier = fit.classifier
    arrays = _classifier_arrays(fit)
    arrays_payload = deterministic_npz(_array_mapping(arrays))
    disk_rows = tuple(OutOfFoldDiskRow.from_prediction(row) for row in rows)
    out_of_fold_payload = parquet_bytes(disk_rows, OUT_OF_FOLD_SCHEMA)
    algorithms = _algorithms(classifier, fit.cross_fit_folds)
    metadata = ClassifierBundleMetadata(
        schema_hashes=_SCHEMA_HASHES,
        algorithms=algorithms,
        algorithm_hash=hash_mapping(algorithms),
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


def _require_array_shapes(
    arrays: Mapping[str, FloatArray],
    *,
    dimension: int,
    rows: int,
    folds: int,
) -> None:
    expected = {
        "applicability_inverse_scales": (dimension,),
        "applicability_mean": (dimension,),
        "applicability_training_distances": (rows,),
        "coefficients": (3, dimension),
        "cross_fit_applicability_inverse_scales": (folds, dimension),
        "cross_fit_applicability_mean": (folds, dimension),
        "cross_fit_applicability_training_distances": (rows * (folds - 1),),
        "intercepts": (3,),
    }
    observed = {name: array.shape for name, array in arrays.items()}
    if observed != expected:
        raise ValueError(f"classifier array shapes do not match metadata: {observed}")


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
    require_exact_mapping(
        metadata.schema_hashes,
        _SCHEMA_HASHES,
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
    _require_array_shapes(
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
        _algorithms(classifier, cross_fit_folds),
        label="classifier algorithms",
    )
    fold_by_relation_id = MappingProxyType({row.relation_id: row.fold for row in rows})
    _validate_out_of_fold(
        rows,
        classifier,
        cross_fit_folds,
        metadata.metrics,
        fold_by_relation_id,
    )
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


async def write_classifier_bundle_async(
    directory: Path,
    fit: ClassifierFit,
    *,
    source_hashes: Mapping[str, Sha256Hex],
) -> ClassifierBundle:
    """Write a classifier bundle without blocking Trio's event loop."""
    operation = partial(
        write_classifier_bundle,
        directory,
        fit,
        source_hashes=dict(source_hashes),
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)


async def load_classifier_bundle_async(
    directory: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> ClassifierBundle:
    """Validate a classifier bundle without blocking Trio's event loop."""
    expected = None if expected_source_hashes is None else dict(expected_source_hashes)
    operation = partial(
        load_classifier_bundle,
        directory,
        expected_source_hashes=expected,
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)
