"""Join closure-validated classifier predictions to grid report rows."""

from collections.abc import Mapping, Sequence

from atlas_tools.relation.evaluation.analysis.classifier_model import (
    OutOfFoldPrediction,
)
from atlas_tools.relation.evaluation.analysis.grid import GridAnalysis
from atlas_tools.relation.evaluation.analysis.policy_report_model import (
    ApplicabilitySummary,
    PredictedLabel,
)
from atlas_tools.relation.evaluation.domain.api import RelationId

_QUANTILES = (0.05, 0.25, 0.50, 0.75, 0.95)


def classifier_index(
    analysis: GridAnalysis,
    rows: Sequence[OutOfFoldPrediction],
) -> dict[RelationId, OutOfFoldPrediction]:
    """Require exact relation/card coverage for report-time predictions.

    A classifier bundle's family IDs are validated against its verified family
    closure when the artifact is loaded. The grid deck's legacy `family_id` is
    not comparable to that closure-derived identity and is intentionally not
    consulted here.
    """
    cards = {card.card.relation_id: card.card for card in analysis.cards}
    predictions: dict[RelationId, OutOfFoldPrediction] = {}
    for row in rows:
        if row.relation_id in predictions:
            raise ValueError(f"classifier predictions repeat relation {row.relation_id}")
        card = cards.get(row.relation_id)
        if card is None:
            raise ValueError(f"classifier predicts relation outside the grid: {row.relation_id}")
        if row.card_hash != card.card_hash:
            raise ValueError(f"classifier card hash differs for {row.relation_id}")
        predictions[row.relation_id] = row
    missing = tuple(sorted(set(cards) - set(predictions)))
    if missing:
        raise ValueError(f"classifier predictions omit grid relations: {missing[:5]}")
    return predictions


def classifier_labels(
    predictions: Mapping[RelationId, OutOfFoldPrediction],
    *,
    threshold: float,
) -> dict[RelationId, PredictedLabel]:
    """Apply the configured no-call threshold to calibrated predictions."""
    labels: dict[RelationId, PredictedLabel] = {}
    for relation_id, row in predictions.items():
        if row.top_probability < threshold:
            labels[relation_id] = "no-call"
        else:
            labels[relation_id] = row.top_class
    return labels


def classifier_applicability(
    analysis: GridAnalysis,
    predictions: Mapping[RelationId, OutOfFoldPrediction],
) -> tuple[ApplicabilitySummary, ...]:
    """Summarize independently fitted applicability by card producer."""
    producer_by_relation = {card.card.relation_id: card.card.producer for card in analysis.cards}
    by_producer: dict[str, list[float]] = {}
    for relation_id, prediction in predictions.items():
        producer = producer_by_relation[relation_id]
        by_producer.setdefault(producer, []).append(prediction.applicability)
    summaries: list[ApplicabilitySummary] = []
    for producer in sorted(by_producer):
        values = sorted(by_producer[producer])
        quantiles = tuple(values[int(point * (len(values) - 1))] for point in _QUANTILES)
        summaries.append(
            ApplicabilitySummary(
                producer=producer,
                cards=len(values),
                q05=quantiles[0],
                q25=quantiles[1],
                q50=quantiles[2],
                q75=quantiles[3],
                q95=quantiles[4],
            )
        )
    return tuple(summaries)
