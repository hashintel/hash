"""Implement deterministic classifier optimization, calibration, and metrics."""

import math
import warnings
from bisect import bisect_left
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression

from atlas_tools.relation.evaluation.analysis._classifier_data import (
    TrainingData,
    grouped_fold_assignment,
    training_subset,
)
from atlas_tools.relation.evaluation.analysis.classifier_model import (
    ApplicabilityModel,
    FloatMatrix,
    FloatVector,
    IntVector,
    MultinomialModel,
    posterior_argmax,
    posterior_value,
    posterior_vector,
)
from atlas_tools.relation.evaluation.analysis.deliverables import PlacementPosterior
from atlas_tools.relation.evaluation.domain.api import (
    PLACEMENT_CLASSES,
    ClassifierConfig,
    RelationId,
)

_CLASS_COUNT = len(PLACEMENT_CLASSES)
_MATRIX_DIMENSIONS = 2
_TEMPERATURE_MIN = 0.05
_TEMPERATURE_MAX = 20.0
_TEMPERATURE_ITERATIONS = 96
_GOLDEN_RATIO_CONJUGATE = (math.sqrt(5.0) - 1.0) / 2.0
_PROBABILITY_FLOOR = 1e-12
_VARIANCE_RELATIVE_FLOOR = 1e-12


@dataclass(frozen=True, slots=True, kw_only=True)
class CrossFitPredictions:
    """Carry row evidence fitted without each row's outer fold."""

    logits: FloatMatrix
    fold_indices: IntVector
    temperatures: tuple[float, ...]
    temperature_by_row: FloatVector
    applicability_models: tuple[ApplicabilityModel, ...]
    distances: FloatVector
    applicability_scores: FloatVector
    max_iterations: int


def _metric_arrays(
    probabilities: Sequence[PlacementPosterior],
    targets: Sequence[PlacementPosterior],
    weights: Sequence[float],
) -> tuple[FloatMatrix, FloatMatrix, FloatVector]:
    count = len(probabilities)
    if not count or len(targets) != count or len(weights) != count:
        raise ValueError("probabilities, targets, and weights must have one non-empty shape")
    probability_matrix = np.asarray(
        [posterior_vector(posterior) for posterior in probabilities],
        dtype=np.float64,
    )
    target_matrix = np.asarray(
        [posterior_vector(posterior) for posterior in targets],
        dtype=np.float64,
    )
    weight_vector = np.asarray(weights, dtype=np.float64)
    if not np.isfinite(weight_vector).all() or (weight_vector < 0.0).any():
        raise ValueError("metric weights must be finite and non-negative")
    if float(weight_vector.sum()) <= 0.0:
        raise ValueError("metrics require positive total weight")
    return probability_matrix, target_matrix, weight_vector


def cross_entropy_array(
    probabilities: FloatMatrix,
    targets: FloatMatrix,
    weights: FloatVector,
) -> float:
    """Return cross-entropy for validated same-shape numeric arrays."""
    clipped = np.clip(probabilities, _PROBABILITY_FLOOR, 1.0)
    per_row = -(targets * np.log(clipped)).sum(axis=1)
    return float(np.dot(per_row, weights) / weights.sum())


def soft_cross_entropy(
    probabilities: Sequence[PlacementPosterior],
    targets: Sequence[PlacementPosterior],
    weights: Sequence[float],
) -> float:
    """Return weighted soft-target cross-entropy in nats.

    Raises:
        ValueError: The inputs are empty, differ in length, contain invalid
            weights, or have zero total weight.

    """
    probability_matrix, target_matrix, weight_vector = _metric_arrays(
        probabilities,
        targets,
        weights,
    )
    return cross_entropy_array(probability_matrix, target_matrix, weight_vector)


def soft_brier_score(
    probabilities: Sequence[PlacementPosterior],
    targets: Sequence[PlacementPosterior],
    weights: Sequence[float],
) -> float:
    """Return the weighted sum-of-classes soft Brier score.

    Raises:
        ValueError: The inputs are empty, differ in length, contain invalid
            weights, or have zero total weight.

    """
    probability_matrix, target_matrix, weight_vector = _metric_arrays(
        probabilities,
        targets,
        weights,
    )
    per_row = np.square(probability_matrix - target_matrix).sum(axis=1)
    return float(np.dot(per_row, weight_vector) / weight_vector.sum())


def _expand_soft_targets(
    embeddings: FloatMatrix,
    targets: FloatMatrix,
    vote_weights: FloatVector,
) -> tuple[FloatMatrix, IntVector, FloatVector]:
    expanded_embeddings = np.repeat(embeddings, _CLASS_COUNT, axis=0)
    expanded_classes = np.tile(
        np.arange(_CLASS_COUNT, dtype=np.int64),
        len(embeddings),
    )
    expanded_weights = (targets * vote_weights[:, np.newaxis]).reshape(-1)
    keep = expanded_weights > 0.0
    return (
        expanded_embeddings[keep],
        expanded_classes[keep],
        expanded_weights[keep],
    )


def fit_model(
    embeddings: FloatMatrix,
    targets: FloatMatrix,
    vote_weights: FloatVector,
    config: ClassifierConfig,
) -> MultinomialModel:
    """Fit one weighted soft-target model and require solver convergence."""
    expanded_x, expanded_y, expanded_weights = _expand_soft_targets(
        embeddings,
        targets,
        vote_weights,
    )
    if tuple(int(value) for value in np.unique(expanded_y)) != tuple(range(_CLASS_COUNT)):
        raise ValueError("training data must carry positive weight for every placement class")
    regression = LogisticRegression(
        C=config.regularization,
        max_iter=config.max_iterations,
        random_state=config.seed,
        solver="lbfgs",
    )
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", ConvergenceWarning)
        regression.fit(expanded_x, expanded_y, sample_weight=expanded_weights)
    convergence_warnings = tuple(
        warning for warning in caught if issubclass(warning.category, ConvergenceWarning)
    )
    if convergence_warnings:
        raise ValueError(
            f"multinomial optimizer did not converge within {config.max_iterations} iterations"
        )
    if tuple(int(value) for value in regression.classes_) != tuple(range(_CLASS_COUNT)):
        raise ValueError("multinomial optimizer returned an unexpected class order")
    coefficients = np.asarray(regression.coef_, dtype=np.float64)
    intercepts = np.asarray(regression.intercept_, dtype=np.float64)
    if coefficients.shape != (_CLASS_COUNT, embeddings.shape[1]) or intercepts.shape != (
        _CLASS_COUNT,
    ):
        raise ValueError("multinomial optimizer returned an invalid parameter shape")
    if not np.isfinite(coefficients).all() or not np.isfinite(intercepts).all():
        raise ValueError("multinomial optimizer returned non-finite parameters")
    iterations = int(np.max(regression.n_iter_))
    if iterations <= 0:
        raise ValueError("multinomial optimizer reported no completed iterations")
    return MultinomialModel(
        dimension=int(embeddings.shape[1]),
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
        iterations=iterations,
    )


def model_logits(model: MultinomialModel, embeddings: FloatMatrix) -> FloatMatrix:
    """Evaluate a fitted model while enforcing its embedding dimension."""
    if embeddings.ndim != _MATRIX_DIMENSIONS or embeddings.shape[1] != model.dimension:
        raise ValueError("prediction embeddings do not match the model dimension")
    coefficients = np.asarray(model.coefficients, dtype=np.float64)
    intercepts = np.asarray(model.intercepts, dtype=np.float64)
    logits = embeddings @ coefficients.T + intercepts
    if not np.isfinite(logits).all():
        raise ValueError("classifier produced non-finite logits")
    return logits


def softmax(logits: FloatMatrix) -> FloatMatrix:
    """Evaluate a stable row-wise softmax."""
    shifted = logits - logits.max(axis=1, keepdims=True)
    exponents = np.exp(shifted)
    return exponents / exponents.sum(axis=1, keepdims=True)


def out_of_fold_logits(
    data: TrainingData,
    config: ClassifierConfig,
    assignment: Mapping[RelationId, int],
) -> tuple[FloatMatrix, IntVector, int]:
    """Fit every family-atomic fold and return held-out logits."""
    fold_indices = np.asarray(
        [assignment[label.relation_id] for label in data.labels],
        dtype=np.int64,
    )
    logits = np.full(data.targets.shape, np.nan, dtype=np.float64)
    max_iterations = 0
    for fold in range(config.folds):
        test_indices = np.flatnonzero(fold_indices == fold)
        train_indices = np.flatnonzero(fold_indices != fold)
        if not len(test_indices) or not len(train_indices):
            raise ValueError(f"fold {fold} has an empty train or validation partition")
        train_families = {data.families[int(index)] for index in train_indices}
        test_families = {data.families[int(index)] for index in test_indices}
        overlap = tuple(sorted(train_families & test_families))
        if overlap:
            raise ValueError(f"fold {fold} leaks relation families: {overlap}")
        model = fit_model(
            data.embeddings[train_indices],
            data.targets[train_indices],
            data.vote_weights[train_indices],
            config,
        )
        logits[test_indices] = model_logits(model, data.embeddings[test_indices])
        max_iterations = max(max_iterations, model.iterations)
    if not np.isfinite(logits).all():
        raise ValueError("grouped cross-validation left rows without finite logits")
    return logits, fold_indices, max_iterations


def cross_fit_predictions(
    data: TrainingData,
    config: ClassifierConfig,
    assignment: Mapping[RelationId, int],
) -> CrossFitPredictions:
    """Fit nested grouped calibration and applicability evidence.

    The outer model, scalar temperature, and applicability distribution for a
    validation row are all fitted after removing that row's complete relation
    family. Temperature fitting uses inner out-of-fold logits from only the
    outer-training partition. Fitting performs `1 + k` grouped CV passes for
    `k` configured folds.

    Raises:
        ValueError: A fold is empty, leaks a family, cannot support its inner
            grouped folds, fails optimization, or produces non-finite values.

    """
    logits, fold_indices, max_iterations = out_of_fold_logits(data, config, assignment)
    temperatures: list[float] = []
    applicability_models: list[ApplicabilityModel] = []
    temperature_by_row = np.full(len(data.labels), np.nan, dtype=np.float64)
    distances = np.full(len(data.labels), np.nan, dtype=np.float64)
    applicability_scores = np.full(len(data.labels), np.nan, dtype=np.float64)

    for fold in range(config.folds):
        validation_indices = np.flatnonzero(fold_indices == fold)
        training_indices = np.flatnonzero(fold_indices != fold)
        outer_training = training_subset(data, training_indices)
        inner_assignment = grouped_fold_assignment(outer_training, config)
        inner_logits, _, inner_iterations = out_of_fold_logits(
            outer_training,
            config,
            inner_assignment,
        )
        temperature = fit_temperature(
            inner_logits,
            outer_training.targets,
            outer_training.vote_weights,
        )
        applicability_model = fit_applicability(outer_training.embeddings)
        fold_distances, fold_scores = applicability(
            applicability_model,
            data.embeddings[validation_indices],
        )
        temperatures.append(temperature)
        applicability_models.append(applicability_model)
        temperature_by_row[validation_indices] = temperature
        distances[validation_indices] = fold_distances
        applicability_scores[validation_indices] = fold_scores
        max_iterations = max(max_iterations, inner_iterations)

    arrays = (temperature_by_row, distances, applicability_scores)
    if any(not np.isfinite(array).all() for array in arrays):
        raise ValueError("nested cross-fitting left rows without finite evidence")
    return CrossFitPredictions(
        logits=logits,
        fold_indices=fold_indices,
        temperatures=tuple(temperatures),
        temperature_by_row=temperature_by_row,
        applicability_models=tuple(applicability_models),
        distances=distances,
        applicability_scores=applicability_scores,
        max_iterations=max_iterations,
    )


def fit_temperature(
    logits: FloatMatrix,
    targets: FloatMatrix,
    weights: FloatVector,
) -> float:
    """Fit scalar temperature with a fixed-iteration golden-section search."""
    lower = math.log(_TEMPERATURE_MIN)
    upper = math.log(_TEMPERATURE_MAX)

    def objective(log_temperature: float) -> float:
        temperature = math.exp(log_temperature)
        return cross_entropy_array(softmax(logits / temperature), targets, weights)

    left = upper - _GOLDEN_RATIO_CONJUGATE * (upper - lower)
    right = lower + _GOLDEN_RATIO_CONJUGATE * (upper - lower)
    left_value = objective(left)
    right_value = objective(right)
    for _ in range(_TEMPERATURE_ITERATIONS):
        if (left_value, abs(left)) <= (right_value, abs(right)):
            upper = right
            right = left
            right_value = left_value
            left = upper - _GOLDEN_RATIO_CONJUGATE * (upper - lower)
            left_value = objective(left)
        else:
            lower = left
            left = right
            left_value = right_value
            right = lower + _GOLDEN_RATIO_CONJUGATE * (upper - lower)
            right_value = objective(right)
    candidates = (lower, left, 0.0, right, upper)
    best_log_temperature = min(
        candidates,
        key=lambda value: (objective(value), abs(value), value),
    )
    return math.exp(best_log_temperature)


def fit_applicability(embeddings: FloatMatrix) -> ApplicabilityModel:
    """Fit a diagonal variance estimate shrunk toward global variance.

    The shrinkage weight is `d / (n + d)` for `n` rows and dimension `d`, so
    high-dimensional small samples rely more strongly on the pooled scale.
    Fit time is `O(nd)` and retained state is `O(n + d)`.
    """
    sample_count, dimension = embeddings.shape
    mean = embeddings.mean(axis=0)
    centered = embeddings - mean
    variances = np.mean(np.square(centered), axis=0)
    global_variance = float(variances.mean())
    if global_variance == 0.0:
        regularized = np.ones(dimension, dtype=np.float64)
    else:
        shrinkage = dimension / (sample_count + dimension)
        floor = global_variance * _VARIANCE_RELATIVE_FLOOR
        regularized = np.maximum(
            (1.0 - shrinkage) * variances + shrinkage * global_variance,
            floor,
        )
    inverse_scales = np.reciprocal(np.sqrt(regularized))
    distances = np.sqrt(np.mean(np.square(centered * inverse_scales), axis=1))
    if not np.isfinite(distances).all():
        raise ValueError("applicability estimator returned non-finite distances")
    return ApplicabilityModel(
        dimension=int(dimension),
        mean=tuple(float(value) for value in mean),
        inverse_scales=tuple(float(value) for value in inverse_scales),
        training_distances=tuple(float(value) for value in np.sort(distances)),
    )


def applicability(
    model: ApplicabilityModel,
    embeddings: FloatMatrix,
) -> tuple[FloatVector, FloatVector]:
    """Return diagonal-standardized distances and empirical survival scores."""
    if embeddings.ndim != _MATRIX_DIMENSIONS or embeddings.shape[1] != model.dimension:
        raise ValueError("prediction embeddings do not match applicability dimension")
    mean = np.asarray(model.mean, dtype=np.float64)
    centered = embeddings - mean
    inverse_scales = np.asarray(model.inverse_scales, dtype=np.float64)
    distances = np.sqrt(np.mean(np.square(centered * inverse_scales), axis=1))
    if not np.isfinite(distances).all():
        raise ValueError("applicability calculation produced non-finite distances")
    count = len(model.training_distances)
    scores = np.asarray(
        [
            1.0 - bisect_left(model.training_distances, float(distance)) / count
            for distance in distances
        ],
        dtype=np.float64,
    )
    return distances, scores


def expected_accuracy(
    predictions: Sequence[PlacementPosterior],
    targets: Sequence[PlacementPosterior],
    weights: Sequence[float],
) -> float:
    """Return weighted expected correctness of each posterior argmax."""
    total = math.fsum(weights)
    correct_mass = math.fsum(
        weight * posterior_value(target, posterior_argmax(prediction))
        for prediction, target, weight in zip(predictions, targets, weights, strict=True)
    )
    return correct_mass / total
