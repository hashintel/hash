"""Exercise class-specific Coincident evidence review during classifier fitting."""

import pytest

from atlas_tools.relation.evaluation.analysis.classifier import fit_policy_classifier
from atlas_tools.relation.evaluation.analysis.deliverables import PlacementTally
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    ClassifierConfig,
    CoincidentReviewRow,
    RelationFamilyId,
    TargetResolutionRow,
)
from tests.relation.evaluation.classifier_fixtures import family_assignment_rows
from tests.relation.evaluation.test_analysis_classifier import _dataset, _label_from_tally


def test_coincident_review_confirms_rejects_or_excludes_evidence() -> None:
    original_labels, embeddings = _dataset()
    mixed = _label_from_tally(
        0,
        family_id=RelationFamilyId("family-a"),
        tally=PlacementTally(coincident=2, proximal=4, overlay=3),
    )
    labels = (mixed, *original_labels[1:])
    families = family_assignment_rows(labels)
    config = ClassifierConfig(folds=3, max_iterations=500, seed=17)
    confirmed_reviews = tuple(
        CoincidentReviewRow(
            relation_id=label.relation_id,
            card_hash=label.card_hash,
            action="confirmed",
        )
        for label in labels
        if label.review
    )
    reviewed = confirmed_reviews[0]
    rejected_reviews = (
        reviewed.model_copy(update={"action": "rejected"}),
        *confirmed_reviews[1:],
    )

    baseline = fit_policy_classifier(labels, embeddings, families, config)
    confirmed = fit_policy_classifier(
        labels,
        embeddings,
        families,
        config,
        coincident_reviews=confirmed_reviews,
    )
    rejected = fit_policy_classifier(
        labels,
        embeddings,
        families,
        config,
        coincident_reviews=rejected_reviews,
    )
    excluded = fit_policy_classifier(
        labels,
        embeddings,
        families,
        config,
        coincident_reviews=(
            reviewed.model_copy(update={"action": "excluded"}),
            *confirmed_reviews[1:],
        ),
    )

    assert confirmed.classifier == baseline.classifier
    assert confirmed.metrics.training_vote_weight == baseline.metrics.training_vote_weight
    assert rejected.classifier != baseline.classifier
    assert (
        rejected.metrics.training_vote_weight
        == baseline.metrics.training_vote_weight - mixed.tally.coincident
    )
    assert (
        excluded.metrics.training_vote_weight
        == rejected.metrics.training_vote_weight - mixed.tally.proximal - mixed.tally.overlay
    )
    assert {row.relation_id for row in excluded.out_of_fold} == {
        label.relation_id for label in labels
    }

    with pytest.raises(ValueError, match="do not cover every-and-only"):
        fit_policy_classifier(
            labels,
            embeddings,
            families,
            config,
            coincident_reviews=(reviewed,),
        )

    all_coincident_rejected = (
        confirmed_reviews[0],
        confirmed_reviews[1].model_copy(update={"action": "rejected"}),
        *confirmed_reviews[2:],
    )
    with pytest.raises(ValueError, match="full placement adjudication"):
        fit_policy_classifier(
            labels,
            embeddings,
            families,
            config,
            coincident_reviews=all_coincident_rejected,
        )

    drifted = reviewed.model_copy(update={"card_hash": CardHash("f" * 64)})
    with pytest.raises(ValueError, match="Coincident review card hash differs"):
        fit_policy_classifier(
            labels,
            embeddings,
            families,
            config,
            coincident_reviews=(drifted, *confirmed_reviews[1:]),
        )

    with pytest.raises(ValueError, match="two human target decisions"):
        fit_policy_classifier(
            labels,
            embeddings,
            families,
            config,
            resolutions=(
                TargetResolutionRow(
                    relation_id=reviewed.relation_id,
                    card_hash=reviewed.card_hash,
                    action="coincident",
                ),
            ),
            coincident_reviews=confirmed_reviews,
        )
