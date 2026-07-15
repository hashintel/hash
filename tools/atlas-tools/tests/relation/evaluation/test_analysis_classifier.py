import hashlib
import math

import pytest

from atlas_tools.relation.evaluation.analysis.classifier import (
    EmbeddingRow,
    fit_policy_classifier,
    predict_policy,
    soft_brier_score,
    soft_cross_entropy,
    validate_classifier_cohorts,
    validate_grouped_folds,
)
from atlas_tools.relation.evaluation.analysis.deliverables import (
    PlacementPosterior,
    PlacementTally,
    SoftLabel,
    placement_posterior,
)
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    ClassifierConfig,
    PlacementClass,
    RelationFamilyId,
)


def _card_hash(relation_id: str) -> CardHash:
    return CardHash(hashlib.sha256(relation_id.encode()).hexdigest())


def _label(
    index: int,
    *,
    family_id: RelationFamilyId,
    placement_class: PlacementClass,
) -> SoftLabel:
    match placement_class:
        case "coincident":
            tally = PlacementTally(coincident=9)
        case "proximal":
            tally = PlacementTally(proximal=9)
        case "overlay":
            tally = PlacementTally(overlay=9)
    return _label_from_tally(index, family_id=family_id, tally=tally)


def _label_from_tally(
    index: int,
    *,
    family_id: RelationFamilyId,
    tally: PlacementTally,
) -> SoftLabel:
    relation_id = f"test:relation-{index:02d}"
    return SoftLabel(
        relation_id=relation_id,
        card_hash=_card_hash(relation_id),
        producer="test",
        family_id=family_id,
        prescreen_stratum="fixture",
        tally=tally,
        unclear_votes=0,
        abstentions=0,
        posterior=placement_posterior(tally),
        refined=False,
        review=tally.coincident > 0,
    )


def _dataset() -> tuple[tuple[SoftLabel, ...], tuple[EmbeddingRow, ...]]:
    specifications: tuple[tuple[RelationFamilyId, PlacementClass, tuple[float, float]], ...] = (
        (RelationFamilyId("family-a"), "coincident", (-2.0, 0.0)),
        (RelationFamilyId("family-a"), "coincident", (-2.0, 0.5)),
        (RelationFamilyId("family-b"), "proximal", (2.0, 0.0)),
        (RelationFamilyId("family-b"), "proximal", (2.0, 0.5)),
        (RelationFamilyId("family-c"), "overlay", (0.0, 2.0)),
        (RelationFamilyId("family-c"), "overlay", (0.5, 2.0)),
        (RelationFamilyId("family-d"), "coincident", (-2.0, -0.5)),
        (RelationFamilyId("family-d"), "coincident", (-1.5, 0.0)),
        (RelationFamilyId("family-e"), "proximal", (2.0, -0.5)),
        (RelationFamilyId("family-e"), "proximal", (1.5, 0.0)),
        (RelationFamilyId("family-f"), "overlay", (0.0, 1.5)),
        (RelationFamilyId("family-f"), "overlay", (-0.5, 2.0)),
    )
    labels = tuple(
        _label(index, family_id=family_id, placement_class=placement_class)
        for index, (family_id, placement_class, _) in enumerate(specifications)
    )
    embeddings = tuple(
        EmbeddingRow.from_values(
            relation_id=label.relation_id,
            card_hash=label.card_hash,
            values=coordinates,
        )
        for label, (_, _, coordinates) in zip(labels, specifications, strict=True)
    )
    return labels, embeddings


def test_soft_metrics_match_hand_calculation() -> None:
    targets = (
        PlacementPosterior(coincident=0.5, proximal=0.25, overlay=0.25),
        PlacementPosterior(coincident=0.0, proximal=1.0, overlay=0.0),
    )
    probabilities = (
        PlacementPosterior(coincident=0.5, proximal=0.25, overlay=0.25),
        PlacementPosterior(coincident=0.25, proximal=0.5, overlay=0.25),
    )
    first_entropy = -(0.5 * math.log(0.5) + 0.5 * math.log(0.25))
    expected_cross_entropy = (2.0 * first_entropy - math.log(0.5)) / 3.0

    assert soft_cross_entropy(probabilities, targets, (2.0, 1.0)) == pytest.approx(
        expected_cross_entropy
    )
    assert soft_brier_score(probabilities, targets, (2.0, 1.0)) == pytest.approx(0.125)


def test_training_join_rejects_card_drift_and_missing_family() -> None:
    labels, embeddings = _dataset()
    drifted = embeddings[0].model_copy(update={"card_hash": "f" * 64})
    config = ClassifierConfig(folds=3, max_iterations=500)

    with pytest.raises(ValueError, match="card hash differs"):
        fit_policy_classifier(labels, (drifted, *embeddings[1:]), config)

    extra = EmbeddingRow.from_values(
        relation_id="test:extra",
        card_hash=CardHash("e" * 64),
        values=(0.0, 0.0),
    )
    with pytest.raises(ValueError, match="relation coverage differs"):
        fit_policy_classifier(labels, (*embeddings, extra), config)

    missing_family = labels[0].model_copy(update={"family_id": None})
    with pytest.raises(ValueError, match="requires family_id"):
        fit_policy_classifier((missing_family, *labels[1:]), embeddings, config)


def test_grouped_fold_validation_refuses_family_leakage() -> None:
    labels, _ = _dataset()
    leaking = {label.relation_id: index % 3 for index, label in enumerate(labels)}

    with pytest.raises(ValueError, match="leaks relation family family-a"):
        validate_grouped_folds(labels, leaking, folds=3)


def test_cross_fit_preflight_rejects_missing_and_impossible_cohorts() -> None:
    labels, _ = _dataset()
    missing = labels[0].model_copy(update={"family_id": None})
    config = ClassifierConfig(folds=3)

    with pytest.raises(
        ValueError,
        match="1 cards lack family_id, for example \\('test:relation-00',\\)",
    ):
        validate_classifier_cohorts((missing, *labels[1:]), config)

    one_per_family = (labels[0], labels[2], labels[4])
    with pytest.raises(
        ValueError,
        match="outer fold 0 leaves 2 relation families for 3-fold calibration",
    ):
        validate_classifier_cohorts(one_per_family, config)


def test_fit_is_deterministic_grouped_and_applicability_aware() -> None:
    labels, embeddings = _dataset()
    config = ClassifierConfig(
        folds=3,
        regularization=1.0,
        max_iterations=500,
        seed=17,
    )
    first = fit_policy_classifier(labels, embeddings, config)
    second = fit_policy_classifier(tuple(reversed(labels)), tuple(reversed(embeddings)), config)

    assert first == second
    assert dict(first.fold_by_relation_id) == {
        "test:relation-00": 1,
        "test:relation-01": 1,
        "test:relation-02": 2,
        "test:relation-03": 2,
        "test:relation-04": 1,
        "test:relation-05": 1,
        "test:relation-06": 0,
        "test:relation-07": 0,
        "test:relation-08": 0,
        "test:relation-09": 0,
        "test:relation-10": 2,
        "test:relation-11": 2,
    }
    assert first.classifier.temperature == pytest.approx(
        0.9297613992641235,
        rel=1e-12,
        abs=1e-12,
    )
    assert first.metrics.out_of_fold_cross_entropy == pytest.approx(
        0.6040317713344728,
        rel=1e-12,
        abs=1e-12,
    )
    assert first.metrics.calibrated_cross_entropy == pytest.approx(
        0.9006101202960468,
        rel=1e-12,
        abs=1e-12,
    )
    assert first.metrics.deployed_temperature_cross_entropy == pytest.approx(
        0.602399616384659,
        rel=1e-12,
        abs=1e-12,
    )
    by_family: dict[RelationFamilyId, set[int]] = {}
    for label in labels:
        assert label.family_id is not None
        by_family.setdefault(label.family_id, set()).add(
            first.fold_by_relation_id[label.relation_id]
        )
    assert all(len(folds) == 1 for folds in by_family.values())
    assert set(first.fold_by_relation_id.values()) == {0, 1, 2}
    assert (
        first.metrics.deployed_temperature_cross_entropy <= first.metrics.out_of_fold_cross_entropy
    )

    predictions = predict_policy(
        first.classifier,
        (
            EmbeddingRow.from_values(
                relation_id="test:center",
                card_hash=CardHash("a" * 64),
                values=(0.0, 0.0),
            ),
            EmbeddingRow.from_values(
                relation_id="test:far",
                card_hash=CardHash("b" * 64),
                values=(100.0, 100.0),
            ),
        ),
    )
    center, far = predictions
    assert center.relation_id == "test:center"
    assert far.distance > center.distance
    assert far.applicability < center.applicability


def test_held_out_family_cannot_change_its_fold_calibration_or_applicability() -> None:
    labels, embeddings = _dataset()
    config = ClassifierConfig(folds=3, max_iterations=500, seed=17)
    original = fit_policy_classifier(labels, embeddings, config)
    changed_label = _label(
        0,
        family_id=RelationFamilyId("family-a"),
        placement_class="overlay",
    )
    changed_embedding = EmbeddingRow.from_values(
        relation_id=embeddings[0].relation_id,
        card_hash=embeddings[0].card_hash,
        values=(1000.0, -1000.0),
    )
    changed = fit_policy_classifier(
        (changed_label, *labels[1:]),
        (changed_embedding, *embeddings[1:]),
        config,
    )

    original_row = next(
        row for row in original.out_of_fold if row.relation_id == "test:relation-04"
    )
    changed_row = next(
        row for row in changed.out_of_fold if row.relation_id == original_row.relation_id
    )
    assert original.fold_by_relation_id[changed_label.relation_id] == original_row.fold
    assert changed.classifier != original.classifier
    assert changed_row.logits == original_row.logits
    assert changed_row.calibration_temperature == original_row.calibration_temperature
    assert changed_row.calibrated == original_row.calibrated
    assert changed_row.distance == original_row.distance
    assert changed_row.applicability == original_row.applicability


def test_optimizer_matches_weighted_soft_target_mean_for_constant_features() -> None:
    tallies = (
        PlacementTally(coincident=1),
        PlacementTally(proximal=9),
        PlacementTally(coincident=1),
        PlacementTally(proximal=9),
    )
    labels = tuple(
        _label_from_tally(
            index + 20,
            family_id=RelationFamilyId(f"weighted-{index}"),
            tally=tally,
        )
        for index, tally in enumerate(tallies)
    )
    embeddings = tuple(
        EmbeddingRow.from_values(
            relation_id=label.relation_id,
            card_hash=label.card_hash,
            values=(0.0,),
        )
        for label in labels
    )
    fitted = fit_policy_classifier(
        labels,
        embeddings,
        ClassifierConfig(folds=2, max_iterations=500),
    )
    [prediction] = predict_policy(
        fitted.classifier,
        (
            EmbeddingRow.from_values(
                relation_id="test:weighted-query",
                card_hash=CardHash("d" * 64),
                values=(0.0,),
            ),
        ),
    )

    assert prediction.raw.coincident == pytest.approx(0.125, abs=3e-6)
    assert prediction.raw.proximal == pytest.approx(0.775, abs=3e-6)
    assert prediction.raw.overlay == pytest.approx(0.1, abs=3e-6)


def test_non_converged_optimizer_is_rejected() -> None:
    labels, embeddings = _dataset()

    with pytest.raises(ValueError, match="did not converge"):
        fit_policy_classifier(
            labels,
            embeddings,
            ClassifierConfig(folds=3, max_iterations=1),
        )
