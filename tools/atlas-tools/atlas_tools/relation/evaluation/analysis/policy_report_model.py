"""Define strict immutable contracts for policy-report evidence and decisions."""

import math
from typing import Literal, Self

from pydantic import Field, NonNegativeInt, PositiveInt, model_validator

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.analysis._policy_math import (
    minimum_feedable_count,
    wilson_lower_bound,
)
from atlas_tools.relation.evaluation.domain.api import (
    PLACEMENT_CLASSES,
    VERDICTS,
    JudgeFamilyId,
    NonNegativeFiniteFloat,
    PlacementClass,
    Probability,
    RelationId,
    ReportConfig,
    Verdict,
)

type PredictedLabel = PlacementClass | Literal["no-call"]
type PredictionSource = Literal["panel", "classifier"]
type RateState = Literal[
    "defined",
    "no-observations",
    "no-predictions",
    "no-gold-support",
    "empty-bin",
]
type ScalarState = Literal["defined", "no-observations", "empty-bin"]
type GateVerdict = Literal["pass", "fail", "insufficient-sample"]
type SampleSizeState = Literal["sufficient", "insufficient"]
type WilsonState = Literal["defined", "no-predictions"]

class GoldLabel(AnalysisModel):
    """An independently adjudicated relation label."""

    relation_id: RelationId
    verdict: Verdict
    pass_count: PositiveInt
    entropy: Probability
    post_exposure: bool = False


class RateMetric(AnalysisModel):
    """A proportion or an explicit reason it is undefined."""

    state: RateState
    numerator: NonNegativeInt
    denominator: NonNegativeInt
    value: Probability | None

    @model_validator(mode="after")
    def check_evidence(self) -> Self:
        if self.numerator > self.denominator:
            raise ValueError("rate numerator cannot exceed its denominator")
        if self.denominator == 0:
            if self.numerator != 0 or self.value is not None or self.state == "defined":
                raise ValueError("an undefined rate must carry zero evidence and no value")
            return self
        if self.state != "defined" or self.value is None:
            raise ValueError("a non-empty rate must be defined")
        expected = self.numerator / self.denominator
        if not math.isclose(self.value, expected, rel_tol=0.0, abs_tol=1e-15):
            raise ValueError("rate value does not match its evidence")
        return self


class ScalarMetric(AnalysisModel):
    """A non-negative scalar with its sample-size state."""

    state: ScalarState
    observations: NonNegativeInt
    value: NonNegativeFiniteFloat | None

    @model_validator(mode="after")
    def check_evidence(self) -> Self:
        if self.observations == 0:
            if self.value is not None or self.state == "defined":
                raise ValueError("an empty scalar metric must be undefined")
            return self
        if self.state != "defined" or self.value is None:
            raise ValueError("a non-empty scalar metric must be defined")
        return self


class PlacementClassMetrics(AnalysisModel):
    """Exact support, prediction, precision, and recall for one class."""

    placement_class: PlacementClass
    gold_support: NonNegativeInt
    predicted: NonNegativeInt
    correct: NonNegativeInt
    precision: RateMetric
    recall: RateMetric

    @model_validator(mode="after")
    def check_rates(self) -> Self:
        if self.correct > self.gold_support or self.correct > self.predicted:
            raise ValueError("class correct count exceeds support or predictions")
        if self.precision.numerator != self.correct or self.precision.denominator != self.predicted:
            raise ValueError("class precision evidence does not match its counts")
        if self.recall.numerator != self.correct or self.recall.denominator != self.gold_support:
            raise ValueError("class recall evidence does not match its counts")
        expected_precision = "no-predictions" if self.predicted == 0 else "defined"
        expected_recall = "no-gold-support" if self.gold_support == 0 else "defined"
        if self.precision.state != expected_precision or self.recall.state != expected_recall:
            raise ValueError("class metric undefined states do not match their evidence")
        return self


class ConfusionRow(AnalysisModel):
    """Counts for one gold verdict across the complete prediction vocabulary."""

    gold: Verdict
    coincident: NonNegativeInt
    proximal: NonNegativeInt
    overlay: NonNegativeInt
    no_call: NonNegativeInt

    @property
    def total(self) -> int:
        """Return the number of independent gold rows in this confusion row."""
        return self.coincident + self.proximal + self.overlay + self.no_call


class GoldAgreement(AnalysisModel):
    """A comparison of one prediction source with independent gold labels."""

    source: PredictionSource
    decision_threshold: Probability | None
    gold_cards: NonNegativeInt
    post_exposure_excluded: NonNegativeInt
    independent_gold_cards: NonNegativeInt
    independent_unclear: NonNegativeInt
    placement_gold_cards: NonNegativeInt
    no_calls: NonNegativeInt
    agreement: RateMetric
    per_class: tuple[PlacementClassMetrics, PlacementClassMetrics, PlacementClassMetrics]
    confusion: tuple[ConfusionRow, ConfusionRow, ConfusionRow, ConfusionRow]

    def _check_cohort(self) -> None:
        if self.source == "panel" and self.decision_threshold is not None:
            raise ValueError("panel agreement cannot carry a classifier threshold")
        if self.source == "classifier" and self.decision_threshold is None:
            raise ValueError("classifier agreement requires its decision threshold")
        if self.post_exposure_excluded + self.independent_gold_cards != self.gold_cards:
            raise ValueError("gold exposure counts do not sum to all gold cards")
        if self.independent_unclear + self.placement_gold_cards != self.independent_gold_cards:
            raise ValueError("independent gold classes do not sum to their cohort")
        if self.source == "panel" and self.no_calls != 0:
            raise ValueError("panel predictions cannot contain no-calls")

    def _check_confusion(self) -> None:
        if tuple(row.placement_class for row in self.per_class) != PLACEMENT_CLASSES:
            raise ValueError("per-class metrics must use canonical placement order")
        if tuple(row.gold for row in self.confusion) != VERDICTS:
            raise ValueError("confusion rows must use canonical verdict order")
        if sum(row.total for row in self.confusion) != self.independent_gold_cards:
            raise ValueError("confusion rows do not cover independent gold")
        if self.independent_unclear != self.confusion[-1].total:
            raise ValueError("unclear gold count does not match confusion")
        if self.placement_gold_cards != sum(row.total for row in self.confusion[:-1]):
            raise ValueError("placement gold count does not match confusion")
        expected_no_calls = sum(row.no_call for row in self.confusion)
        if self.no_calls != expected_no_calls:
            raise ValueError("no-call count does not match the confusion matrix")

    def _check_agreement(self) -> None:
        correct = sum(
            getattr(self.confusion[index], placement_class)
            for index, placement_class in enumerate(PLACEMENT_CLASSES)
        )
        if (
            self.agreement.numerator != correct
            or self.agreement.denominator != self.placement_gold_cards
        ):
            raise ValueError("overall agreement evidence does not match confusion")
        expected_state = "no-observations" if self.placement_gold_cards == 0 else "defined"
        if self.agreement.state != expected_state:
            raise ValueError("agreement undefined state does not match gold support")

    def _check_class_metrics(self) -> None:
        for index, metrics in enumerate(self.per_class):
            confusion_row = self.confusion[index]
            predicted = sum(getattr(row, metrics.placement_class) for row in self.confusion)
            if (
                metrics.gold_support != confusion_row.total
                or metrics.predicted != predicted
                or metrics.correct != getattr(confusion_row, metrics.placement_class)
            ):
                raise ValueError("per-class metrics do not match confusion")

    @model_validator(mode="after")
    def check_accounting(self) -> Self:
        self._check_cohort()
        self._check_confusion()
        self._check_agreement()
        self._check_class_metrics()
        return self


class CoincidentGate(AnalysisModel):
    """The Coincident release rule and its feedability evidence."""

    source: PredictionSource
    decision_threshold: Probability | None
    stratum_size: NonNegativeInt
    correct: NonNegativeInt
    precision: RateMetric
    wilson_state: WilsonState
    wilson_lcb: Probability | None
    precision_target: Probability
    confidence_level: Probability
    minimum_zero_error_count: PositiveInt
    sample_size_state: SampleSizeState
    verdict: GateVerdict

    def _check_source(self) -> None:
        if self.source == "panel" and self.decision_threshold is not None:
            raise ValueError("panel gate cannot carry a classifier threshold")
        if self.source == "classifier" and self.decision_threshold is None:
            raise ValueError("classifier gate requires its decision threshold")

    def _check_counts(self) -> None:
        if self.correct > self.stratum_size:
            raise ValueError("gate correct count exceeds its stratum")
        if (
            self.precision.numerator != self.correct
            or self.precision.denominator != self.stratum_size
        ):
            raise ValueError("gate precision does not match its counts")
        expected_precision_state = "no-predictions" if self.stratum_size == 0 else "defined"
        if self.precision.state != expected_precision_state:
            raise ValueError("gate precision state does not match its stratum")

    def _check_statistical_policy(self) -> None:
        expected_minimum = minimum_feedable_count(
            self.precision_target,
            confidence=self.confidence_level,
        )
        if self.minimum_zero_error_count != expected_minimum:
            raise ValueError("gate minimum sample does not match its statistical policy")
        if self.stratum_size == 0:
            if self.wilson_state != "no-predictions" or self.wilson_lcb is not None:
                raise ValueError("an empty gate stratum cannot have a Wilson bound")
        else:
            if self.wilson_state != "defined" or self.wilson_lcb is None:
                raise ValueError("a non-empty gate stratum requires a Wilson bound")
            expected_bound = wilson_lower_bound(
                self.correct,
                self.stratum_size,
                confidence=self.confidence_level,
            )
            if not math.isclose(
                self.wilson_lcb,
                expected_bound,
                rel_tol=0.0,
                abs_tol=1e-15,
            ):
                raise ValueError("gate Wilson bound does not match its evidence")

    def _check_verdict(self) -> None:
        sufficient = self.stratum_size >= self.minimum_zero_error_count
        expected_state = "sufficient" if sufficient else "insufficient"
        if self.sample_size_state != expected_state:
            raise ValueError("gate sample-size state does not match its stratum")
        if not sufficient:
            expected_verdict: GateVerdict = "insufficient-sample"
        elif self.wilson_lcb is not None and self.wilson_lcb >= self.precision_target:
            expected_verdict = "pass"
        else:
            expected_verdict = "fail"
        if self.verdict != expected_verdict:
            raise ValueError("gate verdict does not follow its release rule")

    @model_validator(mode="after")
    def check_decision(self) -> Self:
        self._check_source()
        self._check_counts()
        self._check_statistical_policy()
        self._check_verdict()
        return self


class CalibrationBin(AnalysisModel):
    """One equal-width confidence bin over independent gold."""

    lower: Probability
    upper: Probability
    upper_inclusive: bool
    count: NonNegativeInt
    mean_confidence: ScalarMetric
    accuracy: RateMetric

    @model_validator(mode="after")
    def check_bin(self) -> Self:
        if self.lower >= self.upper:
            raise ValueError("calibration bin lower bound must precede upper")
        if self.mean_confidence.observations != self.count:
            raise ValueError("calibration confidence sample count differs from the bin")
        if self.accuracy.denominator != self.count:
            raise ValueError("calibration accuracy sample count differs from the bin")
        expected_scalar = "empty-bin" if self.count == 0 else "defined"
        expected_rate = "empty-bin" if self.count == 0 else "defined"
        if self.mean_confidence.state != expected_scalar or self.accuracy.state != expected_rate:
            raise ValueError("calibration undefined states do not match the bin")
        mean = self.mean_confidence.value
        if mean is not None:
            below_upper = mean <= self.upper if self.upper_inclusive else mean < self.upper
            if mean < self.lower or not below_upper:
                raise ValueError("mean confidence lies outside its calibration bin")
        return self


class ApplicabilitySummary(AnalysisModel):
    """Fixed lower-order-statistic applicability quantiles for one producer."""

    producer: str = Field(min_length=1)
    cards: PositiveInt
    quantile_algorithm: Literal["lower-order-statistic-v1"] = "lower-order-statistic-v1"
    q05: Probability
    q25: Probability
    q50: Probability
    q75: Probability
    q95: Probability

    @model_validator(mode="after")
    def check_order(self) -> Self:
        quantiles = (self.q05, self.q25, self.q50, self.q75, self.q95)
        if quantiles != tuple(sorted(quantiles)):
            raise ValueError("applicability quantiles must be non-decreasing")
        return self


class JudgeHealth(AnalysisModel):
    """One judge's response, gold, latency, and fresh-cost health."""

    family_id: JudgeFamilyId
    votes: PositiveInt
    abstentions: NonNegativeInt
    abstention_rate: RateMetric
    initial_schema_compliance: RateMetric
    parse_repair_rate: RateMetric
    gold_votes: NonNegativeInt
    gold_agreement: RateMetric
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
        if self.gold_agreement.denominator != self.gold_votes:
            raise ValueError("judge gold rate does not match its gold-vote count")
        expected_gold_state = "no-observations" if self.gold_votes == 0 else "defined"
        if self.gold_agreement.state != expected_gold_state:
            raise ValueError("judge gold undefined state does not match its evidence")
        if self.median_latency_seconds.observations != self.votes:
            raise ValueError("judge latency sample count differs from votes")
        return self


class FamilyVoteEconomics(AnalysisModel):
    """One family's explicit vote and fresh-cost accounting."""

    family_id: JudgeFamilyId
    imported_votes: NonNegativeInt
    fresh_baseline_votes: NonNegativeInt
    refinement_votes: NonNegativeInt
    abstentions: NonNegativeInt
    total_votes: PositiveInt
    known_cost_usd: NonNegativeFiniteFloat

    @model_validator(mode="after")
    def check_total(self) -> Self:
        expected = self.imported_votes + self.fresh_baseline_votes + self.refinement_votes
        if self.total_votes != expected or self.abstentions > self.total_votes:
            raise ValueError("family economics counts do not reconcile")
        return self


class PolicyVoteEconomics(AnalysisModel):
    """Explicit run-level vote economics without computed serialization."""

    pool_cards: PositiveInt
    refined_cards: NonNegativeInt
    review_queue_cards: NonNegativeInt
    total_votes: PositiveInt
    total_known_cost_usd: NonNegativeFiniteFloat
    realized_trigger_rate: Probability
    by_family: tuple[FamilyVoteEconomics, ...]

    @model_validator(mode="after")
    def check_totals(self) -> Self:
        family_ids = tuple(row.family_id for row in self.by_family)
        if family_ids != tuple(sorted(family_ids)) or len(family_ids) != len(set(family_ids)):
            raise ValueError("report economics families must be unique and sorted")
        if self.refined_cards > self.pool_cards or self.review_queue_cards > self.pool_cards:
            raise ValueError("report economics card counts exceed the pool")
        if self.total_votes != sum(row.total_votes for row in self.by_family):
            raise ValueError("report economics vote total differs from families")
        expected_cost = math.fsum(row.known_cost_usd for row in self.by_family)
        if not math.isclose(
            self.total_known_cost_usd,
            expected_cost,
            rel_tol=0.0,
            abs_tol=1e-12,
        ):
            raise ValueError("report economics cost differs from families")
        expected_rate = self.refined_cards / self.pool_cards
        if not math.isclose(
            self.realized_trigger_rate,
            expected_rate,
            rel_tol=0.0,
            abs_tol=1e-15,
        ):
            raise ValueError("report economics trigger rate differs from card counts")
        return self


class ClassifierPolicyEvaluation(AnalysisModel):
    """Thresholded gold, calibration, and applicability evidence."""

    predictions: PositiveInt
    decision_threshold: Probability
    prediction_algorithm: Literal["calibrated-argmax-threshold-v1"] = (
        "calibrated-argmax-threshold-v1"
    )
    gold: GoldAgreement
    calibration: tuple[CalibrationBin, ...]
    applicability: tuple[ApplicabilitySummary, ...]

    def _check_source(self) -> None:
        if self.gold.source != "classifier":
            raise ValueError("classifier evaluation requires classifier gold agreement")
        if self.gold.decision_threshold != self.decision_threshold:
            raise ValueError("classifier threshold differs across report sections")

    def _check_calibration(self) -> None:
        if not self.calibration:
            raise ValueError("classifier evaluation requires calibration bins")
        bin_count = len(self.calibration)
        for index, row in enumerate(self.calibration):
            expected_lower = index / bin_count
            expected_upper = (index + 1) / bin_count
            if not math.isclose(row.lower, expected_lower, rel_tol=0.0, abs_tol=1e-15):
                raise ValueError("calibration lower boundaries are not equal width")
            if not math.isclose(row.upper, expected_upper, rel_tol=0.0, abs_tol=1e-15):
                raise ValueError("calibration upper boundaries are not equal width")
            if row.upper_inclusive != (index == bin_count - 1):
                raise ValueError("only the final calibration bin may include its upper bound")
        if sum(row.count for row in self.calibration) != self.gold.placement_gold_cards:
            raise ValueError("calibration bins do not cover independent placement gold")

    def _check_applicability(self) -> None:
        producers = tuple(row.producer for row in self.applicability)
        if producers != tuple(sorted(producers)) or len(producers) != len(set(producers)):
            raise ValueError("applicability producers must be unique and sorted")
        if sum(row.cards for row in self.applicability) != self.predictions:
            raise ValueError("applicability summaries do not cover classifier predictions")

    @model_validator(mode="after")
    def check_evidence(self) -> Self:
        self._check_source()
        self._check_calibration()
        self._check_applicability()
        return self


class PolicyReport(AnalysisModel):
    """A complete machine-readable policy evaluation report."""

    schema_version: Literal[1] = 1
    rubric_version: str = Field(min_length=1)
    report_config: ReportConfig
    eligible_cards: PositiveInt
    gold_cards: NonNegativeInt
    gold_post_exposure: NonNegativeInt
    panel_gold: GoldAgreement
    classifier_state: Literal["not-provided", "evaluated"]
    classifier: ClassifierPolicyEvaluation | None
    coincident_gate: CoincidentGate
    judges: tuple[JudgeHealth, ...]
    economics: PolicyVoteEconomics

    def _check_gold(self) -> None:
        if self.gold_cards != self.panel_gold.gold_cards:
            raise ValueError("report gold count differs from panel agreement")
        if self.gold_post_exposure != self.panel_gold.post_exposure_excluded:
            raise ValueError("report exposure count differs from panel agreement")
        if self.eligible_cards != self.economics.pool_cards:
            raise ValueError("report eligible cards differ from economics")
        if self.gold_cards > self.eligible_cards:
            raise ValueError("report gold count exceeds eligible cards")
        if self.panel_gold.source != "panel":
            raise ValueError("panel gold section requires panel predictions")

    def _check_classifier(self) -> None:
        has_classifier = self.classifier is not None
        if has_classifier != (self.classifier_state == "evaluated"):
            raise ValueError("classifier state does not match classifier evidence")
        expected_source: PredictionSource = "classifier" if has_classifier else "panel"
        if self.coincident_gate.source != expected_source:
            raise ValueError("gate source does not match available predictions")
        expected_threshold = (
            self.classifier.decision_threshold if self.classifier is not None else None
        )
        if self.coincident_gate.decision_threshold != expected_threshold:
            raise ValueError("gate threshold does not match its prediction source")
        if self.classifier is not None:
            panel_cohort = (
                self.panel_gold.gold_cards,
                self.panel_gold.post_exposure_excluded,
                self.panel_gold.independent_gold_cards,
                self.panel_gold.independent_unclear,
                self.panel_gold.placement_gold_cards,
            )
            classifier_cohort = (
                self.classifier.gold.gold_cards,
                self.classifier.gold.post_exposure_excluded,
                self.classifier.gold.independent_gold_cards,
                self.classifier.gold.independent_unclear,
                self.classifier.gold.placement_gold_cards,
            )
            if classifier_cohort != panel_cohort:
                raise ValueError("panel and classifier gold cohorts differ")

    def _check_policy(self) -> None:
        if self.coincident_gate.precision_target != self.report_config.coincident_precision_target:
            raise ValueError("gate precision target differs from report config")
        if self.coincident_gate.confidence_level != self.report_config.confidence_level:
            raise ValueError("gate confidence differs from report config")
        gate_agreement = self.classifier.gold if self.classifier is not None else self.panel_gold
        expected_stratum = sum(row.coincident for row in gate_agreement.confusion[:-1])
        expected_correct = gate_agreement.confusion[0].coincident
        if (
            self.coincident_gate.stratum_size != expected_stratum
            or self.coincident_gate.correct != expected_correct
        ):
            raise ValueError("gate evidence does not match prediction confusion")
        if self.classifier is not None:
            if self.classifier.predictions != self.eligible_cards:
                raise ValueError("classifier predictions do not cover eligible cards")
            if self.classifier.decision_threshold != self.report_config.calibrated_threshold:
                raise ValueError("classifier threshold differs from report config")
            if len(self.classifier.calibration) != self.report_config.calibration_bins:
                raise ValueError("calibration bin count differs from report config")

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
        self._check_gold()
        self._check_classifier()
        self._check_policy()
        self._check_families()
        return self
