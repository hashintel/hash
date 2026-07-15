"""Shared validation and normalization for classifier bundle codecs."""

import math
from bisect import bisect_left
from collections.abc import Mapping, Sequence

import numpy as np
from numpy.typing import NDArray

from atlas_tools.relation.evaluation.analysis.api import (
    ClassifierFit,
    ClassifierMetrics,
    CrossFitFold,
    OutOfFoldPrediction,
    PolicyClassifier,
)
from atlas_tools.relation.evaluation.application._analysis_codec import (
    immutable_float64,
    ordered_rows,
    require_canonical_order,
    schema_hash,
)
from atlas_tools.relation.evaluation.application._analysis_schema import (
    ARRAY_SCHEMA,
    METADATA_SCHEMA,
    ORDERING_ALGORITHM,
    OUT_OF_FOLD_SCHEMA,
    PARQUET_ALGORITHM,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierArrays,
    ClassifierClosureBinding,
    ClassifierTargetResolutionBinding,
)
from atlas_tools.relation.evaluation.domain.api import RelationFamilyId, RelationId
from atlas_tools.relation.family_closure.api import VerifiedFamilyClosure

type FloatArray = NDArray[np.float64]

SCHEMA_HASHES = {
    "arrays": schema_hash(ARRAY_SCHEMA),
    "metadata": schema_hash(METADATA_SCHEMA),
    "out_of_fold": schema_hash(OUT_OF_FOLD_SCHEMA),
}


def algorithms(
    classifier: PolicyClassifier,
    cross_fit_folds: Sequence[CrossFitFold],
    target_resolutions: ClassifierTargetResolutionBinding | None,
) -> dict[str, str]:
    """Return the exact algorithm contract represented by a classifier fit."""
    cross_fit_algorithms = {fold.algorithm for fold in cross_fit_folds}
    if len(cross_fit_algorithms) != 1:
        raise ValueError("cross-fit folds must use one supported algorithm")
    [cross_fit_algorithm] = cross_fit_algorithms
    return {
        "applicability": classifier.applicability.algorithm,
        "array_container": "npz-stored-npy-f64-le-v1",
        "calibration": classifier.calibration,
        "cross_fit": cross_fit_algorithm,
        "multinomial": classifier.model.algorithm,
        "ordering": ORDERING_ALGORITHM,
        "parquet": PARQUET_ALGORITHM,
        "target_resolutions": (
            "not-required" if target_resolutions is None else target_resolutions.policy_id
        ),
    }


def classifier_arrays(fit: ClassifierFit) -> ClassifierArrays:
    """Normalize fitted arrays into immutable float64 values."""
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


def array_mapping(arrays: ClassifierArrays) -> dict[str, FloatArray]:
    """Map classifier array names to their deterministic NPZ members."""
    return {
        "applicability_inverse_scales": arrays.applicability_inverse_scales,
        "applicability_mean": arrays.applicability_mean,
        "applicability_training_distances": arrays.applicability_training_distances,
        "coefficients": arrays.coefficients,
        "cross_fit_applicability_inverse_scales": arrays.cross_fit_applicability_inverse_scales,
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


def _validate_prediction(row: OutOfFoldPrediction, evidence: CrossFitFold) -> None:
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


def validate_out_of_fold(
    rows: Sequence[OutOfFoldPrediction],
    classifier: PolicyClassifier,
    cross_fit_folds: Sequence[CrossFitFold],
    metrics: ClassifierMetrics,
    fold_by_relation_id: Mapping[RelationId, int],
) -> None:
    """Validate cross-file fold, family, probability, and applicability invariants."""
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


def validate_fit(fit: ClassifierFit) -> tuple[OutOfFoldPrediction, ...]:
    """Canonicalize and validate a classifier fit before serialization."""
    ordered = ordered_rows(fit.out_of_fold, lambda row: row.relation_id)
    if len(fit.classifier.applicability.training_distances) != fit.metrics.training_cards:
        raise ValueError("applicability sample count does not match classifier metrics")
    validate_out_of_fold(
        ordered,
        fit.classifier,
        fit.cross_fit_folds,
        fit.metrics,
        fit.fold_by_relation_id,
    )
    return ordered


def closure_binding(closure: VerifiedFamilyClosure) -> ClassifierClosureBinding:
    """Project the immutable family-closure identity into classifier metadata."""
    details = closure.manifest.details
    return ClassifierClosureBinding(
        artifact_id=details.artifact_id,
        families_hash=closure.families_hash,
        manifest_hash=closure.manifest_hash,
        algorithm=details.algorithm,
        edge_policy_id=details.edge_policy.policy_id,
        root_exclusions=details.edge_policy.root_exclusions,
        admitted_inverse_edge_kinds=details.edge_policy.admitted_inverse_edge_kinds,
    )


def validate_closure_rows(
    rows: Sequence[OutOfFoldPrediction],
    closure: VerifiedFamilyClosure,
) -> None:
    """Require exact prediction coverage and bindings within the complete closure."""
    predictions = {row.relation_id: row for row in rows}
    assignments = closure.by_relation_id
    missing = tuple(sorted(set(predictions) - set(assignments)))
    if missing:
        raise ValueError(f"classifier closure does not cover predictions: missing={missing}")
    for relation_id, prediction in predictions.items():
        assignment = assignments[relation_id]
        if prediction.card_hash != assignment.card_hash:
            raise ValueError(f"classifier closure card hash differs for relation {relation_id}")
        if prediction.family_id != assignment.family_id:
            raise ValueError(f"classifier closure family differs for relation {relation_id}")


def require_array_shapes(
    arrays: Mapping[str, FloatArray],
    *,
    dimension: int,
    rows: int,
    folds: int,
) -> None:
    """Require every decoded classifier array to match metadata dimensions."""
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
