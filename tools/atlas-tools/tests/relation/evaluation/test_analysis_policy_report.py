from collections.abc import Sequence

import pytest

from atlas_tools.relation.evaluation.analysis.api import (
    CardAnalysis,
    CoincidentGate,
    GoldLabel,
    OutOfFoldPrediction,
    PlacementPosterior,
    build_policy_report,
    minimum_feedable_count,
    render_policy_report_markdown,
    wilson_lower_bound,
)
from atlas_tools.relation.evaluation.domain.api import RelationFamilyId, ReportConfig
from tests.relation.evaluation.test_analysis_grid import _analysis


def _gold(
    card: CardAnalysis,
    verdict: str,
    *,
    post_exposure: bool = False,
) -> GoldLabel:
    return GoldLabel.model_validate(
        {
            "relation_id": card.card.relation_id,
            "verdict": verdict,
            "pass_count": 3,
            "entropy": 0.0,
            "post_exposure": post_exposure,
        },
        strict=True,
    )


def _prediction(
    card: CardAnalysis,
    calibrated: PlacementPosterior,
    *,
    applicability: float,
) -> OutOfFoldPrediction:
    family_id = card.card.family_id
    if family_id is None:
        raise AssertionError("classifier fixture card lacks a relation family")
    return OutOfFoldPrediction(
        relation_id=card.card.relation_id,
        card_hash=card.card.card_hash,
        family_id=family_id,
        fold=0,
        calibration_temperature=1.0,
        applicability=applicability,
        distance=1.0 - applicability,
        logits=(0.0, 0.0, 0.0),
        raw=calibrated,
        calibrated=calibrated,
    )


def _classifier_rows(cards: Sequence[CardAnalysis]) -> tuple[OutOfFoldPrediction, ...]:
    stable, refined = cards
    return (
        _prediction(
            stable,
            PlacementPosterior(coincident=0.2, proximal=0.7, overlay=0.1),
            applicability=0.25,
        ),
        _prediction(
            refined,
            PlacementPosterior(coincident=0.9, proximal=0.05, overlay=0.05),
            applicability=0.75,
        ),
    )


def test_policy_report_accounts_for_thresholded_gold_and_raw_calibration() -> None:
    analysis = _analysis()
    stable, refined = analysis.cards
    report = build_policy_report(
        analysis,
        (_gold(stable, "proximal"), _gold(refined, "coincident")),
        ReportConfig(calibrated_threshold=0.8, calibration_bins=2),
        rubric_version="rubric-v1",
        classifier_predictions=_classifier_rows(analysis.cards),
    )

    assert report.panel_gold.agreement.model_dump() == {
        "state": "defined",
        "numerator": 2,
        "denominator": 2,
        "value": 1.0,
    }
    assert report.classifier is not None
    assert report.classifier.gold.agreement.model_dump() == {
        "state": "defined",
        "numerator": 1,
        "denominator": 2,
        "value": 0.5,
    }
    assert report.classifier.gold.no_calls == 1
    coincident, proximal, overlay = report.classifier.gold.per_class
    assert (coincident.correct, coincident.predicted, coincident.gold_support) == (1, 1, 1)
    assert (proximal.correct, proximal.predicted, proximal.gold_support) == (0, 0, 1)
    assert proximal.precision.state == "no-predictions"
    assert proximal.recall.value == 0.0
    assert overlay.precision.state == "no-predictions"
    assert overlay.recall.state == "no-gold-support"

    empty, populated = report.classifier.calibration
    assert empty.mean_confidence.state == "empty-bin"
    assert empty.accuracy.state == "empty-bin"
    assert populated.count == 2
    assert populated.mean_confidence.value == pytest.approx(0.8)
    assert populated.accuracy.value == 1.0
    assert report.classifier.applicability[0].model_dump() == {
        "producer": "test",
        "cards": 2,
        "quantile_algorithm": "lower-order-statistic-v1",
        "q05": 0.25,
        "q25": 0.25,
        "q50": 0.25,
        "q75": 0.25,
        "q95": 0.25,
    }

    assert report.coincident_gate.source == "classifier"
    assert report.coincident_gate.stratum_size == 1
    assert report.coincident_gate.minimum_zero_error_count == 133
    assert report.coincident_gate.verdict == "insufficient-sample"
    assert tuple((judge.family_id, judge.gold_agreement.value) for judge in report.judges) == (
        ("judge/a", 1.0),
        ("judge/b", 0.25),
    )
    assert report.economics.total_votes == 8
    assert report.economics.total_known_cost_usd == pytest.approx(0.6)

    rendered = render_policy_report_markdown(report)
    assert rendered.endswith("\n")
    assert rendered.encode("ascii").decode("ascii") == rendered
    assert "UNPASSABLE BY SAMPLE SIZE" in rendered


def test_report_accepts_verified_closure_families_distinct_from_deck_metadata() -> None:
    analysis = _analysis()
    predictions = tuple(
        row.model_copy(update={"family_id": RelationFamilyId("closure:shared")})
        for row in _classifier_rows(analysis.cards)
    )

    report = build_policy_report(
        analysis,
        (),
        ReportConfig(),
        rubric_version="rubric-v1",
        classifier_predictions=predictions,
    )

    assert report.classifier is not None
    assert report.classifier.predictions == len(analysis.cards)


def test_empty_and_post_exposure_gold_have_explicit_non_release_states() -> None:
    analysis = _analysis()
    empty_report = build_policy_report(
        analysis,
        (),
        ReportConfig(),
        rubric_version="rubric-v1",
    )

    assert empty_report.panel_gold.agreement.state == "no-observations"
    assert empty_report.panel_gold.per_class[0].precision.state == "no-predictions"
    assert empty_report.panel_gold.per_class[0].recall.state == "no-gold-support"
    assert empty_report.coincident_gate.wilson_state == "no-predictions"
    assert empty_report.coincident_gate.verdict == "insufficient-sample"
    assert all(judge.gold_agreement.state == "no-observations" for judge in empty_report.judges)

    [stable, _] = analysis.cards
    exposed_report = build_policy_report(
        analysis,
        (_gold(stable, "proximal", post_exposure=True),),
        ReportConfig(),
        rubric_version="rubric-v1",
    )
    assert exposed_report.gold_cards == 1
    assert exposed_report.gold_post_exposure == 1
    assert exposed_report.panel_gold.independent_gold_cards == 0
    assert exposed_report.panel_gold.agreement.state == "no-observations"
    assert exposed_report.coincident_gate.stratum_size == 0


def test_wilson_threshold_and_identity_drift_fail_closed() -> None:
    assert minimum_feedable_count(0.98, confidence=0.95) == 133
    assert wilson_lower_bound(132, 132, confidence=0.95) == pytest.approx(0.9799151290680371)
    assert wilson_lower_bound(133, 133, confidence=0.95) == pytest.approx(0.9800631323877304)

    valid_report = build_policy_report(
        _analysis(),
        (),
        ReportConfig(),
        rubric_version="rubric-v1",
    )
    forged_gate = valid_report.coincident_gate.model_dump()
    forged_gate.update(
        minimum_zero_error_count=1,
        sample_size_state="sufficient",
        verdict="pass",
    )
    with pytest.raises(ValueError, match="minimum sample does not match"):
        CoincidentGate.model_validate(forged_gate, strict=True)

    analysis = _analysis()
    stable, refined = analysis.cards
    stable_gold = _gold(stable, "proximal")
    with pytest.raises(ValueError, match="repeat relation"):
        build_policy_report(
            analysis,
            (stable_gold, stable_gold),
            ReportConfig(),
            rubric_version="rubric-v1",
        )

    outside = stable_gold.model_copy(update={"relation_id": "test:not-in-grid"})
    with pytest.raises(ValueError, match="outside the grid"):
        build_policy_report(
            analysis,
            (outside,),
            ReportConfig(),
            rubric_version="rubric-v1",
        )

    rows = _classifier_rows((stable, refined))
    drifted = rows[0].model_copy(update={"card_hash": "f" * 64})
    with pytest.raises(ValueError, match="card hash differs"):
        build_policy_report(
            analysis,
            (),
            ReportConfig(),
            rubric_version="rubric-v1",
            classifier_predictions=(drifted, rows[1]),
        )
