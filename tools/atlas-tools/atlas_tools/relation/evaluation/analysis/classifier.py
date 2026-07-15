"""Fit and evaluate a deterministic soft-target placement classifier.

The classifier joins labels and embeddings by exact relation and card
identity, assigns whole relation families to validation folds, and fits every
card with its placement posterior weighted by its placement-vote count. No
training-row calibration or applicability estimate observes its outer fold.
No filesystem, provider, or orchestration state enters this module.
"""

import math
from collections.abc import Sequence

import numpy as np

from atlas_tools.relation.evaluation.analysis._classifier_data import (
    FamilyBindingRow,
    grouped_fold_assignment,
    join_training_data,
    validate_classifier_cohorts,
    validate_grouped_folds,
    validate_training_cohorts,
)
from atlas_tools.relation.evaluation.analysis._classifier_math import (
    applicability,
    cross_fit_predictions,
    expected_accuracy,
    fit_applicability,
    fit_model,
    fit_temperature,
    model_logits,
    soft_brier_score,
    soft_cross_entropy,
    softmax,
)
from atlas_tools.relation.evaluation.analysis.classifier_model import (
    ApplicabilityModel,
    ClassifierFit,
    ClassifierMetrics,
    CrossFitFold,
    EmbeddingRow,
    FloatMatrix,
    FloatVector,
    MultinomialModel,
    OutOfFoldPrediction,
    PolicyClassifier,
    PolicyPrediction,
    embedding_view,
    posterior_from_array,
)
from atlas_tools.relation.evaluation.analysis.deliverables import SoftLabel
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    ClassifierConfig,
    RelationId,
)

__all__ = [
    "ApplicabilityModel",
    "ClassifierFit",
    "ClassifierMetrics",
    "CrossFitFold",
    "EmbeddingRow",
    "MultinomialModel",
    "OutOfFoldPrediction",
    "PolicyClassifier",
    "PolicyPrediction",
    "fit_policy_classifier",
    "predict_policy",
    "soft_brier_score",
    "soft_cross_entropy",
    "validate_classifier_cohorts",
    "validate_grouped_folds",
]


def _prediction(
    *,
    relation_id: RelationId,
    card_hash: CardHash,
    logits: FloatVector,
    raw: FloatVector,
    calibrated: FloatVector,
    distance: float,
    applicability_score: float,
) -> PolicyPrediction:
    return PolicyPrediction(
        relation_id=relation_id,
        card_hash=card_hash,
        applicability=applicability_score,
        distance=distance,
        logits=(float(logits[0]), float(logits[1]), float(logits[2])),
        raw=posterior_from_array(raw),
        calibrated=posterior_from_array(calibrated),
    )


def _embedding_matrix(
    rows: Sequence[EmbeddingRow],
    *,
    expected_dimension: int,
) -> tuple[tuple[EmbeddingRow, ...], FloatMatrix]:
    by_relation_id: dict[RelationId, EmbeddingRow] = {}
    for row in rows:
        if row.relation_id in by_relation_id:
            raise ValueError(f"prediction embeddings repeat relation {row.relation_id}")
        if row.dimension != expected_dimension:
            raise ValueError(
                f"embedding {row.relation_id} has dimension {row.dimension}, "
                f"expected {expected_dimension}"
            )

        by_relation_id[row.relation_id] = row

    ordered = tuple(by_relation_id[relation_id] for relation_id in sorted(by_relation_id))
    matrix = np.empty((len(ordered), expected_dimension), dtype=np.float64)
    for index, row in enumerate(ordered):
        matrix[index] = embedding_view(row)

    return ordered, matrix


def predict_policy(
    classifier: PolicyClassifier,
    embeddings: Sequence[EmbeddingRow],
) -> tuple[PolicyPrediction, ...]:
    """Predict cards in relation order with calibrated applicability scores.

    Empty input returns an empty tuple. Duplicate relations or dimensions that
    differ from the fitted classifier raise [`ValueError`]. Time is `O(nd)`
    for `n` rows and embedding dimension `d`.
    """
    if not embeddings:
        return ()

    rows, matrix = _embedding_matrix(
        embeddings,
        expected_dimension=classifier.model.dimension,
    )

    logits = model_logits(classifier.model, matrix)
    raw = softmax(logits)
    calibrated = softmax(logits / classifier.temperature)
    distances, scores = applicability(classifier.applicability, matrix)
    return tuple(
        _prediction(
            relation_id=row.relation_id,
            card_hash=row.card_hash,
            logits=logits[index],
            raw=raw[index],
            calibrated=calibrated[index],
            distance=float(distances[index]),
            applicability_score=float(scores[index]),
        )
        for index, row in enumerate(rows)
    )


def fit_policy_classifier(
    labels: Sequence[SoftLabel],
    embeddings: Sequence[EmbeddingRow],
    families: Sequence[FamilyBindingRow],
    config: ClassifierConfig,
) -> ClassifierFit:
    """Fit final and grouped out-of-fold soft-target classifiers.

    Every label must have exactly one embedding and one verified closure row
    with the same relation ID and card hash. Closure families are assigned
    atomically to balanced deterministic folds. Each held-out
    fold uses inner grouped predictions for temperature fitting and only its
    outer-training embeddings for applicability. Every optimizer invocation
    must report convergence or the fit fails.

    Raises:
        ValueError: Input identities, weights, dimensions, families, folds, or
            optimizer results violate the classifier contract.

    """
    data = join_training_data(labels, embeddings, families)
    validate_training_cohorts(data, config)
    assignment = grouped_fold_assignment(data, config)
    cross_fit = cross_fit_predictions(
        data,
        config,
        assignment,
    )
    temperature = fit_temperature(
        cross_fit.logits,
        data.targets,
        data.vote_weights,
    )
    raw_probabilities = softmax(cross_fit.logits)
    calibrated_probabilities = softmax(
        cross_fit.logits / cross_fit.temperature_by_row[:, np.newaxis]
    )
    deployed_calibrated_probabilities = softmax(cross_fit.logits / temperature)
    final_model = fit_model(
        data.embeddings,
        data.targets,
        data.vote_weights,
        config,
    )
    applicability_model = fit_applicability(data.embeddings)

    out_of_fold: list[OutOfFoldPrediction] = []
    for index, (label, family_id) in enumerate(zip(data.labels, data.families, strict=True)):
        prediction = _prediction(
            relation_id=label.relation_id,
            card_hash=label.card_hash,
            logits=cross_fit.logits[index],
            raw=raw_probabilities[index],
            calibrated=calibrated_probabilities[index],
            distance=float(cross_fit.distances[index]),
            applicability_score=float(cross_fit.applicability_scores[index]),
        )

        out_of_fold.append(
            OutOfFoldPrediction(
                relation_id=prediction.relation_id,
                card_hash=prediction.card_hash,
                applicability=prediction.applicability,
                distance=prediction.distance,
                logits=prediction.logits,
                raw=prediction.raw,
                calibrated=prediction.calibrated,
                family_id=family_id,
                fold=int(cross_fit.fold_indices[index]),
                calibration_temperature=float(cross_fit.temperature_by_row[index]),
            )
        )

    cross_fit_folds = tuple(
        CrossFitFold(
            fold=fold,
            validation_relation_ids=tuple(
                label.relation_id
                for index, label in enumerate(data.labels)
                if int(cross_fit.fold_indices[index]) == fold
            ),
            temperature=cross_fit.temperatures[fold],
            applicability=cross_fit.applicability_models[fold],
        )
        for fold in range(config.folds)
    )

    raw_posteriors = tuple(row.raw for row in out_of_fold)
    calibrated_posteriors = tuple(row.calibrated for row in out_of_fold)
    target_posteriors = tuple(label.posterior for label in data.labels)
    weights = tuple(float(value) for value in data.vote_weights)
    metrics = ClassifierMetrics(
        training_cards=len(data.labels),
        training_vote_weight=math.fsum(weights),
        folds=config.folds,
        max_fold_iterations=cross_fit.max_iterations,
        out_of_fold_cross_entropy=soft_cross_entropy(
            raw_posteriors,
            target_posteriors,
            weights,
        ),
        calibrated_cross_entropy=soft_cross_entropy(
            calibrated_posteriors,
            target_posteriors,
            weights,
        ),
        deployed_temperature_cross_entropy=soft_cross_entropy(
            tuple(posterior_from_array(row) for row in deployed_calibrated_probabilities),
            target_posteriors,
            weights,
        ),
        out_of_fold_brier=soft_brier_score(
            raw_posteriors,
            target_posteriors,
            weights,
        ),
        calibrated_brier=soft_brier_score(
            calibrated_posteriors,
            target_posteriors,
            weights,
        ),
        raw_expected_accuracy=expected_accuracy(
            raw_posteriors,
            target_posteriors,
            weights,
        ),
        calibrated_expected_accuracy=expected_accuracy(
            calibrated_posteriors,
            target_posteriors,
            weights,
        ),
    )

    return ClassifierFit(
        classifier=PolicyClassifier(
            config=config,
            model=final_model,
            temperature=temperature,
            applicability=applicability_model,
        ),
        cross_fit_folds=cross_fit_folds,
        out_of_fold=tuple(out_of_fold),
        metrics=metrics,
        fold_by_relation_id=assignment,
    )
