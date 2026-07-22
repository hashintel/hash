"""Represent and render policy-report evidence when gold is optional."""

import json
import math
from typing import Literal, Self

from pydantic import NonNegativeInt, PositiveInt, model_validator

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.analysis.policy_report import (
    ApplicabilitySummary,
    PolicyReport,
    PolicyVoteEconomics,
    RateMetric,
    ScalarMetric,
    render_policy_report_markdown,
)
from atlas_tools.relation.evaluation.domain.api import (
    JudgeFamilyId,
    NonEmptyStr,
    NonNegativeFiniteFloat,
    Probability,
    ReportConfig,
)


class ClassifierWithoutGold(AnalysisModel):
    """Classifier evidence that does not claim gold-based evaluation."""

    predictions: PositiveInt
    decision_threshold: Probability
    prediction_algorithm: Literal["calibrated-argmax-threshold-v1"] = (
        "calibrated-argmax-threshold-v1"
    )
    gold: None = None
    calibration: None = None
    applicability: tuple[ApplicabilitySummary, ...]

    @model_validator(mode="after")
    def check_applicability(self) -> Self:
        producers = tuple(row.producer for row in self.applicability)
        if producers != tuple(sorted(producers)) or len(producers) != len(set(producers)):
            raise ValueError("classifier applicability producers must be unique and sorted")
        if sum(row.cards for row in self.applicability) != self.predictions:
            raise ValueError("classifier applicability does not cover predictions")
        return self


class JudgeHealthWithoutGold(AnalysisModel):
    """Operational judge health with gold-dependent fields unavailable."""

    family_id: JudgeFamilyId
    votes: PositiveInt
    abstentions: NonNegativeInt
    abstention_rate: RateMetric
    initial_schema_compliance: RateMetric
    parse_repair_rate: RateMetric
    gold_votes: None = None
    gold_agreement: None = None
    median_latency_seconds: ScalarMetric
    fresh_known_cost_usd: NonNegativeFiniteFloat

    @model_validator(mode="after")
    def check_counts(self) -> Self:
        if self.abstentions > self.votes:
            raise ValueError("judge abstentions exceed votes")
        if (
            self.abstention_rate.numerator != self.abstentions
            or self.abstention_rate.denominator != self.votes
        ):
            raise ValueError("judge abstention rate does not match counts")
        repairs = self.parse_repair_rate.numerator
        if (
            self.parse_repair_rate.denominator != self.votes
            or self.initial_schema_compliance.numerator != self.votes - repairs
            or self.initial_schema_compliance.denominator != self.votes
        ):
            raise ValueError("judge schema and repair rates do not partition votes")
        if self.median_latency_seconds.observations != self.votes:
            raise ValueError("judge latency sample count differs from votes")
        return self


class PolicyReportWithoutGold(AnalysisModel):
    """Machine report retaining only evidence available without gold labels."""

    schema_version: Literal[2] = 2
    rubric_version: NonEmptyStr
    report_config: ReportConfig
    eligible_cards: PositiveInt
    gold_state: Literal["not-provided"] = "not-provided"
    gold_cards: None = None
    gold_post_exposure: None = None
    panel_gold: None = None
    classifier_state: Literal["not-provided", "evaluated"]
    classifier: ClassifierWithoutGold | None
    coincident_gate: None = None
    judges: tuple[JudgeHealthWithoutGold, ...]
    economics: PolicyVoteEconomics

    def _check_classifier(self) -> None:
        has_classifier = self.classifier is not None
        if has_classifier != (self.classifier_state == "evaluated"):
            raise ValueError("classifier state does not match classifier evidence")
        if self.classifier is None:
            return
        if self.classifier.predictions != self.eligible_cards:
            raise ValueError("classifier predictions do not cover eligible cards")
        if self.classifier.decision_threshold != self.report_config.calibrated_threshold:
            raise ValueError("classifier threshold differs from report config")

    def _check_families(self) -> None:
        family_ids = tuple(row.family_id for row in self.judges)
        if family_ids != tuple(sorted(family_ids)) or len(family_ids) != len(set(family_ids)):
            raise ValueError("report judges must be unique and sorted")
        if family_ids != tuple(row.family_id for row in self.economics.by_family):
            raise ValueError("report judge and economics families differ")
        for judge, economics in zip(self.judges, self.economics.by_family, strict=True):
            if judge.votes != economics.total_votes:
                raise ValueError("judge and economics vote counts differ")
            if judge.abstentions != economics.abstentions:
                raise ValueError("judge and economics abstention counts differ")
            if not math.isclose(
                judge.fresh_known_cost_usd,
                economics.known_cost_usd,
                rel_tol=0.0,
                abs_tol=1e-12,
            ):
                raise ValueError("judge and economics fresh costs differ")

    @model_validator(mode="after")
    def check_sections(self) -> Self:
        if self.eligible_cards != self.economics.pool_cards:
            raise ValueError("report eligible cards differ from economics")
        self._check_classifier()
        self._check_families()
        return self


type PublishedPolicyReport = PolicyReport | PolicyReportWithoutGold


def without_gold_measurements(report: PolicyReport) -> PolicyReportWithoutGold:
    """Project a zero-gold analysis into an explicit unavailable-gold report."""
    if report.gold_cards != 0 or report.gold_post_exposure != 0:
        raise ValueError("cannot remove measurements from a report containing gold rows")
    classifier = (
        None
        if report.classifier is None
        else ClassifierWithoutGold(
            predictions=report.classifier.predictions,
            decision_threshold=report.classifier.decision_threshold,
            prediction_algorithm=report.classifier.prediction_algorithm,
            applicability=report.classifier.applicability,
        )
    )
    judges = tuple(
        JudgeHealthWithoutGold(
            family_id=row.family_id,
            votes=row.votes,
            abstentions=row.abstentions,
            abstention_rate=row.abstention_rate,
            initial_schema_compliance=row.initial_schema_compliance,
            parse_repair_rate=row.parse_repair_rate,
            median_latency_seconds=row.median_latency_seconds,
            fresh_known_cost_usd=row.fresh_known_cost_usd,
        )
        for row in report.judges
    )
    return PolicyReportWithoutGold(
        rubric_version=report.rubric_version,
        report_config=report.report_config,
        eligible_cards=report.eligible_cards,
        classifier_state=report.classifier_state,
        classifier=classifier,
        judges=judges,
        economics=report.economics,
    )


def policy_report_bytes(report: PublishedPolicyReport) -> bytes:
    """Serialize either published report schema as canonical ASCII JSONL."""
    payload = json.dumps(
        report.model_dump(mode="json"),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")
    return payload + b"\n"


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


def _without_gold_markdown(report: PolicyReportWithoutGold) -> str:
    lines = [
        "# Relation policy evaluation report",
        "",
        f"- Rubric: {_text(report.rubric_version)}.",
        f"- Eligible cards: {report.eligible_cards}.",
        "- Gold: not provided.",
        f"- Classifier: {report.classifier_state}.",
        "",
        "## Gold-dependent evaluation",
        "",
        "Gold agreement, calibration, judge gold agreement, and the coincident release gate "
        "are unavailable because no gold input was provided.",
        "",
    ]
    if report.classifier is not None:
        lines.extend(
            [
                "## Classifier applicability",
                "",
                f"- Predictions: {report.classifier.predictions}.",
                f"- Decision threshold: {report.classifier.decision_threshold:.6f}.",
                "",
                "| producer | cards | q05 | q25 | q50 | q75 | q95 |",
                "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
            ]
        )
        lines.extend(
            f"| {_text(row.producer)} | {row.cards} | {row.q05:.6f} | {row.q25:.6f} | "
            f"{row.q50:.6f} | {row.q75:.6f} | {row.q95:.6f} |"
            for row in report.classifier.applicability
        )
        lines.append("")
    lines.extend(
        [
            "## Judge health",
            "",
            "| judge | votes | abstention | initial schema compliance | repair rate | "
            "median latency | fresh known cost |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    lines.extend(
        f"| {_text(row.family_id)} | {row.votes} | {_rate_text(row.abstention_rate)} | "
        f"{_rate_text(row.initial_schema_compliance)} | {_rate_text(row.parse_repair_rate)} | "
        f"{_scalar_text(row.median_latency_seconds, suffix='s')} | "
        f"${row.fresh_known_cost_usd:.6f} |"
        for row in report.judges
    )
    economics = report.economics
    lines.extend(
        [
            "",
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
    )
    lines.extend(
        f"| {_text(row.family_id)} | {row.imported_votes} | {row.fresh_baseline_votes} | "
        f"{row.refinement_votes} | {row.abstentions} | {row.total_votes} | "
        f"${row.known_cost_usd:.6f} |"
        for row in economics.by_family
    )
    rendered = "\n".join(lines).rstrip() + "\n"
    rendered.encode("ascii")
    return rendered


def render_published_policy_report_markdown(report: PublishedPolicyReport) -> str:
    """Render the matching deterministic Markdown schema for a report."""
    if isinstance(report, PolicyReport):
        return render_policy_report_markdown(report)
    return _without_gold_markdown(report)
