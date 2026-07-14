"""Build deterministic policy reports from already reconciled grid evidence.

All joins use relation-indexed maps. Gold labels marked post-exposure are
reported but excluded from agreement, calibration, judge agreement, and the
release gate because they are not independent validation evidence.
"""

import json
import math
import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from atlas_tools.relation.evaluation.analysis._policy_math import (
    minimum_feedable_count,
    wilson_lower_bound,
)
from atlas_tools.relation.evaluation.analysis.classifier_model import (
    OutOfFoldPrediction,
)
from atlas_tools.relation.evaluation.analysis.economics import vote_economics
from atlas_tools.relation.evaluation.analysis.grid import CardAnalysis, GridAnalysis
from atlas_tools.relation.evaluation.analysis.policy_report_model import (
    ApplicabilitySummary,
    CalibrationBin,
    ClassifierPolicyEvaluation,
    CoincidentGate,
    ConfusionRow,
    FamilyVoteEconomics,
    GateVerdict,
    GoldAgreement,
    GoldLabel,
    JudgeHealth,
    PlacementClassMetrics,
    PolicyReport,
    PolicyVoteEconomics,
    PredictedLabel,
    PredictionSource,
    RateMetric,
    RateState,
    ScalarMetric,
    ScalarState,
)
from atlas_tools.relation.evaluation.domain.api import (
    PLACEMENT_CLASSES,
    VERDICTS,
    PlacementClass,
    RelationId,
    ReportConfig,
    Verdict,
)

__all__ = [
    "ApplicabilitySummary",
    "CalibrationBin",
    "ClassifierPolicyEvaluation",
    "CoincidentGate",
    "ConfusionRow",
    "FamilyVoteEconomics",
    "GoldAgreement",
    "GoldLabel",
    "JudgeHealth",
    "PlacementClassMetrics",
    "PolicyReport",
    "PolicyVoteEconomics",
    "RateMetric",
    "ScalarMetric",
    "build_policy_report",
    "minimum_feedable_count",
    "render_policy_report_markdown",
    "wilson_lower_bound",
]

_PREDICTED_LABELS: tuple[PredictedLabel, ...] = (
    "coincident",
    "proximal",
    "overlay",
    "no-call",
)
_QUANTILES = (0.05, 0.25, 0.50, 0.75, 0.95)


def _rate(
    numerator: int,
    denominator: int,
    *,
    undefined: RateState,
) -> RateMetric:
    state: RateState = undefined if denominator == 0 else "defined"
    return RateMetric(
        state=state,
        numerator=numerator,
        denominator=denominator,
        value=None if denominator == 0 else numerator / denominator,
    )


def _scalar(
    values: Sequence[float],
    *,
    undefined: ScalarState,
    reducer: str = "mean",
) -> ScalarMetric:
    if not values:
        return ScalarMetric(state=undefined, observations=0, value=None)
    match reducer:
        case "mean":
            value = math.fsum(values) / len(values)
        case "median":
            value = float(statistics.median(values))
        case _:
            raise AssertionError(f"unknown scalar reducer {reducer}")
    return ScalarMetric(state="defined", observations=len(values), value=value)


def _gold_index(
    gold: Sequence[GoldLabel],
    cards: Mapping[RelationId, CardAnalysis],
) -> tuple[tuple[GoldLabel, ...], dict[RelationId, GoldLabel]]:
    by_relation_id: dict[RelationId, GoldLabel] = {}
    for row in gold:
        if row.relation_id in by_relation_id:
            raise ValueError(f"gold labels repeat relation {row.relation_id}")
        if row.relation_id not in cards:
            raise ValueError(f"gold labels relation outside the grid: {row.relation_id}")
        by_relation_id[row.relation_id] = row
    ordered = tuple(by_relation_id[relation_id] for relation_id in sorted(by_relation_id))
    return ordered, by_relation_id


def _panel_label(card: CardAnalysis) -> PlacementClass:
    posterior = card.posterior
    values = (posterior.coincident, posterior.proximal, posterior.overlay)
    index = max(range(len(PLACEMENT_CLASSES)), key=lambda item: (values[item], -item))
    return PLACEMENT_CLASSES[index]


def _agreement(
    *,
    source: PredictionSource,
    gold: Sequence[GoldLabel],
    predictions: Mapping[RelationId, PredictedLabel],
    decision_threshold: float | None,
) -> GoldAgreement:
    counts: dict[Verdict, dict[PredictedLabel, int]] = {
        verdict: dict.fromkeys(_PREDICTED_LABELS, 0) for verdict in VERDICTS
    }
    post_exposure = 0
    for row in gold:
        if row.post_exposure:
            post_exposure += 1
            continue
        predicted = predictions.get(row.relation_id)
        if predicted is None:
            raise ValueError(f"{source} predictions omit gold relation {row.relation_id}")
        counts[row.verdict][predicted] += 1

    confusion = tuple(
        ConfusionRow(
            gold=verdict,
            coincident=counts[verdict]["coincident"],
            proximal=counts[verdict]["proximal"],
            overlay=counts[verdict]["overlay"],
            no_call=counts[verdict]["no-call"],
        )
        for verdict in VERDICTS
    )
    placement_gold = sum(confusion[index].total for index in range(len(PLACEMENT_CLASSES)))
    correct = sum(counts[placement_class][placement_class] for placement_class in PLACEMENT_CLASSES)
    metrics: list[PlacementClassMetrics] = []
    for placement_class in PLACEMENT_CLASSES:
        gold_support = sum(counts[placement_class].values())
        predicted = sum(counts[verdict][placement_class] for verdict in VERDICTS)
        class_correct = counts[placement_class][placement_class]
        metrics.append(
            PlacementClassMetrics(
                placement_class=placement_class,
                gold_support=gold_support,
                predicted=predicted,
                correct=class_correct,
                precision=_rate(
                    class_correct,
                    predicted,
                    undefined="no-predictions",
                ),
                recall=_rate(
                    class_correct,
                    gold_support,
                    undefined="no-gold-support",
                ),
            )
        )
    independent = len(gold) - post_exposure
    independent_unclear = confusion[-1].total
    return GoldAgreement(
        source=source,
        decision_threshold=decision_threshold,
        gold_cards=len(gold),
        post_exposure_excluded=post_exposure,
        independent_gold_cards=independent,
        independent_unclear=independent_unclear,
        placement_gold_cards=placement_gold,
        no_calls=sum(row.no_call for row in confusion),
        agreement=_rate(correct, placement_gold, undefined="no-observations"),
        per_class=(metrics[0], metrics[1], metrics[2]),
        confusion=(confusion[0], confusion[1], confusion[2], confusion[3]),
    )


def _classifier_index(
    analysis: GridAnalysis,
    rows: Sequence[OutOfFoldPrediction],
) -> dict[RelationId, OutOfFoldPrediction]:
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
        if row.family_id != card.family_id:
            raise ValueError(f"classifier family differs for {row.relation_id}")
        predictions[row.relation_id] = row
    missing = tuple(sorted(set(cards) - set(predictions)))
    if missing:
        raise ValueError(f"classifier predictions omit grid relations: {missing[:5]}")
    return predictions


def _classifier_labels(
    predictions: Mapping[RelationId, OutOfFoldPrediction],
    *,
    threshold: float,
) -> dict[RelationId, PredictedLabel]:
    labels: dict[RelationId, PredictedLabel] = {}
    for relation_id, row in predictions.items():
        if row.top_probability < threshold:
            labels[relation_id] = "no-call"
        else:
            labels[relation_id] = row.top_class
    return labels


def _coincident_gate(
    *,
    source: PredictionSource,
    gold: Sequence[GoldLabel],
    predictions: Mapping[RelationId, PredictedLabel],
    decision_threshold: float | None,
    config: ReportConfig,
) -> CoincidentGate:
    stratum = tuple(
        row
        for row in gold
        if not row.post_exposure
        and row.verdict != "unclear"
        and predictions[row.relation_id] == "coincident"
    )
    correct = sum(row.verdict == "coincident" for row in stratum)
    minimum = minimum_feedable_count(
        config.coincident_precision_target,
        confidence=config.confidence_level,
    )
    bound = (
        wilson_lower_bound(correct, len(stratum), confidence=config.confidence_level)
        if stratum
        else None
    )
    sufficient = len(stratum) >= minimum
    if not sufficient:
        verdict: GateVerdict = "insufficient-sample"
    elif bound is not None and bound >= config.coincident_precision_target:
        verdict = "pass"
    else:
        verdict = "fail"
    return CoincidentGate(
        source=source,
        decision_threshold=decision_threshold,
        stratum_size=len(stratum),
        correct=correct,
        precision=_rate(correct, len(stratum), undefined="no-predictions"),
        wilson_state="defined" if stratum else "no-predictions",
        wilson_lcb=bound,
        precision_target=config.coincident_precision_target,
        confidence_level=config.confidence_level,
        minimum_zero_error_count=minimum,
        sample_size_state="sufficient" if sufficient else "insufficient",
        verdict=verdict,
    )


def _calibration(
    gold: Sequence[GoldLabel],
    predictions: Mapping[RelationId, OutOfFoldPrediction],
    *,
    bins: int,
) -> tuple[CalibrationBin, ...]:
    confidence_sums = [0.0] * bins
    correct = [0] * bins
    counts = [0] * bins
    for row in gold:
        if row.post_exposure or row.verdict == "unclear":
            continue
        prediction = predictions[row.relation_id]
        confidence = prediction.top_probability
        index = min(int(confidence * bins), bins - 1)
        confidence_sums[index] += confidence
        correct[index] += prediction.top_class == row.verdict
        counts[index] += 1
    output: list[CalibrationBin] = []
    for index in range(bins):
        count = counts[index]
        mean_confidence = (
            ScalarMetric(state="empty-bin", observations=0, value=None)
            if count == 0
            else ScalarMetric(
                state="defined",
                observations=count,
                value=confidence_sums[index] / count,
            )
        )
        output.append(
            CalibrationBin(
                lower=index / bins,
                upper=(index + 1) / bins,
                upper_inclusive=index == bins - 1,
                count=count,
                mean_confidence=mean_confidence,
                accuracy=_rate(correct[index], count, undefined="empty-bin"),
            )
        )
    return tuple(output)


def _applicability(
    analysis: GridAnalysis,
    predictions: Mapping[RelationId, OutOfFoldPrediction],
) -> tuple[ApplicabilitySummary, ...]:
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


@dataclass(slots=True)
class _JudgeAccumulator:
    votes: int = 0
    abstentions: int = 0
    repairs: int = 0
    gold_votes: int = 0
    gold_correct: int = 0
    latencies: list[float] = field(default_factory=list)
    fresh_costs: list[float] = field(default_factory=list)


def _judge_health(
    analysis: GridAnalysis,
    gold: Mapping[RelationId, GoldLabel],
) -> tuple[JudgeHealth, ...]:
    accumulators = {family_id: _JudgeAccumulator() for family_id in analysis.family_ids}
    for card in analysis.cards:
        gold_row = gold.get(card.card.relation_id)
        independent_gold = (
            gold_row
            if gold_row is not None and not gold_row.post_exposure and gold_row.verdict != "unclear"
            else None
        )
        for family in card.families:
            accumulator = accumulators[family.family_id]
            for observed in family.votes():
                vote = observed.vote
                accumulator.votes += 1
                accumulator.abstentions += vote.abstained
                accumulator.repairs += vote.parse_retries > 0
                accumulator.latencies.append(vote.latency.total_seconds())
                if observed.source == "fresh":
                    accumulator.fresh_costs.append(vote.known_cost_usd)
                if independent_gold is not None and not vote.abstained:
                    accumulator.gold_votes += 1
                    accumulator.gold_correct += vote.verdict == independent_gold.verdict
    output: list[JudgeHealth] = []
    for family_id, accumulator in accumulators.items():
        output.append(
            JudgeHealth(
                family_id=family_id,
                votes=accumulator.votes,
                abstentions=accumulator.abstentions,
                abstention_rate=_rate(
                    accumulator.abstentions,
                    accumulator.votes,
                    undefined="no-observations",
                ),
                initial_schema_compliance=_rate(
                    accumulator.votes - accumulator.repairs,
                    accumulator.votes,
                    undefined="no-observations",
                ),
                parse_repair_rate=_rate(
                    accumulator.repairs,
                    accumulator.votes,
                    undefined="no-observations",
                ),
                gold_votes=accumulator.gold_votes,
                gold_agreement=_rate(
                    accumulator.gold_correct,
                    accumulator.gold_votes,
                    undefined="no-observations",
                ),
                median_latency_seconds=_scalar(
                    accumulator.latencies,
                    undefined="no-observations",
                    reducer="median",
                ),
                fresh_known_cost_usd=math.fsum(accumulator.fresh_costs),
            )
        )
    return tuple(output)


def _economics(analysis: GridAnalysis) -> PolicyVoteEconomics:
    economics = vote_economics(analysis)
    families = tuple(
        FamilyVoteEconomics(
            family_id=row.family_id,
            imported_votes=row.imported_votes,
            fresh_baseline_votes=row.fresh_baseline_votes,
            refinement_votes=row.refinement_votes,
            abstentions=row.abstentions,
            total_votes=row.total_votes,
            known_cost_usd=row.known_cost_usd,
        )
        for row in economics.by_family
    )
    return PolicyVoteEconomics(
        pool_cards=economics.pool_cards,
        refined_cards=economics.refined_cards,
        review_queue_cards=economics.review_queue_cards,
        total_votes=economics.total_votes,
        total_known_cost_usd=economics.total_known_cost_usd,
        realized_trigger_rate=economics.realized_trigger_rate,
        by_family=families,
    )


def build_policy_report(
    analysis: GridAnalysis,
    gold: Sequence[GoldLabel],
    config: ReportConfig,
    *,
    rubric_version: str,
    classifier_predictions: Sequence[OutOfFoldPrediction] | None = None,
) -> PolicyReport:
    """Build one report in indexed linear passes over cards, gold, and votes.

    Classifier rows must cover the grid exactly by relation, card hash, and
    relation family. Gold may be empty or cover a subset of the grid. A gold
    relation outside the grid, duplicate gold, or classifier identity drift
    fails before metrics are computed.

    Raises:
        ValueError: Gold or classifier identities disagree with grid evidence.

    Complexity:
        Indexed joins and metric aggregation use `O(c + g + p + v)` time and
        `O(c + g + p)` additional space for cards, gold rows, predictions, and
        votes. Deterministic gold ordering and producer quantiles add
        `O(g log g + p log p)` sorting time.

    """
    cards = {card.card.relation_id: card for card in analysis.cards}
    ordered_gold, gold_by_relation = _gold_index(gold, cards)
    panel_predictions: dict[RelationId, PredictedLabel] = {
        relation_id: _panel_label(card) for relation_id, card in cards.items()
    }
    panel_gold = _agreement(
        source="panel",
        gold=ordered_gold,
        predictions=panel_predictions,
        decision_threshold=None,
    )

    classifier: ClassifierPolicyEvaluation | None = None
    gate_source: PredictionSource = "panel"
    gate_threshold: float | None = None
    gate_predictions = panel_predictions
    if classifier_predictions is not None:
        prediction_rows = _classifier_index(analysis, classifier_predictions)
        classifier_labels = _classifier_labels(
            prediction_rows,
            threshold=config.calibrated_threshold,
        )
        classifier_gold = _agreement(
            source="classifier",
            gold=ordered_gold,
            predictions=classifier_labels,
            decision_threshold=config.calibrated_threshold,
        )
        classifier = ClassifierPolicyEvaluation(
            predictions=len(prediction_rows),
            decision_threshold=config.calibrated_threshold,
            gold=classifier_gold,
            calibration=_calibration(
                ordered_gold,
                prediction_rows,
                bins=config.calibration_bins,
            ),
            applicability=_applicability(analysis, prediction_rows),
        )
        gate_source = "classifier"
        gate_threshold = config.calibrated_threshold
        gate_predictions = classifier_labels

    return PolicyReport(
        rubric_version=rubric_version,
        report_config=config,
        eligible_cards=len(analysis.cards),
        gold_cards=len(ordered_gold),
        gold_post_exposure=sum(row.post_exposure for row in ordered_gold),
        panel_gold=panel_gold,
        classifier_state="evaluated" if classifier is not None else "not-provided",
        classifier=classifier,
        coincident_gate=_coincident_gate(
            source=gate_source,
            gold=ordered_gold,
            predictions=gate_predictions,
            decision_threshold=gate_threshold,
            config=config,
        ),
        judges=_judge_health(analysis, gold_by_relation),
        economics=_economics(analysis),
    )


def _rate_text(metric: RateMetric) -> str:
    if metric.value is None:
        return f"undefined ({metric.state}; n={metric.denominator})"
    return f"{metric.value:.6f} ({metric.numerator}/{metric.denominator})"


def _scalar_text(metric: ScalarMetric, *, suffix: str = "") -> str:
    if metric.value is None:
        return f"undefined ({metric.state}; n={metric.observations})"
    return f"{metric.value:.6f}{suffix} (n={metric.observations})"


def _text(value: str) -> str:
    encoded = json.dumps(value, ensure_ascii=True)[1:-1]
    return encoded.replace("|", "\\|")


def _agreement_lines(agreement: GoldAgreement) -> list[str]:
    threshold = (
        "none" if agreement.decision_threshold is None else f"{agreement.decision_threshold:.6f}"
    )
    lines = [
        f"## Gold agreement - {agreement.source}",
        "",
        f"- Decision threshold: {threshold}.",
        f"- Gold cards: {agreement.gold_cards}; independent: "
        f"{agreement.independent_gold_cards}; post-exposure excluded: "
        f"{agreement.post_exposure_excluded}.",
        f"- Independent unclear: {agreement.independent_unclear}.",
        f"- Placement agreement: {_rate_text(agreement.agreement)}.",
        f"- No-calls: {agreement.no_calls}.",
        "",
        "| class | gold support | predicted | correct | precision | recall |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {row.placement_class} | {row.gold_support} | {row.predicted} | "
        f"{row.correct} | {_rate_text(row.precision)} | {_rate_text(row.recall)} |"
        for row in agreement.per_class
    )
    lines.extend(
        [
            "",
            "| gold / predicted | coincident | proximal | overlay | no-call |",
            "| --- | ---: | ---: | ---: | ---: |",
        ]
    )
    lines.extend(
        f"| {row.gold} | {row.coincident} | {row.proximal} | {row.overlay} | {row.no_call} |"
        for row in agreement.confusion
    )
    lines.append("")
    return lines


def _gate_lines(gate: CoincidentGate) -> list[str]:
    bound = "undefined (no-predictions)" if gate.wilson_lcb is None else f"{gate.wilson_lcb:.6f}"
    verdict = (
        "UNPASSABLE BY SAMPLE SIZE"
        if gate.verdict == "insufficient-sample"
        else gate.verdict.upper()
    )
    return [
        "## Coincident release gate",
        "",
        f"- Source: {gate.source}.",
        f"- Coincident-predicted independent gold: {gate.stratum_size}; correct: "
        f"{gate.correct}; precision: {_rate_text(gate.precision)}.",
        f"- One-sided Wilson LCB at {gate.confidence_level:.6f}: {bound}; target: "
        f"{gate.precision_target:.6f}.",
        f"- Feedability: {gate.sample_size_state}; needs "
        f"{gate.minimum_zero_error_count} zero-error cards.",
        f"- Verdict: **{verdict}**.",
        "",
    ]


def _classifier_lines(classifier: ClassifierPolicyEvaluation) -> list[str]:
    lines = [
        "## Calibration - out-of-fold independent gold",
        "",
        "| bin | count | mean confidence | accuracy |",
        "| --- | ---: | ---: | ---: |",
    ]
    for row in classifier.calibration:
        closing = "]" if row.upper_inclusive else ")"
        lines.append(
            f"| [{row.lower:.2f}, {row.upper:.2f}{closing} | {row.count} | "
            f"{_scalar_text(row.mean_confidence)} | {_rate_text(row.accuracy)} |"
        )
    lines.extend(
        [
            "",
            "## Applicability by producer",
            "",
            "| producer | cards | q05 | q25 | q50 | q75 | q95 |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    lines.extend(
        f"| {_text(row.producer)} | {row.cards} | {row.q05:.6f} | {row.q25:.6f} | "
        f"{row.q50:.6f} | {row.q75:.6f} | {row.q95:.6f} |"
        for row in classifier.applicability
    )
    lines.append("")
    return lines


def _judge_lines(judges: Sequence[JudgeHealth]) -> list[str]:
    lines = [
        "## Judge health",
        "",
        "| judge | votes | abstention | initial schema compliance | repair rate | "
        "gold agreement | median latency | fresh known cost |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {_text(row.family_id)} | {row.votes} | {_rate_text(row.abstention_rate)} | "
        f"{_rate_text(row.initial_schema_compliance)} | "
        f"{_rate_text(row.parse_repair_rate)} | {_rate_text(row.gold_agreement)} | "
        f"{_scalar_text(row.median_latency_seconds, suffix='s')} | "
        f"${row.fresh_known_cost_usd:.6f} |"
        for row in judges
    )
    lines.append("")
    return lines


def _economics_lines(economics: PolicyVoteEconomics) -> list[str]:
    lines = [
        "## Vote economics",
        "",
        f"- Total votes: {economics.total_votes}.",
        f"- Fresh known cost: ${economics.total_known_cost_usd:.6f}.",
        f"- Refined cards: {economics.refined_cards}/{economics.pool_cards} "
        f"({economics.realized_trigger_rate:.6f}).",
        f"- Coincident review queue: {economics.review_queue_cards} cards.",
        "",
        "| family | imported | fresh baseline | refinement | abstentions | total | "
        "fresh known cost |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {_text(row.family_id)} | {row.imported_votes} | {row.fresh_baseline_votes} | "
        f"{row.refinement_votes} | {row.abstentions} | {row.total_votes} | "
        f"${row.known_cost_usd:.6f} |"
        for row in economics.by_family
    )
    lines.append("")
    return lines


def render_policy_report_markdown(report: PolicyReport) -> str:
    """Render a deterministic ASCII Markdown projection of the machine report.

    The projection is derived exclusively from validated report fields and
    always ends with one newline.
    """
    lines = [
        "# Relation policy evaluation report",
        "",
        f"- Rubric: {_text(report.rubric_version)}.",
        f"- Eligible cards: {report.eligible_cards}.",
        f"- Gold cards: {report.gold_cards}; post-exposure excluded: {report.gold_post_exposure}.",
        f"- Classifier: {report.classifier_state}.",
        "",
    ]
    lines.extend(_agreement_lines(report.panel_gold))
    if report.classifier is not None:
        lines.extend(_agreement_lines(report.classifier.gold))
    lines.extend(_gate_lines(report.coincident_gate))
    if report.classifier is not None:
        lines.extend(_classifier_lines(report.classifier))
    lines.extend(_judge_lines(report.judges))
    lines.extend(_economics_lines(report.economics))
    rendered = "\n".join(lines).rstrip() + "\n"
    rendered.encode("ascii")
    return rendered
