"""Per-run ladder evaluation report: gold agreement, gates, health, economics.

The report is emitted twice from one payload: ``report.json`` (the machine
contract) and ``report.md`` (its deterministic rendering). The Coincident gate
follows the release rule: the one-sided Wilson lower confidence bound of
precision among coincident-predicted gold cards against the configured target,
with an explicit feedability line. A stratum too small to ever clear the bound
reports UNPASSABLE BY SAMPLE SIZE rather than a failure.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from os import PathLike
from pathlib import Path
from typing import Literal

from pydantic import Field, NonNegativeInt, PositiveInt, ValidationError

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_file
from atlas_tools.relation.eval.artifacts import ladder_paths
from atlas_tools.relation.eval.classifier import (
    ClassifierBundleMetadata,
    PredictionRow,
    load_bundle,
)
from atlas_tools.relation.eval.contract import LoadedRunConfig, ReportConfig
from atlas_tools.relation.eval.gates import (
    dirichlet_posterior_mean,
    minimum_feedable_count,
    wilson_lower_bound,
)
from atlas_tools.relation.eval.inputs import prepare_ladder_inputs
from atlas_tools.relation.eval.journal import load_jsonl
from atlas_tools.relation.eval.ladder import CardLadderOutcome, complete_card_outcomes
from atlas_tools.relation.eval.schema import (
    PLACEMENT_CLASSES,
    VERDICTS,
    GoldRow,
    JudgeFamilyId,
    LadderManifest,
    PlacementClass,
    Probability,
    RungEconomics,
    StrictModel,
    Verdict,
    VoteRow,
)
from atlas_tools.relation.eval.statistics import median
from atlas_tools.relation_cards.common.cards import RelationId

REPORT_SCHEMA_VERSION = 1

type GateVerdict = Literal["PASS", "FAIL", "UNPASSABLE BY SAMPLE SIZE"]
type GateSource = Literal["classifier", "panel"]
type PredictedLabel = PlacementClass | Literal["no-call"]
type PredictionsByRelation = Mapping[RelationId, PredictedLabel]


class ClassMetrics(StrictModel):
    verdict: Verdict
    gold_support: NonNegativeInt
    predicted: NonNegativeInt
    correct: NonNegativeInt
    precision: Probability | None
    recall: Probability | None


class GoldAgreement(StrictModel):
    """Agreement of one prediction source against the gold export.

    ``matched`` counts gold cards with a placement-class gold label that the
    source predicted on; unclear gold labels cannot match a {C, P, O}
    prediction and are counted separately.
    """

    source: GateSource
    gold_cards: NonNegativeInt
    gold_unclear: NonNegativeInt
    matched: NonNegativeInt
    agreement: Probability | None
    per_class: list[ClassMetrics]
    confusion: dict[Verdict, dict[PredictedLabel, int]]


class CoincidentGate(StrictModel):
    source: GateSource
    stratum_size: NonNegativeInt
    correct: NonNegativeInt
    wilson_lcb: Probability | None
    precision_target: Probability
    confidence_level: Probability
    minimum_zero_error_count: PositiveInt
    verdict: GateVerdict


class CalibrationBin(StrictModel):
    lower: Probability
    upper: Probability
    count: NonNegativeInt
    mean_confidence: Probability | None
    accuracy: Probability | None


type QuantileKey = Literal["q05", "q25", "q50", "q75", "q95"]

_QUANTILE_POINTS: dict[QuantileKey, float] = {
    "q05": 0.05,
    "q25": 0.25,
    "q50": 0.50,
    "q75": 0.75,
    "q95": 0.95,
}


class ApplicabilitySummary(StrictModel):
    producer: str = Field(min_length=1)
    cards: PositiveInt
    quantiles: dict[QuantileKey, float]


class JudgeHealth(StrictModel):
    family_id: JudgeFamilyId
    rung: PositiveInt
    votes: NonNegativeInt
    abstentions: NonNegativeInt
    schema_compliance: Probability | None
    parse_repair_rate: Probability | None
    gold_votes: NonNegativeInt
    gold_agreement: Probability | None
    median_latency_seconds: float | None
    known_cost_usd: float


class VoteEconomics(StrictModel):
    total_votes: NonNegativeInt
    total_known_cost_usd: float
    early_exit_cards: NonNegativeInt
    early_exit_rate: Probability | None
    review_queue_cards: NonNegativeInt
    by_rung: list[RungEconomics]
    cost_by_judge: dict[JudgeFamilyId, float]


class LadderReport(StrictModel):
    schema_version: Literal[1] = REPORT_SCHEMA_VERSION
    rubric_version: str
    eligible_cards: PositiveInt
    gold_cards: NonNegativeInt
    gold_post_exposure: NonNegativeInt
    panel_gold: GoldAgreement | None
    classifier_gold: GoldAgreement | None
    coincident_gate: CoincidentGate | None
    calibration: list[CalibrationBin] | None
    applicability: list[ApplicabilitySummary] | None
    judges: list[JudgeHealth]
    economics: VoteEconomics


class ReportDetails(StrictModel):
    schema_version: PositiveInt = REPORT_SCHEMA_VERSION


ReportProvenance = Provenance[ReportDetails]


@dataclass(frozen=True)
class ReportResult:
    report_json: Path
    report_md: Path
    report: LadderReport


def load_gold(path: Path) -> list[GoldRow]:
    rows: list[GoldRow] = []
    seen: set[RelationId] = set()
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as error:
        raise ValueError(f"cannot read gold export {path}: {error}") from error
    for line_number, line in enumerate(content.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = GoldRow.model_validate_json(line)
        except ValidationError as error:
            raise ValueError(f"invalid gold.jsonl line {line_number}: {error}") from error
        if row.relation_id in seen:
            raise ValueError(f"gold.jsonl repeats relation {row.relation_id}")
        seen.add(row.relation_id)
        rows.append(row)
    return rows


def panel_argmax(outcome: CardLadderOutcome) -> PlacementClass:
    """Return the posterior-mean argmax; ties break toward the earlier class."""
    posterior = dirichlet_posterior_mean(outcome.placement_counts)
    return max(
        PLACEMENT_CLASSES,
        key=lambda placement_class: (
            posterior[placement_class],
            -PLACEMENT_CLASSES.index(placement_class),
        ),
    )


def _gold_agreement(
    *,
    source: GateSource,
    gold: Sequence[GoldRow],
    predictions: PredictionsByRelation,
) -> GoldAgreement:
    confusion: dict[Verdict, dict[PredictedLabel, int]] = {}
    matched = 0
    agreements = 0
    gold_support: dict[Verdict, int] = dict.fromkeys(VERDICTS, 0)
    predicted_counts: dict[Verdict, int] = dict.fromkeys(VERDICTS, 0)
    correct_counts: dict[Verdict, int] = dict.fromkeys(VERDICTS, 0)
    unclear = 0
    for row in gold:
        if row.verdict == "unclear":
            unclear += 1
        predicted = predictions.get(row.relation_id)
        if predicted is None:
            continue
        by_predicted = confusion.setdefault(row.verdict, {})
        by_predicted[predicted] = by_predicted.get(predicted, 0) + 1
        gold_support[row.verdict] += 1
        if predicted != "no-call":
            predicted_counts[predicted] += 1
        if row.verdict != "unclear":
            matched += 1
            if predicted == row.verdict:
                agreements += 1
                correct_counts[row.verdict] += 1
    metrics = [
        ClassMetrics(
            verdict=verdict,
            gold_support=gold_support[verdict],
            predicted=predicted_counts[verdict],
            correct=correct_counts[verdict],
            precision=(
                correct_counts[verdict] / predicted_counts[verdict]
                if predicted_counts[verdict]
                else None
            ),
            recall=(
                correct_counts[verdict] / gold_support[verdict] if gold_support[verdict] else None
            ),
        )
        for verdict in VERDICTS
    ]
    return GoldAgreement(
        source=source,
        gold_cards=len(gold),
        gold_unclear=unclear,
        matched=matched,
        agreement=(agreements / matched) if matched else None,
        per_class=metrics,
        confusion={
            verdict: dict(sorted(by_predicted.items()))
            for verdict, by_predicted in sorted(confusion.items())
        },
    )


def _coincident_gate(
    *,
    source: GateSource,
    gold: Sequence[GoldRow],
    predictions: PredictionsByRelation,
    report_config: ReportConfig,
) -> CoincidentGate:
    stratum = [
        row
        for row in gold
        if predictions.get(row.relation_id) == "coincident" and row.verdict != "unclear"
    ]
    correct = sum(row.verdict == "coincident" for row in stratum)
    minimum = minimum_feedable_count(
        report_config.coincident_precision_target,
        confidence=report_config.confidence_level,
    )
    lcb = (
        wilson_lower_bound(
            correct,
            len(stratum),
            confidence=report_config.confidence_level,
        )
        if stratum
        else None
    )
    if len(stratum) < minimum:
        verdict: GateVerdict = "UNPASSABLE BY SAMPLE SIZE"
    elif lcb is not None and lcb >= report_config.coincident_precision_target:
        verdict = "PASS"
    else:
        verdict = "FAIL"
    return CoincidentGate(
        source=source,
        stratum_size=len(stratum),
        correct=correct,
        wilson_lcb=lcb,
        precision_target=report_config.coincident_precision_target,
        confidence_level=report_config.confidence_level,
        minimum_zero_error_count=minimum,
        verdict=verdict,
    )


def _calibration_bins(
    *,
    gold_by_relation: Mapping[RelationId, GoldRow],
    predictions: Sequence[PredictionRow],
    bins: int,
) -> list[CalibrationBin]:
    observations: list[tuple[float, bool]] = []
    for row in predictions:
        gold = gold_by_relation.get(row.relation_id)
        if gold is None or gold.verdict == "unclear":
            continue
        predicted, confidence = row.calibrated_argmax()
        observations.append((confidence, predicted == gold.verdict))
    results: list[CalibrationBin] = []
    for index in range(bins):
        lower = index / bins
        upper = (index + 1) / bins
        members = [
            (confidence, correct)
            for confidence, correct in observations
            if lower <= confidence < upper or (index == bins - 1 and confidence == 1.0)
        ]
        results.append(
            CalibrationBin(
                lower=lower,
                upper=upper,
                count=len(members),
                mean_confidence=(
                    sum(confidence for confidence, _ in members) / len(members) if members else None
                ),
                accuracy=(
                    sum(correct for _, correct in members) / len(members) if members else None
                ),
            )
        )
    return results


def _applicability_by_producer(
    predictions: Sequence[PredictionRow],
) -> list[ApplicabilitySummary]:
    by_producer: dict[str, list[float]] = {}
    for row in predictions:
        by_producer.setdefault(row.producer, []).append(row.applicability)
    summaries = []
    for producer in sorted(by_producer):
        scores = sorted(by_producer[producer])
        quantiles = {
            key: scores[int(point * (len(scores) - 1))] for key, point in _QUANTILE_POINTS.items()
        }
        summaries.append(
            ApplicabilitySummary(producer=producer, cards=len(scores), quantiles=quantiles)
        )
    return summaries


def judge_health(
    *,
    votes: Sequence[VoteRow],
    judge_rungs: Mapping[JudgeFamilyId, int],
    gold_by_relation: Mapping[RelationId, GoldRow],
) -> list[JudgeHealth]:
    rows: list[JudgeHealth] = []
    for family_id in sorted(judge_rungs):
        family_votes = [vote for vote in votes if vote.family_id == family_id]
        abstentions = sum(vote.abstained for vote in family_votes)
        repairs = sum(vote.parse_retries for vote in family_votes)
        gold_votes = 0
        gold_agreements = 0
        for vote in family_votes:
            gold = gold_by_relation.get(vote.relation_id)
            if gold is None or gold.verdict == "unclear" or vote.abstained:
                continue
            gold_votes += 1
            gold_agreements += vote.verdict == gold.verdict
        latencies = [vote.latency.total_seconds() for vote in family_votes]
        rows.append(
            JudgeHealth(
                family_id=family_id,
                rung=judge_rungs[family_id],
                votes=len(family_votes),
                abstentions=abstentions,
                schema_compliance=(1.0 - abstentions / len(family_votes) if family_votes else None),
                parse_repair_rate=(repairs / len(family_votes)) if family_votes else None,
                gold_votes=gold_votes,
                gold_agreement=(gold_agreements / gold_votes) if gold_votes else None,
                median_latency_seconds=median(latencies),
                known_cost_usd=sum(vote.known_cost_usd for vote in family_votes),
            )
        )
    return rows


def _economics(
    *,
    manifest: LadderManifest,
    votes: Sequence[VoteRow],
) -> VoteEconomics:
    cost_by_judge: dict[JudgeFamilyId, float] = {}
    for vote in votes:
        cost_by_judge[vote.family_id] = cost_by_judge.get(vote.family_id, 0.0) + (
            vote.known_cost_usd
        )
    return VoteEconomics(
        total_votes=manifest.total_votes,
        total_known_cost_usd=sum(vote.known_cost_usd for vote in votes),
        early_exit_cards=manifest.early_exit_cards,
        early_exit_rate=(
            manifest.early_exit_cards / manifest.eligible_cards if manifest.eligible_cards else None
        ),
        review_queue_cards=manifest.review_queue_cards,
        by_rung=manifest.rung_economics,
        cost_by_judge=dict(sorted(cost_by_judge.items())),
    )


def _classifier_predictions(
    predictions: Sequence[PredictionRow],
    *,
    threshold: float | None,
) -> dict[RelationId, PredictedLabel]:
    labeled: dict[RelationId, PredictedLabel] = {}
    for row in predictions:
        predicted, confidence = row.calibrated_argmax()
        if threshold is not None and confidence < threshold:
            labeled[row.relation_id] = "no-call"
        else:
            labeled[row.relation_id] = predicted
    return labeled


def build_report(
    *,
    run_dir: PathLike,
    cards_dir: PathLike,
    loaded_config: LoadedRunConfig,
    gold_path: PathLike,
    classifier_dir: PathLike | None = None,
) -> LadderReport:
    """Assemble the machine report from a completed run, gold, and optional bundle."""
    config = loaded_config.ladder()
    run_directory = Path(run_dir)
    paths = ladder_paths(run_directory)
    if not paths.manifest_json.is_file():
        raise ValueError(f"{run_directory} is not a completed ladder run")
    manifest = LadderManifest.model_validate_json(paths.manifest_json.read_bytes())
    prepared = prepare_ladder_inputs(cards_dir, loaded_config)
    if manifest.source_hashes["cards.jsonl"] != prepared.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl differs from the corpus the ladder voted on")
    votes = load_jsonl(paths.votes_jsonl, VoteRow)
    outcomes = complete_card_outcomes(
        config,
        prepared=prepared,
        votes_by_id={vote.vote_id: vote for vote in votes},
    )
    gold = load_gold(Path(gold_path))
    gold_by_relation = {row.relation_id: row for row in gold}
    known_relations = {card.relation_id for card in prepared.eligible}
    unknown_gold = sorted(set(gold_by_relation) - known_relations)
    if unknown_gold:
        raise ValueError(f"gold.jsonl labels relations outside the corpus: {unknown_gold[:5]}")

    panel_predictions: dict[RelationId, PredictedLabel] = {
        outcome.card.relation_id: panel_argmax(outcome) for outcome in outcomes
    }
    panel_gold = (
        _gold_agreement(source="panel", gold=gold, predictions=panel_predictions) if gold else None
    )

    classifier_gold = None
    calibration = None
    applicability = None
    gate_source: GateSource = "panel"
    gate_predictions: PredictionsByRelation = panel_predictions
    if classifier_dir is not None:
        metadata, predictions = load_bundle(Path(classifier_dir))
        _validate_bundle(metadata, loaded_config)
        argmax_predictions = _classifier_predictions(predictions, threshold=None)
        classifier_gold = (
            _gold_agreement(source="classifier", gold=gold, predictions=argmax_predictions)
            if gold
            else None
        )
        calibration = _calibration_bins(
            gold_by_relation=gold_by_relation,
            predictions=predictions,
            bins=config.report.calibration_bins,
        )
        applicability = _applicability_by_producer(predictions)
        gate_source = "classifier"
        gate_predictions = argmax_predictions

    gate = (
        _coincident_gate(
            source=gate_source,
            gold=gold,
            predictions=gate_predictions,
            report_config=config.report,
        )
        if gold
        else None
    )
    return LadderReport(
        rubric_version=config.rubric_version,
        eligible_cards=len(prepared.eligible),
        gold_cards=len(gold),
        gold_post_exposure=sum(row.post_exposure for row in gold),
        panel_gold=panel_gold,
        classifier_gold=classifier_gold,
        coincident_gate=gate,
        calibration=calibration,
        applicability=applicability,
        judges=judge_health(
            votes=votes,
            judge_rungs=manifest.judge_rungs,
            gold_by_relation=gold_by_relation,
        ),
        economics=_economics(manifest=manifest, votes=votes),
    )


def _validate_bundle(metadata: ClassifierBundleMetadata, loaded_config: LoadedRunConfig) -> None:
    config = loaded_config.ladder()
    if metadata.rubric_version != config.rubric_version:
        raise ValueError("classifier bundle was fitted under a different rubric version")
    if metadata.judges_config_hash != loaded_config.content_hash:
        raise ValueError("classifier bundle was fitted under a different judges config")


def _rate(value: float | None, *, digits: int = 4) -> str:
    return "undefined" if value is None else f"{value:.{digits}f}"


def _agreement_lines(agreement: GoldAgreement) -> list[str]:
    lines = [
        f"## Gold agreement — {agreement.source}",
        "",
        f"- Gold cards: {agreement.gold_cards} ({agreement.gold_unclear} unclear, "
        "excluded from overall agreement).",
        f"- Matched placement cards: {agreement.matched}.",
        f"- Overall agreement: {_rate(agreement.agreement)}.",
        "",
        "| class | gold support | predicted | correct | precision | recall |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {metrics.verdict} | {metrics.gold_support} | {metrics.predicted} "
        f"| {metrics.correct} | {_rate(metrics.precision)} | {_rate(metrics.recall)} |"
        for metrics in agreement.per_class
    )
    lines.append("")
    lines.append("Confusion (gold rows, predicted columns):")
    lines.append("")
    predicted_labels = sorted({label for row in agreement.confusion.values() for label in row})
    header = " | ".join(predicted_labels)
    lines.append(f"| gold \\ predicted | {header} |")
    lines.append("| --- |" + " ---: |" * len(predicted_labels))
    for gold_label, row in agreement.confusion.items():
        cells = " | ".join(str(row.get(label, 0)) for label in predicted_labels)
        lines.append(f"| {gold_label} | {cells} |")
    lines.append("")
    return lines


def _gate_lines(gate: CoincidentGate) -> list[str]:
    feedable = gate.stratum_size >= gate.minimum_zero_error_count
    return [
        "## Coincident gate",
        "",
        f"- Source: {gate.source}.",
        f"- C-predicted gold stratum: {gate.stratum_size} cards, {gate.correct} correct.",
        f"- Wilson LCB{gate.confidence_level:.0%}: {_rate(gate.wilson_lcb)} "
        f"vs target {gate.precision_target}.",
        f"- Feedability: the bound needs at least {gate.minimum_zero_error_count} "
        f"zero-error cards; the stratum has {gate.stratum_size} "
        f"({'sufficient' if feedable else 'insufficient'}).",
        f"- Verdict: **{gate.verdict}**.",
        "",
    ]


def _calibration_lines(bins: Sequence[CalibrationBin]) -> list[str]:
    lines = [
        "## Calibration (out-of-fold, gold placement cards)",
        "",
        "| bin | count | mean confidence | accuracy |",
        "| --- | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| [{calibration_bin.lower:.2f}, {calibration_bin.upper:.2f}) "
        f"| {calibration_bin.count} | {_rate(calibration_bin.mean_confidence)} "
        f"| {_rate(calibration_bin.accuracy)} |"
        for calibration_bin in bins
    )
    lines.append("")
    return lines


def _applicability_lines(summaries: Sequence[ApplicabilitySummary]) -> list[str]:
    lines = [
        "## Applicability by source",
        "",
        "| producer | cards | q05 | q25 | q50 | q75 | q95 |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {summary.producer} | {summary.cards} | "
        + " | ".join(f"{summary.quantiles[key]:.4f}" for key in _QUANTILE_POINTS)
        + " |"
        for summary in summaries
    )
    lines.append("")
    return lines


def _judge_lines(judges: Sequence[JudgeHealth]) -> list[str]:
    lines = [
        "## Judge health and gold agreement",
        "",
        "| judge | rung | votes | schema compliance | repair rate | gold votes "
        "| gold agreement | median latency (s) | known cost (USD) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {judge.family_id} | {judge.rung} | {judge.votes} "
        f"| {_rate(judge.schema_compliance)} | {_rate(judge.parse_repair_rate)} "
        f"| {judge.gold_votes} | {_rate(judge.gold_agreement)} "
        f"| {_rate(judge.median_latency_seconds)} | {judge.known_cost_usd:.6f} |"
        for judge in judges
    )
    lines.append("")
    return lines


def _economics_lines(economics: VoteEconomics) -> list[str]:
    lines = [
        "## Vote economics",
        "",
        f"- Total votes: {economics.total_votes} "
        f"(known cost ${economics.total_known_cost_usd:.6f}).",
        f"- Early-exit cards: {economics.early_exit_cards} "
        f"(rate {_rate(economics.early_exit_rate)}).",
        f"- Review-queue cards: {economics.review_queue_cards}.",
        "",
        "| rung | cards | votes | abstentions | early exits | known cost (USD) |",
        "| ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    lines.extend(
        f"| {rung.rung} | {rung.cards} | {rung.votes} | {rung.abstentions} "
        f"| {rung.early_exits} | {rung.known_cost_usd:.6f} |"
        for rung in economics.by_rung
    )
    lines.append("")
    lines.append("Cost by judge:")
    lines.append("")
    lines.extend(
        f"- {family_id}: ${cost:.6f}" for family_id, cost in economics.cost_by_judge.items()
    )
    lines.append("")
    return lines


def render_report_markdown(report: LadderReport) -> str:
    lines = [
        "# Relation ladder evaluation report",
        "",
        f"- Rubric: {report.rubric_version}.",
        f"- Eligible cards: {report.eligible_cards}.",
        f"- Gold cards: {report.gold_cards} ({report.gold_post_exposure} flagged post-exposure).",
        "",
    ]
    for agreement in (report.panel_gold, report.classifier_gold):
        if agreement is not None:
            lines.extend(_agreement_lines(agreement))
    if report.coincident_gate is not None:
        lines.extend(_gate_lines(report.coincident_gate))
    if report.calibration is not None:
        lines.extend(_calibration_lines(report.calibration))
    if report.applicability is not None:
        lines.extend(_applicability_lines(report.applicability))
    lines.extend(_judge_lines(report.judges))
    lines.extend(_economics_lines(report.economics))
    return "\n".join(lines).rstrip() + "\n"


def write_report(
    *,
    run_dir: PathLike,
    cards_dir: PathLike,
    loaded_config: LoadedRunConfig,
    gold_path: PathLike,
    classifier_dir: PathLike | None = None,
    out_dir: PathLike,
) -> ReportResult:
    """Build and persist the machine report and its markdown rendering."""
    report = build_report(
        run_dir=run_dir,
        cards_dir=cards_dir,
        loaded_config=loaded_config,
        gold_path=gold_path,
        classifier_dir=classifier_dir,
    )
    output = Path(out_dir)
    output.mkdir(parents=True, exist_ok=True)
    report_json = output / "report.json"
    report_md = output / "report.md"
    report_json.write_bytes(canonical_json_bytes(report.model_dump(mode="json")) + b"\n")
    report_md.write_text(render_report_markdown(report), encoding="utf-8")
    ReportProvenance.make(
        producer="relation.ladder-report",
        input_hashes={"gold.jsonl": sha256_file(Path(gold_path))},
        content_hashes={
            "report.json": sha256_file(report_json),
            "report.md": sha256_file(report_md),
        },
        details=ReportDetails(),
    ).write(output / "report.meta.json")
    return ReportResult(report_json=report_json, report_md=report_md, report=report)
