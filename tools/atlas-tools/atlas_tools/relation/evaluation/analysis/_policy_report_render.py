"""Render validated gold-backed policy reports as deterministic Markdown."""

import json
from collections.abc import Sequence

from atlas_tools.relation.evaluation.analysis.policy_report_model import (
    ClassifierPolicyEvaluation,
    CoincidentGate,
    GoldAgreement,
    JudgeHealth,
    PolicyReport,
    PolicyVoteEconomics,
    RateMetric,
    ScalarMetric,
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
    """Render a deterministic ASCII Markdown projection of the machine report."""
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
