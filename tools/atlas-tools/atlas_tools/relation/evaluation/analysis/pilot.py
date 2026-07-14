"""Derive pilot qualification and production decisions from validated evidence.

The analysis boundary accepts domain models, indexes every durable identity
once, and returns immutable decision evidence. Filesystem access, provider SDK
types, scheduling, and rendering remain outside this module.
"""

import itertools
import math
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Annotated, Literal, Self

from pydantic import (
    Field,
    JsonValue,
    NonNegativeInt,
    PositiveInt,
    TypeAdapter,
    computed_field,
    model_validator,
)

from atlas_tools.relation.evaluation.analysis._model import AnalysisModel
from atlas_tools.relation.evaluation.analysis.pilot_statistics import (
    RateEstimate,
    card_cluster_rate,
    normalized_verdict_entropy,
)
from atlas_tools.relation.evaluation.domain.api import (
    BUNDLES,
    FRAMINGS,
    QUALIFICATION_BUNDLE,
    SHELLS,
    AttemptId,
    BundleId,
    EvaluationCard,
    FramingId,
    FrozenMapping,
    HandoffManifest,
    JudgeFamilyId,
    JudgePin,
    NonEmptyStr,
    NonNegativeFiniteFloat,
    OpenProbability,
    PhysicalAttempt,
    PositiveProbability,
    Probability,
    ProviderResult,
    ReasoningEffort,
    RelationId,
    Sha256Hex,
    ShellId,
    SliceRecord,
    Verdict,
    Vote,
    VoteId,
    VoteVerdict,
    bundle_id,
)

type PilotAxis = Literal["shell", "framing"]
type _Cell = tuple[RelationId, JudgeFamilyId, BundleId, ReasoningEffort, int]

_JSON_OBJECT = TypeAdapter(dict[str, JsonValue])
_HTTP_OK = 200
_ADMISSION_ORDER: tuple[tuple[PilotAxis, ShellId | FramingId], ...] = (
    ("shell", "S2"),
    ("shell", "S3"),
    ("framing", "F2"),
    ("framing", "F3"),
)


class PilotAnalysisError(ValueError):
    """A pilot cohort cannot support one trustworthy decision artifact."""


class PilotHoldoutRule(AnalysisModel):
    """Define accepted verdicts and probe status for one holdout anchor."""

    relation_id: RelationId
    accepted_verdicts: Annotated[tuple[Verdict, ...], Field(min_length=1)]
    mandatory_probe: bool = False

    @model_validator(mode="after")
    def check_verdicts(self) -> Self:
        if len(self.accepted_verdicts) != len(set(self.accepted_verdicts)):
            raise ValueError("accepted holdout verdicts must be unique")
        return self

    @property
    def canonical_verdict(self) -> Verdict:
        """Return the first accepted verdict used by the slice artifact."""
        return self.accepted_verdicts[0]


class PilotAnalysisPolicy(AnalysisModel):
    """Pin every threshold and resampling choice used by pilot decisions."""

    holdouts: Annotated[tuple[PilotHoldoutRule, ...], Field(min_length=1)]
    holdout_minimum_correct: PositiveInt
    minimum_panel_families: PositiveInt = 2
    stream_missing_rerun_rate: Probability = 0.02
    routing_rerun_rate: Probability = 0.005
    abstention_flag_rate: Probability = 0.05
    absolute_flip_ceiling: Probability = 0.05
    relative_flip_factor: OpenProbability = 0.5
    contested_fraction: OpenProbability = 1 / 3
    bootstrap_resamples: PositiveInt = 1000
    bootstrap_seed: int = 0
    confidence_level: OpenProbability = 0.95
    minimum_bootstrap_defined_rate: PositiveProbability = 0.95
    estimated_tokens_per_vote: PositiveInt = 7500
    reason_word_limit: PositiveInt = 60

    @model_validator(mode="after")
    def check_holdouts(self) -> Self:
        relation_ids = tuple(rule.relation_id for rule in self.holdouts)
        if relation_ids != tuple(sorted(relation_ids)) or len(relation_ids) != len(
            set(relation_ids)
        ):
            raise ValueError("pilot holdout rules must be unique and sorted by relation ID")
        if self.holdout_minimum_correct > len(self.holdouts):
            raise ValueError("holdout minimum cannot exceed the holdout count")
        return self


class PilotCoverageStream(AnalysisModel):
    """Measure clean baseline coverage for one family and bundle stream."""

    family_id: JudgeFamilyId
    bundle_id: BundleId
    expected: PositiveInt
    raw_observed: NonNegativeInt
    observed: NonNegativeInt
    missing_ceiling: Probability

    @model_validator(mode="after")
    def check_counts(self) -> Self:
        if self.raw_observed > self.expected:
            raise ValueError("raw coverage cannot exceed expected cells")
        if self.observed > self.raw_observed:
            raise ValueError("clean coverage cannot exceed raw coverage")
        return self

    @computed_field
    @property
    def routing_dropped(self) -> int:
        """Count raw cells rejected by route validation."""
        return self.raw_observed - self.observed

    @computed_field
    @property
    def missing(self) -> int:
        """Count expected cells without clean votes."""
        return self.expected - self.observed

    @computed_field
    @property
    def missing_rate(self) -> Probability:
        """Return the fraction of expected cells without clean votes."""
        return self.missing / self.expected

    @computed_field
    @property
    def rerun_required(self) -> bool:
        """Return whether missing coverage exceeds the declared ceiling."""
        return self.missing_rate > self.missing_ceiling


class PilotRoutingStream(AnalysisModel):
    """Measure route-pin violations for one raw family and bundle stream."""

    family_id: JudgeFamilyId
    bundle_id: BundleId
    observed: NonNegativeInt
    violations: NonNegativeInt
    violation_ceiling: Probability

    @model_validator(mode="after")
    def check_counts(self) -> Self:
        if self.violations > self.observed:
            raise ValueError("routing violations cannot exceed observed votes")
        return self

    @computed_field
    @property
    def violation_rate(self) -> Probability:
        """Return the violation fraction, or zero for an empty stream."""
        return self.violations / self.observed if self.observed else 0.0

    @computed_field
    @property
    def rerun_required(self) -> bool:
        """Return whether routing violations exceed the declared ceiling."""
        return self.violation_rate > self.violation_ceiling


class FamilyBundleHealth(AnalysisModel):
    """Summarize abstention and repair pressure for one clean stream."""

    family_id: JudgeFamilyId
    bundle_id: BundleId
    responses: NonNegativeInt
    abstentions: NonNegativeInt
    parse_retries: NonNegativeInt
    abstention_flag_rate: Probability

    @model_validator(mode="after")
    def check_counts(self) -> Self:
        if self.abstentions > self.responses or self.parse_retries > self.responses:
            raise ValueError("health event counts cannot exceed stream responses")
        return self

    @computed_field
    @property
    def abstention_rate(self) -> Probability:
        """Return the abstention fraction, or zero for an empty stream."""
        return self.abstentions / self.responses if self.responses else 0.0

    @computed_field
    @property
    def parse_retry_rate(self) -> Probability:
        """Return the parse-repair fraction, or zero for an empty stream."""
        return self.parse_retries / self.responses if self.responses else 0.0

    @computed_field
    @property
    def prompt_compatibility_flag(self) -> bool:
        """Return whether abstention exceeds the prompt-compatibility threshold."""
        return self.abstention_rate > self.abstention_flag_rate


class PilotDataHealth(AnalysisModel):
    """Carry deterministic phase-zero health evidence and drop accounting."""

    votes_loaded: NonNegativeInt
    clean_votes: NonNegativeInt
    routing_violation_vote_ids: tuple[VoteId, ...]
    reasons_over_word_limit: NonNegativeInt
    reason_word_limit: PositiveInt
    coverage: tuple[PilotCoverageStream, ...]
    routing: tuple[PilotRoutingStream, ...]
    family_bundle: tuple[FamilyBundleHealth, ...]
    warnings: tuple[NonEmptyStr, ...]

    @model_validator(mode="after")
    def check_totals(self) -> Self:
        if self.clean_votes + len(self.routing_violation_vote_ids) != self.votes_loaded:
            raise ValueError("clean and route-rejected votes must account for loaded votes")
        if self.reasons_over_word_limit > self.votes_loaded:
            raise ValueError("reason violations cannot exceed loaded votes")
        if self.routing_violation_vote_ids != tuple(sorted(self.routing_violation_vote_ids)):
            raise ValueError("routing violation vote IDs must be sorted")
        if len(self.routing_violation_vote_ids) != len(set(self.routing_violation_vote_ids)):
            raise ValueError("routing violation vote IDs must be unique")
        return self

    @model_validator(mode="after")
    def check_streams(self) -> Self:
        coverage = tuple((row.family_id, row.bundle_id) for row in self.coverage)
        routing = tuple((row.family_id, row.bundle_id) for row in self.routing)
        health = tuple((row.family_id, row.bundle_id) for row in self.family_bundle)
        if not coverage or coverage != tuple(sorted(coverage)):
            raise ValueError("pilot health streams must be non-empty and sorted")
        if len(coverage) != len(set(coverage)):
            raise ValueError("pilot health streams must be unique")
        if routing != coverage or health != coverage:
            raise ValueError("coverage, routing, and family health must cover the same streams")
        if self.warnings != tuple(sorted(self.warnings)) or len(self.warnings) != len(
            set(self.warnings)
        ):
            raise ValueError("pilot health warnings must be unique and sorted")
        return self

    @computed_field
    @property
    def routing_violations(self) -> int:
        """Count votes rejected by exact-route replay."""
        return len(self.routing_violation_vote_ids)

    @computed_field
    @property
    def reason_over_limit_rate(self) -> Probability:
        """Return the long-reason fraction, or zero for an empty cohort."""
        return self.reasons_over_word_limit / self.votes_loaded if self.votes_loaded else 0.0


class HoldoutScore(AnalysisModel):
    """Retain one family's verdict against one holdout rule."""

    relation_id: RelationId
    accepted_verdicts: tuple[Verdict, ...]
    mandatory_probe: bool
    verdict: VoteVerdict | None

    @computed_field
    @property
    def correct(self) -> bool:
        """Return whether the observed nominal verdict is accepted."""
        return self.verdict in self.accepted_verdicts


class BundleQualification(AnalysisModel):
    """Score one family and bundle over the ordered holdout anchors."""

    bundle_id: BundleId
    holdouts: Annotated[tuple[HoldoutScore, ...], Field(min_length=1)]

    @model_validator(mode="after")
    def check_holdouts(self) -> Self:
        relation_ids = tuple(row.relation_id for row in self.holdouts)
        if relation_ids != tuple(sorted(relation_ids)) or len(relation_ids) != len(
            set(relation_ids)
        ):
            raise ValueError("bundle holdouts must be unique and sorted")
        return self

    @computed_field
    @property
    def correct_count(self) -> int:
        """Count accepted holdout verdicts."""
        return sum(row.correct for row in self.holdouts)


class FamilyQualification(AnalysisModel):
    """Apply the qualification-bundle gate while retaining all bundle evidence."""

    family_id: JudgeFamilyId
    minimum_correct: PositiveInt
    qualification_bundle: Literal["S1xF1"] = "S1xF1"
    bundles: Annotated[tuple[BundleQualification, ...], Field(min_length=1)]

    @model_validator(mode="after")
    def check_bundles(self) -> Self:
        bundle_ids = tuple(row.bundle_id for row in self.bundles)
        if bundle_ids != tuple(sorted(bundle_ids)) or len(bundle_ids) != len(set(bundle_ids)):
            raise ValueError("qualification bundles must be unique and sorted")
        if self.qualification_bundle not in bundle_ids:
            raise ValueError("family qualification requires the S1xF1 bundle")
        holdout_ids = tuple(row.relation_id for row in self.bundles[0].holdouts)
        if any(
            tuple(row.relation_id for row in bundle.holdouts) != holdout_ids
            for bundle in self.bundles
        ):
            raise ValueError("every bundle must score the same ordered holdouts")
        if self.minimum_correct > len(holdout_ids):
            raise ValueError("qualification minimum cannot exceed holdout count")
        return self

    @property
    def _qualification(self) -> BundleQualification:
        return next(row for row in self.bundles if row.bundle_id == self.qualification_bundle)

    @computed_field
    @property
    def correct_count(self) -> int:
        """Count correct S1xF1 holdouts."""
        return self._qualification.correct_count

    @computed_field
    @property
    def total_count(self) -> int:
        """Count S1xF1 holdout anchors."""
        return len(self._qualification.holdouts)

    @computed_field
    @property
    def mandatory_probes_correct(self) -> bool:
        """Return whether every mandatory S1xF1 probe is correct."""
        return all(not row.mandatory_probe or row.correct for row in self._qualification.holdouts)

    @computed_field
    @property
    def passed(self) -> bool:
        """Return whether count and mandatory-probe gates both pass."""
        return self.correct_count >= self.minimum_correct and self.mandatory_probes_correct


class PilotCardEntropy(AnalysisModel):
    """Record one non-holdout card's empirical four-class ambiguity."""

    relation_id: RelationId
    entropy: Probability
    nominal_votes: PositiveInt


class RepeatStability(AnalysisModel):
    """Measure pairwise verdict flips across baseline and repeat indices."""

    repeat_indices: tuple[NonNegativeInt, ...]
    expected_pairs: NonNegativeInt
    rate: RateEstimate

    @model_validator(mode="after")
    def check_pairs(self) -> Self:
        if not self.repeat_indices or self.repeat_indices[0] != 0:
            raise ValueError("repeat stability must start with baseline repeat zero")
        if self.repeat_indices != tuple(sorted(self.repeat_indices)) or len(
            self.repeat_indices
        ) != len(set(self.repeat_indices)):
            raise ValueError("repeat indices must be unique and sorted")
        if self.rate.observations > self.expected_pairs:
            raise ValueError("matched repeat pairs cannot exceed expected pairs")
        return self

    @computed_field
    @property
    def matched_pairs(self) -> int:
        """Count repeat pairs with two nominal verdicts."""
        return self.rate.observations

    @computed_field
    @property
    def missing_pairs(self) -> int:
        """Count absent or abstained repeat comparisons."""
        return self.expected_pairs - self.matched_pairs


class StabilityAdmission(AnalysisModel):
    """Apply absolute, family-relative, and interval-separation rules."""

    candidate: RateEstimate
    family: RateEstimate
    absolute_flip_ceiling: Probability
    relative_flip_factor: OpenProbability

    def _failures(self) -> tuple[NonEmptyStr, ...]:
        reasons: list[NonEmptyStr] = []
        if self.candidate.estimate is None or self.candidate.upper is None:
            reasons.append("candidate flip rate is undefined")
        elif self.candidate.upper > self.absolute_flip_ceiling:
            reasons.append(
                f"upper CI {self.candidate.upper:.6f} exceeds absolute ceiling "
                f"{self.absolute_flip_ceiling:.6f}"
            )
        if self.family.estimate is None or self.family.lower is None:
            reasons.append("family flip rate is undefined")
        elif (
            self.candidate.estimate is not None
            and self.candidate.estimate >= self.family.estimate * self.relative_flip_factor
        ):
            reasons.append("point estimate is not below the family-relative threshold")
        if (
            self.candidate.upper is not None
            and self.family.lower is not None
            and self.candidate.upper >= self.family.lower
        ):
            reasons.append("candidate and family confidence intervals overlap")
        return tuple(reasons)

    @computed_field
    @property
    def admitted(self) -> bool:
        """Return whether every stability rule passes."""
        return not self._failures()

    @computed_field
    @property
    def reasons(self) -> tuple[NonEmptyStr, ...]:
        """Return deterministic failure reasons or the admission basis."""
        return self._failures() or ("meets absolute and family-relative admission rules",)


class AxisAdmission(AnalysisModel):
    """Decide whether one non-baseline shell or framing is stable enough."""

    axis: PilotAxis
    level: ShellId | FramingId
    stability: StabilityAdmission

    @model_validator(mode="after")
    def check_level(self) -> Self:
        allowed = ("S2", "S3") if self.axis == "shell" else ("F2", "F3")
        if self.level not in allowed:
            raise ValueError(f"{self.axis} admission has invalid level {self.level}")
        return self

    @computed_field
    @property
    def admitted(self) -> bool:
        """Return the underlying stability decision."""
        return self.stability.admitted

    @computed_field
    @property
    def reasons(self) -> tuple[NonEmptyStr, ...]:
        """Return the underlying stability reasons."""
        return self.stability.reasons


class EffortHoldoutComparison(AnalysisModel):
    """Compare one alternative effort with its baseline holdout answers."""

    correct: NonNegativeInt
    total: PositiveInt
    minimum_correct: PositiveInt
    mandatory_probes_correct: bool
    rescues: NonNegativeInt
    regressions: NonNegativeInt

    @model_validator(mode="after")
    def check_counts(self) -> Self:
        if self.correct > self.total or self.minimum_correct > self.total:
            raise ValueError("effort holdout counts cannot exceed total")
        if self.rescues > self.total or self.regressions > self.total:
            raise ValueError("effort transitions cannot exceed holdout count")
        return self

    @computed_field
    @property
    def passed(self) -> bool:
        """Return whether the candidate retains qualification."""
        return self.correct >= self.minimum_correct and self.mandatory_probes_correct


class EffortCandidate(AnalysisModel):
    """Join candidate stability, qualification, and net-rescue evidence."""

    effort: ReasoningEffort
    stability: StabilityAdmission
    holdout: EffortHoldoutComparison

    @computed_field
    @property
    def eligible(self) -> bool:
        """Return whether the higher effort should replace baseline."""
        return (
            self.stability.admitted
            and self.holdout.passed
            and self.holdout.rescues > self.holdout.regressions
        )

    @computed_field
    @property
    def reasons(self) -> tuple[NonEmptyStr, ...]:
        """Return deterministic evidence for retaining or replacing baseline."""
        if self.eligible:
            return ("higher effort passes stability and improves holdout performance",)
        reasons = list(self.stability.reasons)
        if not self.holdout.passed:
            reasons.append("candidate effort fails the qualification-bundle holdout gate")
        if self.holdout.rescues <= self.holdout.regressions:
            reasons.append("candidate effort does not produce net holdout rescues")
        return tuple(reasons)


class FamilyEffortDecision(AnalysisModel):
    """Select baseline or one manifest-declared alternative effort."""

    family_id: JudgeFamilyId
    baseline_effort: ReasoningEffort
    baseline_holdout_correct: NonNegativeInt
    candidate: EffortCandidate | None

    @computed_field
    @property
    def selected_effort(self) -> ReasoningEffort:
        """Return the eligible candidate effort, otherwise baseline."""
        return (
            self.candidate.effort
            if self.candidate is not None and self.candidate.eligible
            else self.baseline_effort
        )

    @computed_field
    @property
    def reasons(self) -> tuple[NonEmptyStr, ...]:
        """Return the effort selection rationale."""
        if self.candidate is None:
            return ("no higher-effort arm was recorded; keep baseline",)
        return self.candidate.reasons


class FamilyProjection(AnalysisModel):
    """Project one qualified family's measured per-vote economics."""

    family_id: JudgeFamilyId
    selected_effort: ReasoningEffort
    cost_basis_bundles: tuple[BundleId, ...]
    observations: NonNegativeInt
    cost_reported: NonNegativeInt
    measured_cost_per_vote_usd: NonNegativeFiniteFloat | None
    billed_tokens_per_vote: NonNegativeFiniteFloat | None
    token_inflation_factor: NonNegativeFiniteFloat | None
    projected_calls: NonNegativeInt

    @model_validator(mode="after")
    def check_evidence(self) -> Self:
        if self.cost_reported > self.observations:
            raise ValueError("reported costs cannot exceed projection observations")
        if self.cost_basis_bundles != tuple(sorted(self.cost_basis_bundles)):
            raise ValueError("cost basis bundles must be sorted")
        if len(self.cost_basis_bundles) != len(set(self.cost_basis_bundles)):
            raise ValueError("cost basis bundles must be unique")
        complete = self.observations > 0 and self.cost_reported == self.observations
        if (self.measured_cost_per_vote_usd is not None) != complete:
            raise ValueError("measured cost must be set exactly for complete cost evidence")
        return self

    @computed_field
    @property
    def projected_cost_usd(self) -> float | None:
        """Scale measured per-vote cost to projected production calls."""
        if self.measured_cost_per_vote_usd is None:
            return None
        return self.measured_cost_per_vote_usd * self.projected_calls


class ProjectedEconomics(AnalysisModel):
    """Project admitted bundle calls and qualified-family cost."""

    admitted_bundles: Annotated[tuple[BundleId, ...], Field(min_length=1)]
    projected_calls: PositiveInt
    families: Annotated[tuple[FamilyProjection, ...], Field(min_length=1)]

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.admitted_bundles != tuple(sorted(self.admitted_bundles)) or len(
            self.admitted_bundles
        ) != len(set(self.admitted_bundles)):
            raise ValueError("admitted bundles must be unique and sorted")
        family_ids = tuple(row.family_id for row in self.families)
        if family_ids != tuple(sorted(family_ids)) or len(family_ids) != len(set(family_ids)):
            raise ValueError("projection families must be unique and sorted")
        if any(row.projected_calls != self.projected_calls for row in self.families):
            raise ValueError("every family projection must use the run call count")
        return self

    @computed_field
    @property
    def projected_grid_cost_usd(self) -> float | None:
        """Return total projected cost, failing closed on unknown family cost."""
        costs = tuple(row.projected_cost_usd for row in self.families)
        if any(cost is None for cost in costs):
            return None
        return math.fsum(cost for cost in costs if cost is not None)


class PilotAnalysis(AnalysisModel):
    """Carry the complete immutable pilot decision surface."""

    source_hashes: FrozenMapping[str, Sha256Hex]
    data_health: PilotDataHealth
    qualification: tuple[FamilyQualification, ...]
    card_entropy: tuple[PilotCardEntropy, ...]
    contested_relations: tuple[RelationId, ...]
    repeat_stability: RepeatStability
    family_stability: RateEstimate
    admissions: tuple[AxisAdmission, ...]
    effort: tuple[FamilyEffortDecision, ...]
    economics: ProjectedEconomics

    @model_validator(mode="after")
    def check_order(self) -> Self:
        qualification_ids = tuple(row.family_id for row in self.qualification)
        if qualification_ids != tuple(sorted(qualification_ids)) or len(qualification_ids) != len(
            set(qualification_ids)
        ):
            raise ValueError("qualification families must be unique and sorted")
        entropy_ids = tuple(row.relation_id for row in self.card_entropy)
        if entropy_ids != tuple(sorted(entropy_ids)) or len(entropy_ids) != len(set(entropy_ids)):
            raise ValueError("card entropy rows must be unique and sorted")
        if self.contested_relations != tuple(sorted(self.contested_relations)):
            raise ValueError("contested relations must be sorted")
        if tuple((row.axis, row.level) for row in self.admissions) != _ADMISSION_ORDER:
            raise ValueError("axis admissions must use shell then framing decision order")
        return self

    @model_validator(mode="after")
    def check_decision_families(self) -> Self:
        qualified = self.qualified_families
        if tuple(row.family_id for row in self.effort) != qualified:
            raise ValueError("effort decisions must cover exactly qualified families")
        if tuple(row.family_id for row in self.economics.families) != qualified:
            raise ValueError("economics must cover exactly qualified families")
        return self

    @computed_field
    @property
    def qualified_families(self) -> tuple[JudgeFamilyId, ...]:
        """Return families passing the qualification gate."""
        return tuple(row.family_id for row in self.qualification if row.passed)

    @computed_field
    @property
    def pruned_families(self) -> tuple[JudgeFamilyId, ...]:
        """Return families failing the qualification gate."""
        return tuple(row.family_id for row in self.qualification if not row.passed)

    @computed_field
    @property
    def admitted_shells(self) -> tuple[ShellId, ...]:
        """Return baseline S1 plus admitted shell levels."""
        return _admitted_shells(self.admissions)

    @computed_field
    @property
    def admitted_framings(self) -> tuple[FramingId, ...]:
        """Return baseline F1 plus admitted framing levels."""
        return _admitted_framings(self.admissions)


def _admitted_shells(admissions: tuple[AxisAdmission, ...]) -> tuple[ShellId, ...]:
    levels: list[ShellId] = ["S1"]
    for row in admissions:
        if row.axis != "shell" or not row.admitted:
            continue
        match row.level:
            case "S2" | "S3":
                levels.append(row.level)
            case _:
                raise ValueError("shell admission contains a framing level")
    return tuple(levels)


def _admitted_framings(admissions: tuple[AxisAdmission, ...]) -> tuple[FramingId, ...]:
    levels: list[FramingId] = ["F1"]
    for row in admissions:
        if row.axis != "framing" or not row.admitted:
            continue
        match row.level:
            case "F2" | "F3":
                levels.append(row.level)
            case _:
                raise ValueError("framing admission contains a shell level")
    return tuple(levels)


@dataclass(slots=True)
class _PilotIndex:
    manifest: HandoffManifest
    slices: dict[RelationId, SliceRecord]
    cards: dict[RelationId, EvaluationCard]
    votes_by_id: dict[VoteId, Vote]
    cells: dict[_Cell, Vote]
    attempts_by_vote: dict[VoteId, tuple[PhysicalAttempt, ...]]
    clean_cells: dict[_Cell, Vote]
    clean_votes: tuple[Vote, ...]
    routing_bad: tuple[Vote, ...]


@dataclass(slots=True)
class _StreamAccumulator:
    raw_grid: int = 0
    clean_grid: int = 0
    routing_violations: int = 0
    responses: int = 0
    abstentions: int = 0
    parse_retries: int = 0


def _cell(vote: Vote) -> _Cell:
    return (
        vote.relation_id,
        vote.family_id,
        vote.bundle_id,
        vote.effort,
        vote.repeat_index,
    )


def _validate_slice_and_cards(
    *,
    manifest: HandoffManifest,
    slice_records: Sequence[SliceRecord],
    cards: Sequence[EvaluationCard],
    policy: PilotAnalysisPolicy,
) -> tuple[dict[RelationId, SliceRecord], dict[RelationId, EvaluationCard]]:
    slices = {row.relation_id: row for row in slice_records}
    cards_by_id = {card.relation_id: card for card in cards}
    _validate_slice_contract(
        manifest=manifest,
        slice_records=slice_records,
        slices=slices,
        policy=policy,
    )
    _validate_card_contract(
        slices=slices,
        cards=cards,
        cards_by_id=cards_by_id,
        policy=policy,
    )
    return slices, cards_by_id


def _validate_slice_contract(
    *,
    manifest: HandoffManifest,
    slice_records: Sequence[SliceRecord],
    slices: Mapping[RelationId, SliceRecord],
    policy: PilotAnalysisPolicy,
) -> None:
    if len(slices) != len(slice_records):
        raise PilotAnalysisError("pilot slice contains duplicate relation IDs")
    expected = set(manifest.expected_grid.relation_ids)
    if set(slices) != expected:
        raise PilotAnalysisError("pilot slice must cover exactly the manifest relation IDs")
    if {row.sampling_seed for row in slice_records} != {manifest.slice_derivation.sampling_seed}:
        raise PilotAnalysisError("pilot slice sampling seeds differ from the manifest")
    selected_non_holdouts = sum(not row.is_holdout for row in slice_records)
    if selected_non_holdouts != manifest.slice_derivation.selected_non_holdouts:
        raise PilotAnalysisError("pilot slice non-holdout count differs from the manifest")

    rules = {rule.relation_id: rule for rule in policy.holdouts}
    actual_holdouts = {row.relation_id for row in slice_records if row.is_holdout}
    if actual_holdouts != set(rules):
        raise PilotAnalysisError("pilot slice holdouts must equal the analysis policy anchors")


def _validate_card_contract(
    *,
    slices: Mapping[RelationId, SliceRecord],
    cards: Sequence[EvaluationCard],
    cards_by_id: Mapping[RelationId, EvaluationCard],
    policy: PilotAnalysisPolicy,
) -> None:
    if len(cards_by_id) != len(cards):
        raise PilotAnalysisError("pilot cards contain duplicate relation IDs")
    if set(cards_by_id) != set(slices):
        raise PilotAnalysisError("pilot cards must cover exactly the manifest relation IDs")
    rules = {rule.relation_id: rule for rule in policy.holdouts}
    for relation_id, record in slices.items():
        card = cards_by_id[relation_id]
        if (
            record.card_hash != card.card_hash
            or record.token_count != card.token_count
            or record.prescreen_stratum != card.prescreen_stratum
            or record.pilot_strata != card.pilot_strata
        ):
            raise PilotAnalysisError(f"slice metadata differs from card {relation_id}")
        rule = rules.get(relation_id)
        if rule is not None and record.holdout_verdict != rule.canonical_verdict:
            raise PilotAnalysisError(f"holdout {relation_id} differs from its canonical verdict")


def _expected_cells(manifest: HandoffManifest) -> tuple[set[_Cell], set[_Cell]]:
    grid = manifest.expected_grid
    relations = set(grid.relation_ids)
    repeat = manifest.expected_repeat_arm
    if not set(repeat.relation_ids) <= relations:
        raise PilotAnalysisError("repeat-arm relations must belong to the pilot grid")
    grid_cells: set[_Cell] = {
        (relation_id, family_id, bundle, grid.effort, grid.repeat_index)
        for relation_id in grid.relation_ids
        for family_id in grid.families
        for bundle in grid.bundles
    }
    auxiliary: set[_Cell] = {
        (relation_id, family_id, repeat.bundle_id, repeat.effort, repeat_index)
        for relation_id in repeat.relation_ids
        for family_id in repeat.families
        for repeat_index in repeat.repeat_indices
    }
    effort = manifest.expected_effort_arm
    if effort is not None:
        if not set(effort.relation_ids) <= relations:
            raise PilotAnalysisError("effort-arm relations must belong to the pilot grid")
        auxiliary.update(
            (
                relation_id,
                family_id,
                effort.bundle_id,
                candidate_effort,
                effort.repeat_index,
            )
            for relation_id in effort.relation_ids
            for family_id, candidate_effort in effort.family_efforts.items()
        )
    return grid_cells, auxiliary


def _index_votes(
    *,
    manifest: HandoffManifest,
    cards: Mapping[RelationId, EvaluationCard],
    votes: Iterable[Vote],
) -> tuple[dict[VoteId, Vote], dict[_Cell, Vote]]:
    grid_cells, auxiliary_cells = _expected_cells(manifest)
    allowed = grid_cells | auxiliary_cells
    by_id: dict[VoteId, Vote] = {}
    cells: dict[_Cell, Vote] = {}
    for vote in votes:
        if vote.vote_id in by_id:
            raise PilotAnalysisError(f"duplicate pilot vote ID {vote.vote_id}")
        logical_cell = _cell(vote)
        if logical_cell in cells:
            raise PilotAnalysisError(f"duplicate pilot logical cell {logical_cell}")
        card = cards.get(vote.relation_id)
        if card is None or vote.card_hash != card.card_hash:
            raise PilotAnalysisError(f"vote {vote.vote_id} does not match a pilot card")
        if vote.prompt_pack_hash != manifest.prompt_pack_hash:
            raise PilotAnalysisError(f"vote {vote.vote_id} differs from the prompt pack")
        if vote.rubric_version != manifest.rubric_version:
            raise PilotAnalysisError(f"vote {vote.vote_id} differs from the rubric version")
        if logical_cell not in allowed:
            raise PilotAnalysisError(f"unexpected pilot logical cell {logical_cell}")
        by_id[vote.vote_id] = vote
        cells[logical_cell] = vote
    missing_auxiliary = auxiliary_cells - set(cells)
    if missing_auxiliary:
        raise PilotAnalysisError(
            f"pilot cohort lacks {len(missing_auxiliary)} repeat or effort cells"
        )
    return by_id, cells


def _index_attempts(
    *,
    votes_by_id: Mapping[VoteId, Vote],
    attempts: Iterable[PhysicalAttempt],
) -> dict[VoteId, tuple[PhysicalAttempt, ...]]:
    attempt_ids: set[AttemptId] = set()
    grouped: dict[VoteId, list[PhysicalAttempt]] = {vote_id: [] for vote_id in votes_by_id}
    for attempt in attempts:
        if attempt.attempt_id in attempt_ids:
            raise PilotAnalysisError(f"duplicate physical attempt ID {attempt.attempt_id}")
        attempt_ids.add(attempt.attempt_id)
        vote = votes_by_id.get(attempt.vote_id)
        if vote is None:
            raise PilotAnalysisError(
                f"attempt {attempt.attempt_id} refers to an unknown pilot vote"
            )
        if attempt.family_id != vote.family_id:
            raise PilotAnalysisError(f"attempt {attempt.attempt_id} differs from its vote family")
        grouped[attempt.vote_id].append(attempt)

    reconciled: dict[VoteId, tuple[PhysicalAttempt, ...]] = {}
    for vote_id, vote in votes_by_id.items():
        journal = grouped[vote_id]
        if not journal:
            raise PilotAnalysisError(f"pilot vote {vote_id} has no physical attempt evidence")
        for stage in ("initial", "repair"):
            indices = tuple(
                attempt.stage_attempt for attempt in journal if attempt.request_stage == stage
            )
            if indices != tuple(range(len(indices))):
                raise PilotAnalysisError(
                    f"attempt journal {vote_id}/{stage} is not contiguous and ordered"
                )
        accepted = tuple(
            attempt.attempt_id
            for attempt in journal
            if attempt.failure is None and attempt.result is not None
        )

        if accepted != vote.accepted_attempt_ids:
            raise PilotAnalysisError(f"pilot vote {vote_id} differs from its accepted attempts")
        reconciled[vote_id] = tuple(journal)
    return reconciled


def _object(value: JsonValue | None) -> dict[str, JsonValue] | None:
    if not isinstance(value, dict):
        return None
    return value


def _result_matches_route(result: ProviderResult, pin: JudgePin) -> bool:
    if result.model != pin.model:
        return False
    payload = _JSON_OBJECT.validate_json(result.raw_json, strict=True)
    metadata = _object(payload.get("openrouter_metadata"))
    if metadata is None:
        return False
    return _metadata_matches_route(metadata, pin)


def _metadata_matches_route(metadata: Mapping[str, JsonValue], pin: JudgePin) -> bool:
    attempt = metadata.get("attempt")
    if (
        metadata.get("requested") != pin.model
        or metadata.get("strategy") != "direct"
        or not isinstance(attempt, int)
        or isinstance(attempt, bool)
        or attempt != 1
    ):
        return False
    endpoints = _object(metadata.get("endpoints"))
    available = endpoints.get("available") if endpoints is not None else None
    if not isinstance(available, list):
        return False
    selected = tuple(
        endpoint
        for item in available
        if (endpoint := _object(item)) is not None and endpoint.get("selected") is True
    )
    if len(selected) != 1 or selected[0].get("provider") != pin.provider_name:
        return False
    detailed = metadata.get("attempts")
    if detailed is None:
        return True
    return _detailed_route_matches(detailed, pin)


def _detailed_route_matches(detailed: JsonValue, pin: JudgePin) -> bool:
    if not isinstance(detailed, list) or len(detailed) != 1:
        return False
    detail = _object(detailed[0])
    return (
        detail is not None
        and detail.get("status") == _HTTP_OK
        and detail.get("provider") == pin.provider_name
    )


def _vote_matches_route(
    vote: Vote,
    attempts: tuple[PhysicalAttempt, ...],
    pin: JudgePin,
) -> bool:
    if vote.model_returned != pin.model or vote.provider != pin.provider_name:
        return False
    if any(
        attempt.model_requested != pin.model or attempt.provider_slug != pin.provider_slug
        for attempt in attempts
    ):
        return False
    accepted = tuple(
        attempt.result
        for attempt in attempts
        if attempt.failure is None and attempt.result is not None
    )
    return bool(accepted) and all(_result_matches_route(result, pin) for result in accepted)


def _build_index(
    *,
    manifest: HandoffManifest,
    slice_records: Sequence[SliceRecord],
    cards: Sequence[EvaluationCard],
    votes: Iterable[Vote],
    attempts: Iterable[PhysicalAttempt],
    policy: PilotAnalysisPolicy,
) -> _PilotIndex:
    slices, cards_by_id = _validate_slice_and_cards(
        manifest=manifest,
        slice_records=slice_records,
        cards=cards,
        policy=policy,
    )
    votes_by_id, cells = _index_votes(manifest=manifest, cards=cards_by_id, votes=votes)
    attempts_by_vote = _index_attempts(votes_by_id=votes_by_id, attempts=attempts)
    pins = {judge.family_id: judge for judge in manifest.judges}
    routing_bad = tuple(
        sorted(
            (
                vote
                for vote in votes_by_id.values()
                if not _vote_matches_route(
                    vote, attempts_by_vote[vote.vote_id], pins[vote.family_id]
                )
            ),
            key=lambda vote: vote.vote_id,
        )
    )
    rejected_ids = {vote.vote_id for vote in routing_bad}
    clean_votes = tuple(
        sorted(
            (vote for vote in votes_by_id.values() if vote.vote_id not in rejected_ids),
            key=lambda vote: vote.vote_id,
        )
    )
    clean_cells = {_cell(vote): vote for vote in clean_votes}
    return _PilotIndex(
        manifest=manifest,
        slices=slices,
        cards=cards_by_id,
        votes_by_id=votes_by_id,
        cells=cells,
        attempts_by_vote=attempts_by_vote,
        clean_cells=clean_cells,
        clean_votes=clean_votes,
        routing_bad=routing_bad,
    )


def _is_grid_vote(vote: Vote, manifest: HandoffManifest) -> bool:
    grid = manifest.expected_grid
    return (
        vote.relation_id in grid.relation_ids
        and vote.family_id in grid.families
        and vote.bundle_id in grid.bundles
        and vote.effort == grid.effort
        and vote.repeat_index == grid.repeat_index
    )


def _data_health(index: _PilotIndex, policy: PilotAnalysisPolicy) -> PilotDataHealth:
    manifest = index.manifest
    grid = manifest.expected_grid
    rejected = {vote.vote_id for vote in index.routing_bad}
    streams = {
        (family_id, candidate_bundle): _StreamAccumulator()
        for family_id in sorted(grid.families)
        for candidate_bundle in sorted(grid.bundles)
    }
    for vote in index.votes_by_id.values():
        if _is_grid_vote(vote, manifest):
            stream = streams[(vote.family_id, vote.bundle_id)]
            stream.raw_grid += 1
            stream.routing_violations += vote.vote_id in rejected
    for vote in index.clean_votes:
        stream = streams[(vote.family_id, vote.bundle_id)]
        stream.responses += 1
        stream.abstentions += vote.abstained
        stream.parse_retries += vote.parse_retries == 1
        stream.clean_grid += _is_grid_vote(vote, manifest)

    coverage: list[PilotCoverageStream] = []
    routing: list[PilotRoutingStream] = []
    family_health: list[FamilyBundleHealth] = []
    warnings: list[NonEmptyStr] = []
    expected = len(grid.relation_ids)
    for (family_id, candidate_bundle), stream in streams.items():
        coverage.append(
            PilotCoverageStream(
                family_id=family_id,
                bundle_id=candidate_bundle,
                expected=expected,
                raw_observed=stream.raw_grid,
                observed=stream.clean_grid,
                missing_ceiling=policy.stream_missing_rerun_rate,
            )
        )
        routing.append(
            PilotRoutingStream(
                family_id=family_id,
                bundle_id=candidate_bundle,
                observed=stream.raw_grid,
                violations=stream.routing_violations,
                violation_ceiling=policy.routing_rerun_rate,
            )
        )
        health = FamilyBundleHealth(
            family_id=family_id,
            bundle_id=candidate_bundle,
            responses=stream.responses,
            abstentions=stream.abstentions,
            parse_retries=stream.parse_retries,
            abstention_flag_rate=policy.abstention_flag_rate,
        )
        family_health.append(health)
        if health.prompt_compatibility_flag:
            warnings.append(
                f"{family_id}/{candidate_bundle} abstention "
                f"{health.abstention_rate:.3%} exceeds "
                f"{policy.abstention_flag_rate:.3%}"
            )
    if index.routing_bad:
        warnings.append(f"dropped {len(index.routing_bad)} routing violation(s)")
    reasons_over = sum(
        len(vote.reason.split()) > policy.reason_word_limit for vote in index.votes_by_id.values()
    )
    return PilotDataHealth(
        votes_loaded=len(index.votes_by_id),
        clean_votes=len(index.clean_votes),
        routing_violation_vote_ids=tuple(vote.vote_id for vote in index.routing_bad),
        reasons_over_word_limit=reasons_over,
        reason_word_limit=policy.reason_word_limit,
        coverage=tuple(coverage),
        routing=tuple(routing),
        family_bundle=tuple(family_health),
        warnings=tuple(sorted(warnings)),
    )


def _require_healthy_streams(health: PilotDataHealth) -> None:
    missing = tuple(
        f"{row.family_id}/{row.bundle_id}={row.missing_rate:.3%}"
        for row in health.coverage
        if row.rerun_required
    )
    routing = tuple(
        f"{row.family_id}/{row.bundle_id}={row.violation_rate:.3%}"
        for row in health.routing
        if row.rerun_required
    )
    if missing:
        raise PilotAnalysisError("pilot coverage requires stream reruns: " + ", ".join(missing))
    if routing:
        raise PilotAnalysisError("pilot routing requires stream reruns: " + ", ".join(routing))


def _holdout_score(
    index: _PilotIndex,
    *,
    family_id: JudgeFamilyId,
    bundle: BundleId,
    rule: PilotHoldoutRule,
    effort: ReasoningEffort,
) -> HoldoutScore:
    vote = index.clean_cells.get((rule.relation_id, family_id, bundle, effort, 0))
    return HoldoutScore(
        relation_id=rule.relation_id,
        accepted_verdicts=rule.accepted_verdicts,
        mandatory_probe=rule.mandatory_probe,
        verdict=vote.verdict if vote is not None else None,
    )


def _qualifications(
    index: _PilotIndex,
    policy: PilotAnalysisPolicy,
) -> tuple[FamilyQualification, ...]:
    baseline = index.manifest.expected_grid.effort
    return tuple(
        FamilyQualification(
            family_id=family_id,
            minimum_correct=policy.holdout_minimum_correct,
            bundles=tuple(
                BundleQualification(
                    bundle_id=candidate_bundle,
                    holdouts=tuple(
                        _holdout_score(
                            index,
                            family_id=family_id,
                            bundle=candidate_bundle,
                            rule=rule,
                            effort=baseline,
                        )
                        for rule in policy.holdouts
                    ),
                )
                for candidate_bundle in sorted(index.manifest.expected_grid.bundles)
            ),
        )
        for family_id in sorted(index.manifest.expected_grid.families)
    )


def _nominal(vote: Vote | None) -> Verdict | None:
    if vote is None or vote.verdict == "ABSTAIN":
        return None
    return vote.verdict


def _card_verdict_counts(
    index: _PilotIndex,
    *,
    relation_id: RelationId,
    families: tuple[JudgeFamilyId, ...],
) -> tuple[int, int, int, int]:
    grid = index.manifest.expected_grid
    coincident = proximal = overlay = unclear = 0
    for family_id in families:
        for candidate_bundle in grid.bundles:
            verdict = _nominal(
                index.clean_cells.get((relation_id, family_id, candidate_bundle, grid.effort, 0))
            )
            match verdict:
                case "coincident":
                    coincident += 1
                case "proximal":
                    proximal += 1
                case "overlay":
                    overlay += 1
                case "unclear":
                    unclear += 1
                case None:
                    pass
    return coincident, proximal, overlay, unclear


def _card_entropy(
    index: _PilotIndex,
    qualified_families: tuple[JudgeFamilyId, ...],
    policy: PilotAnalysisPolicy,
) -> tuple[tuple[PilotCardEntropy, ...], tuple[RelationId, ...]]:
    rows: list[PilotCardEntropy] = []
    for relation_id in sorted(
        row.relation_id for row in index.slices.values() if not row.is_holdout
    ):
        counts = _card_verdict_counts(
            index,
            relation_id=relation_id,
            families=qualified_families,
        )
        total = sum(counts)
        if total == 0:
            raise PilotAnalysisError(f"qualified panel has no nominal votes for {relation_id}")
        rows.append(
            PilotCardEntropy(
                relation_id=relation_id,
                entropy=normalized_verdict_entropy(counts),
                nominal_votes=total,
            )
        )
    if not rows:
        raise PilotAnalysisError("pilot analysis requires at least one non-holdout card")
    contested_count = max(1, math.ceil(len(rows) * policy.contested_fraction))
    ranked = sorted(rows, key=lambda row: (-row.entropy, row.relation_id))
    contested = tuple(sorted(row.relation_id for row in ranked[:contested_count]))
    return tuple(rows), contested


def _rate(
    observations: Mapping[RelationId, Sequence[bool]],
    policy: PilotAnalysisPolicy,
) -> RateEstimate:
    return card_cluster_rate(
        observations,
        resamples=policy.bootstrap_resamples,
        seed=policy.bootstrap_seed,
        confidence_level=policy.confidence_level,
        minimum_defined_rate=policy.minimum_bootstrap_defined_rate,
    )


def _family_observations(
    index: _PilotIndex,
    *,
    relations: set[RelationId],
    families: tuple[JudgeFamilyId, ...],
) -> dict[RelationId, list[bool]]:
    observations: dict[RelationId, list[bool]] = defaultdict(list)
    effort = index.manifest.expected_grid.effort
    for relation_id in sorted(relations):
        for first, second in itertools.combinations(families, 2):
            for candidate_bundle in BUNDLES:
                first_verdict = _nominal(
                    index.clean_cells.get((relation_id, first, candidate_bundle, effort, 0))
                )
                second_verdict = _nominal(
                    index.clean_cells.get((relation_id, second, candidate_bundle, effort, 0))
                )
                if first_verdict is not None and second_verdict is not None:
                    observations[relation_id].append(first_verdict != second_verdict)
    return dict(observations)


def _axis_pairs(
    axis: PilotAxis,
    level: ShellId | FramingId,
) -> tuple[tuple[BundleId, BundleId], ...]:
    if axis == "shell":
        match level:
            case "S2" | "S3":
                shell_level = level
            case _:
                raise ValueError("shell comparison requires a shell level")
        return tuple(
            (
                bundle_id(shell="S1", framing=framing),  # noqa: S604 - bundle axis.
                bundle_id(shell=shell_level, framing=framing),
            )
            for framing in FRAMINGS
        )
    match level:
        case "F2" | "F3":
            framing_level = level
        case _:
            raise ValueError("framing comparison requires a framing level")
    return tuple(
        (
            bundle_id(shell=shell, framing="F1"),
            bundle_id(shell=shell, framing=framing_level),
        )
        for shell in SHELLS
    )


def _axis_observations(
    index: _PilotIndex,
    *,
    relations: set[RelationId],
    families: tuple[JudgeFamilyId, ...],
    axis: PilotAxis,
    level: ShellId | FramingId,
) -> dict[RelationId, list[bool]]:
    observations: dict[RelationId, list[bool]] = defaultdict(list)
    effort = index.manifest.expected_grid.effort
    pairs = _axis_pairs(axis, level)
    for relation_id in sorted(relations):
        for family_id in families:
            for baseline_bundle, candidate_bundle in pairs:
                baseline = _nominal(
                    index.clean_cells.get((relation_id, family_id, baseline_bundle, effort, 0))
                )
                candidate = _nominal(
                    index.clean_cells.get((relation_id, family_id, candidate_bundle, effort, 0))
                )
                if baseline is not None and candidate is not None:
                    observations[relation_id].append(baseline != candidate)
    return dict(observations)


def _repeat_stability(
    index: _PilotIndex,
    *,
    qualified_families: tuple[JudgeFamilyId, ...],
    policy: PilotAnalysisPolicy,
) -> RepeatStability:
    arm = index.manifest.expected_repeat_arm
    indices = (0, *tuple(sorted(arm.repeat_indices)))
    observations: dict[RelationId, list[bool]] = defaultdict(list)
    for relation_id in sorted(arm.relation_ids):
        for family_id in qualified_families:
            verdicts = tuple(
                (
                    repeat_index,
                    _nominal(
                        index.clean_cells.get(
                            (
                                relation_id,
                                family_id,
                                arm.bundle_id,
                                arm.effort,
                                repeat_index,
                            )
                        )
                    ),
                )
                for repeat_index in indices
            )
            for (_, first), (_, second) in itertools.combinations(verdicts, 2):
                if first is not None and second is not None:
                    observations[relation_id].append(first != second)
    comparisons = len(tuple(itertools.combinations(indices, 2)))
    expected = len(arm.relation_ids) * len(qualified_families) * comparisons
    return RepeatStability(
        repeat_indices=indices,
        expected_pairs=expected,
        rate=_rate(observations, policy),
    )


def _stability(
    candidate: RateEstimate,
    family: RateEstimate,
    policy: PilotAnalysisPolicy,
) -> StabilityAdmission:
    return StabilityAdmission(
        candidate=candidate,
        family=family,
        absolute_flip_ceiling=policy.absolute_flip_ceiling,
        relative_flip_factor=policy.relative_flip_factor,
    )


def _axis_admissions(
    index: _PilotIndex,
    *,
    qualified_families: tuple[JudgeFamilyId, ...],
    non_contested: set[RelationId],
    family_rate: RateEstimate,
    policy: PilotAnalysisPolicy,
) -> tuple[AxisAdmission, ...]:
    decisions: list[AxisAdmission] = []
    for axis, level in _ADMISSION_ORDER:
        candidate = _rate(
            _axis_observations(
                index,
                relations=non_contested,
                families=qualified_families,
                axis=axis,
                level=level,
            ),
            policy,
        )
        decisions.append(
            AxisAdmission(
                axis=axis,
                level=level,
                stability=_stability(candidate, family_rate, policy),
            )
        )
    return tuple(decisions)


def _effort_holdouts(
    index: _PilotIndex,
    *,
    family_id: JudgeFamilyId,
    candidate_effort: ReasoningEffort,
    policy: PilotAnalysisPolicy,
) -> EffortHoldoutComparison:
    baseline_effort = index.manifest.expected_grid.effort
    correct = rescues = regressions = 0
    probes_correct = True
    for rule in policy.holdouts:
        baseline = _nominal(
            index.clean_cells.get(
                (
                    rule.relation_id,
                    family_id,
                    QUALIFICATION_BUNDLE,
                    baseline_effort,
                    0,
                )
            )
        )
        candidate = _nominal(
            index.clean_cells.get(
                (
                    rule.relation_id,
                    family_id,
                    QUALIFICATION_BUNDLE,
                    candidate_effort,
                    0,
                )
            )
        )
        baseline_correct = baseline in rule.accepted_verdicts
        candidate_correct = candidate in rule.accepted_verdicts
        correct += candidate_correct
        rescues += candidate_correct and not baseline_correct
        regressions += baseline_correct and not candidate_correct
        if rule.mandatory_probe and not candidate_correct:
            probes_correct = False
    return EffortHoldoutComparison(
        correct=correct,
        total=len(policy.holdouts),
        minimum_correct=policy.holdout_minimum_correct,
        mandatory_probes_correct=probes_correct,
        rescues=rescues,
        regressions=regressions,
    )


def _effort_observations(
    index: _PilotIndex,
    *,
    family_id: JudgeFamilyId,
    candidate_effort: ReasoningEffort,
    relations: set[RelationId],
) -> dict[RelationId, list[bool]]:
    baseline_effort = index.manifest.expected_grid.effort
    observations: dict[RelationId, list[bool]] = defaultdict(list)
    for relation_id in sorted(relations):
        baseline = _nominal(
            index.clean_cells.get(
                (
                    relation_id,
                    family_id,
                    QUALIFICATION_BUNDLE,
                    baseline_effort,
                    0,
                )
            )
        )
        candidate = _nominal(
            index.clean_cells.get(
                (
                    relation_id,
                    family_id,
                    QUALIFICATION_BUNDLE,
                    candidate_effort,
                    0,
                )
            )
        )
        if baseline is not None and candidate is not None:
            observations[relation_id].append(baseline != candidate)
    return dict(observations)


def _effort_decisions(
    index: _PilotIndex,
    *,
    qualifications: tuple[FamilyQualification, ...],
    qualified_families: tuple[JudgeFamilyId, ...],
    non_contested: set[RelationId],
    family_rate: RateEstimate,
    policy: PilotAnalysisPolicy,
) -> tuple[FamilyEffortDecision, ...]:
    arm = index.manifest.expected_effort_arm
    qualification_by_family = {row.family_id: row for row in qualifications}
    decisions: list[FamilyEffortDecision] = []
    for family_id in qualified_families:
        candidate_effort = arm.family_efforts.get(family_id) if arm is not None else None
        candidate: EffortCandidate | None = None
        if candidate_effort is not None and arm is not None:
            eligible_relations = non_contested & set(arm.relation_ids)
            rate = _rate(
                _effort_observations(
                    index,
                    family_id=family_id,
                    candidate_effort=candidate_effort,
                    relations=eligible_relations,
                ),
                policy,
            )
            candidate = EffortCandidate(
                effort=candidate_effort,
                stability=_stability(rate, family_rate, policy),
                holdout=_effort_holdouts(
                    index,
                    family_id=family_id,
                    candidate_effort=candidate_effort,
                    policy=policy,
                ),
            )
        decisions.append(
            FamilyEffortDecision(
                family_id=family_id,
                baseline_effort=index.manifest.expected_grid.effort,
                baseline_holdout_correct=qualification_by_family[family_id].correct_count,
                candidate=candidate,
            )
        )
    return tuple(decisions)


def _reported_cost(vote: Vote) -> float | None:
    if vote.cost_usd is not None:
        return vote.cost_usd
    return vote.known_cost_usd if vote.known_cost_usd > 0.0 else None


def _projection_population(
    index: _PilotIndex,
    *,
    family_id: JudgeFamilyId,
    selected_effort: ReasoningEffort,
    admitted_bundles: tuple[BundleId, ...],
) -> tuple[Vote, ...]:
    baseline = index.manifest.expected_grid.effort
    basis = (
        frozenset(admitted_bundles)
        if selected_effort == baseline
        else frozenset({QUALIFICATION_BUNDLE})
    )
    return tuple(
        vote
        for vote in index.clean_votes
        if vote.family_id == family_id
        and vote.effort == selected_effort
        and vote.repeat_index == 0
        and vote.bundle_id in basis
    )


def _mean(values: Sequence[float]) -> float | None:
    return math.fsum(values) / len(values) if values else None


def _economics(
    index: _PilotIndex,
    *,
    effort: tuple[FamilyEffortDecision, ...],
    admissions: tuple[AxisAdmission, ...],
    policy: PilotAnalysisPolicy,
) -> ProjectedEconomics:
    shells = _admitted_shells(admissions)
    framings = _admitted_framings(admissions)
    admitted_bundles = tuple(
        sorted(bundle_id(shell=shell, framing=framing) for shell in shells for framing in framings)
    )
    projected_calls = index.manifest.full_grid_card_count * len(admitted_bundles)
    families: list[FamilyProjection] = []
    for decision in effort:
        population = _projection_population(
            index,
            family_id=decision.family_id,
            selected_effort=decision.selected_effort,
            admitted_bundles=admitted_bundles,
        )
        costs = tuple(_reported_cost(vote) for vote in population)
        reported = tuple(cost for cost in costs if cost is not None)
        tokens = tuple(float(vote.tokens_in + vote.tokens_out) for vote in population)
        mean_tokens = _mean(tokens)
        families.append(
            FamilyProjection(
                family_id=decision.family_id,
                selected_effort=decision.selected_effort,
                cost_basis_bundles=tuple(sorted({vote.bundle_id for vote in population})),
                observations=len(population),
                cost_reported=len(reported),
                measured_cost_per_vote_usd=(
                    _mean(reported) if len(reported) == len(population) else None
                ),
                billed_tokens_per_vote=mean_tokens,
                token_inflation_factor=(
                    mean_tokens / policy.estimated_tokens_per_vote
                    if mean_tokens is not None
                    else None
                ),
                projected_calls=projected_calls,
            )
        )
    return ProjectedEconomics(
        admitted_bundles=admitted_bundles,
        projected_calls=projected_calls,
        families=tuple(families),
    )


def analyze_pilot(
    *,
    manifest: HandoffManifest,
    slice_records: Sequence[SliceRecord],
    cards: Sequence[EvaluationCard],
    votes: Iterable[Vote],
    attempts: Iterable[PhysicalAttempt],
    policy: PilotAnalysisPolicy,
) -> PilotAnalysis:
    """Validate and analyze one in-memory pilot cohort.

    Vote, attempt, and logical-cell identities are indexed once. Subsequent
    decisions use constant-time cell lookup and card-clustered observations.

    Raises:
        PilotAnalysisError: Cohort identity, journal, route, coverage, or
            minimum-panel evidence cannot support a trustworthy decision.

    """
    index = _build_index(
        manifest=manifest,
        slice_records=slice_records,
        cards=cards,
        votes=votes,
        attempts=attempts,
        policy=policy,
    )
    health = _data_health(index, policy)
    _require_healthy_streams(health)
    qualification = _qualifications(index, policy)
    qualified = tuple(row.family_id for row in qualification if row.passed)
    if len(qualified) < policy.minimum_panel_families:
        raise PilotAnalysisError(
            f"pilot requires {policy.minimum_panel_families} qualified families, "
            f"observed {len(qualified)}"
        )
    entropy, contested = _card_entropy(index, qualified, policy)
    non_holdouts = {row.relation_id for row in index.slices.values() if not row.is_holdout}
    non_contested = non_holdouts - set(contested)
    family_rate = _rate(
        _family_observations(index, relations=non_contested, families=qualified),
        policy,
    )
    admissions = _axis_admissions(
        index,
        qualified_families=qualified,
        non_contested=non_contested,
        family_rate=family_rate,
        policy=policy,
    )
    effort = _effort_decisions(
        index,
        qualifications=qualification,
        qualified_families=qualified,
        non_contested=non_contested,
        family_rate=family_rate,
        policy=policy,
    )
    return PilotAnalysis(
        source_hashes=manifest.source_hashes,
        data_health=health,
        qualification=qualification,
        card_entropy=entropy,
        contested_relations=contested,
        repeat_stability=_repeat_stability(
            index,
            qualified_families=qualified,
            policy=policy,
        ),
        family_stability=family_rate,
        admissions=admissions,
        effort=effort,
        economics=_economics(index, effort=effort, admissions=admissions, policy=policy),
    )
