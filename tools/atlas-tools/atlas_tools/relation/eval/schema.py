"""Typed handoff and output schemas for the factorial-pilot analysis."""

from typing import Annotated, Literal, Self

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    NonNegativeInt,
    PositiveInt,
    StringConstraints,
    model_validator,
)

from atlas_tools.common import Sha256Hex

type Verdict = Literal["coincident", "proximal", "overlay", "unclear"]
type VoteVerdict = Literal["coincident", "proximal", "overlay", "unclear", "ABSTAIN"]
type ShellId = Literal["S1", "S2", "S3"]
type FramingId = Literal["F1", "F2", "F3"]
type BundleId = Literal[
    "S1xF1",
    "S1xF2",
    "S1xF3",
    "S2xF1",
    "S2xF2",
    "S2xF3",
    "S3xF1",
    "S3xF2",
    "S3xF3",
]
type Axis = Literal["card", "family", "template", "shell", "repeat"]
type MarginalAxis = Literal["shell", "template", "family"]
type FlipAxis = Literal["shell", "template", "family", "repeat"]
type ContestStratum = Literal["all", "contested", "non-contested"]
type AdmissionAxis = Literal["shell", "template"]
type EscalationAxisName = Literal["family", "template", "shell", "repeat"]
type NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]

VERDICTS: tuple[Verdict, ...] = ("coincident", "proximal", "overlay", "unclear")
SHELLS: tuple[ShellId, ...] = ("S1", "S2", "S3")
FRAMINGS: tuple[FramingId, ...] = ("F1", "F2", "F3")
BUNDLES: tuple[BundleId, ...] = (
    "S1xF1",
    "S1xF2",
    "S1xF3",
    "S2xF1",
    "S2xF2",
    "S2xF3",
    "S3xF1",
    "S3xF2",
    "S3xF3",
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class VoteRow(BaseModel):
    """One logical vote, including any malformed-response retry."""

    vote_id: NonEmptyStr
    relation_id: NonEmptyStr
    card_hash: Sha256Hex
    family_id: NonEmptyStr
    provider: NonEmptyStr
    model_returned: NonEmptyStr
    shell_id: ShellId
    framing_id: FramingId
    bundle_id: BundleId
    rubric_version: NonEmptyStr
    prompt_pack_hash: Sha256Hex
    verdict: VoteVerdict
    reason: str
    raw_completion: str
    parse_retries: Literal[0, 1]
    abstained: bool
    initial_raw_completion: str | None = None
    attempt_models: list[NonEmptyStr] = Field(default_factory=list)
    attempt_providers: list[NonEmptyStr] = Field(default_factory=list)
    completion_ids: list[NonEmptyStr] = Field(default_factory=list)
    provider_usage: list[dict[str, JsonValue]] = Field(default_factory=list)
    effort: NonEmptyStr
    temperature: Annotated[float, Field(allow_inf_nan=False)] | None
    seed: int | None
    repeat_index: NonNegativeInt
    tokens_in: NonNegativeInt
    tokens_out: NonNegativeInt
    tokens_cached: NonNegativeInt
    cost_usd: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None
    ts_request: AwareDatetime
    ts_response: AwareDatetime

    # Providers expose different optional hidden-token counters. Preserve those fields while
    # still requiring every cross-provider field above.
    model_config = ConfigDict(extra="allow", frozen=True)

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        expected_bundle = f"{self.shell_id}x{self.framing_id}"
        if self.bundle_id != expected_bundle:
            raise ValueError(f"bundle_id must be {expected_bundle}")
        if self.abstained != (self.verdict == "ABSTAIN"):
            raise ValueError("abstained must be true if and only if verdict is ABSTAIN")
        if (self.initial_raw_completion is not None) != (self.parse_retries == 1):
            raise ValueError("initial_raw_completion must be set if and only if parse_retries is 1")
        attempt_counts = {
            len(values)
            for values in (
                self.attempt_models,
                self.attempt_providers,
                self.completion_ids,
                self.provider_usage,
            )
            if values
        }
        if len(attempt_counts) > 1:
            raise ValueError("populated attempt audit fields must have equal lengths")
        if attempt_counts and attempt_counts != {self.parse_retries + 1}:
            raise ValueError("attempt audit fields must contain one entry per API call")
        if self.ts_response < self.ts_request:
            raise ValueError("ts_response must not precede ts_request")
        return self


class SliceRow(StrictModel):
    relation_id: NonEmptyStr
    card_hash: Sha256Hex
    prescreen_stratum: NonEmptyStr
    token_count: NonNegativeInt
    is_holdout: bool
    holdout_verdict: Verdict | None
    sampling_seed: int

    @model_validator(mode="after")
    def check_holdout(self) -> Self:
        if self.is_holdout != (self.holdout_verdict is not None):
            raise ValueError("holdout_verdict must be set if and only if is_holdout is true")
        return self


class ExpectedGrid(StrictModel):
    families: list[NonEmptyStr]
    bundles: list[BundleId]
    relation_ids: list[NonEmptyStr]

    @model_validator(mode="after")
    def check_unique(self) -> Self:
        for name, values in (
            ("families", self.families),
            ("bundles", self.bundles),
            ("relation_ids", self.relation_ids),
        ):
            if not values:
                raise ValueError(f"expected_grid.{name} must not be empty")
            if len(values) != len(set(values)):
                raise ValueError(f"expected_grid.{name} contains duplicates")
        return self


class RunDates(StrictModel):
    started_at: AwareDatetime
    completed_at: AwareDatetime

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.completed_at < self.started_at:
            raise ValueError("completed_at must not precede started_at")
        return self


class JudgePin(BaseModel):
    family_id: NonEmptyStr
    provider: NonEmptyStr
    model: NonEmptyStr

    # The complete judges.yaml entry is a snapshot and may carry pricing/tier metadata that
    # is not interpreted by rubric-v1 analysis.
    model_config = ConfigDict(extra="allow", frozen=True)


class HandoffManifest(StrictModel):
    schema_version: Literal[1]
    expected_grid: ExpectedGrid
    run_dates: RunDates
    judges: list[JudgePin]
    prompt_pack_hash: Sha256Hex
    rubric_version: NonEmptyStr
    baseline_effort: NonEmptyStr
    full_grid_card_count: PositiveInt
    source_hashes: dict[str, Sha256Hex] = Field(default_factory=dict)
    executor_config: dict[str, JsonValue] | None = None

    @model_validator(mode="after")
    def check_grid(self) -> Self:
        judge_families = [judge.family_id for judge in self.judges]
        if len(judge_families) != len(set(judge_families)):
            raise ValueError("judges contains duplicate family_id values")
        if set(judge_families) != set(self.expected_grid.families):
            raise ValueError("judges and expected_grid.families must contain the same families")
        return self


class AnalysisPolicy(StrictModel):
    version: Literal["rubric-v1-analysis-1"] = "rubric-v1-analysis-1"
    bootstrap_resamples: Literal[1000] = 1000
    bootstrap_seed: Literal[0] = 0
    ci_level: float = 0.95
    absolute_flip_ceiling: float = 0.05
    stream_missing_rerun_rate: float = 0.02
    routing_rerun_rate: float = 0.005
    abstention_flag_rate: float = 0.05
    estimated_tokens_per_vote: Literal[7500] = 7500
    dirichlet_alpha: float = 1.0


class Estimate(StrictModel):
    est: float | None
    lo: float | None
    hi: float | None
    n: NonNegativeInt

    @model_validator(mode="after")
    def check_interval(self) -> Self:
        values = (self.est, self.lo, self.hi)
        if all(value is None for value in values):
            return self
        if any(value is None for value in values):
            raise ValueError("estimate and interval bounds must be all set or all null")
        est, lo, hi = self.est, self.lo, self.hi
        if est is None or lo is None or hi is None:
            raise ValueError("estimate and interval bounds must be all set or all null")
        if not lo <= est <= hi:
            raise ValueError("estimate must fall inside its confidence interval")
        return self


class CoverageStream(StrictModel):
    family_id: str
    bundle_id: BundleId
    expected: NonNegativeInt
    observed: NonNegativeInt
    missing: NonNegativeInt
    missing_rate: float
    rerun_required: bool


class RoutingStream(StrictModel):
    family_id: str
    bundle_id: BundleId
    observed: NonNegativeInt
    violations: NonNegativeInt
    violation_rate: float
    rerun_required: bool


class FamilyBundleHealth(StrictModel):
    family_id: str
    bundle_id: BundleId
    n: NonNegativeInt
    abstention_rate: Estimate
    parse_retry_rate: Estimate
    prompt_compat_flag: bool


class FamilyCostHealth(StrictModel):
    family_id: str
    n: NonNegativeInt
    cost_reported_n: NonNegativeInt
    mean_cost_usd: Estimate
    tokens_per_vote: Estimate
    token_inflation_factor: Estimate
    latency_seconds: Estimate


class DataHealth(StrictModel):
    votes_loaded: NonNegativeInt
    clean_votes: NonNegativeInt
    duplicate_vote_ids: list[str]
    contaminated_vote_ids: list[str]
    routing_violations: NonNegativeInt
    reasons_over_60_words: NonNegativeInt
    reason_over_60_word_rate: Estimate
    coverage: list[CoverageStream]
    routing: list[RoutingStream]
    family_bundle: list[FamilyBundleHealth]
    family_cost: list[FamilyCostHealth]
    warnings: list[str]


class QualificationResult(StrictModel):
    family_id: str
    correct_count: NonNegativeInt
    total_count: NonNegativeInt
    p1382_correct: bool
    p2634_correct: bool
    passed: bool
    bundle_correctness: dict[BundleId, dict[str, bool]]


class MarginalResult(StrictModel):
    axis: MarginalAxis
    level: str
    verdict: Verdict
    rate: Estimate


class FlipResult(StrictModel):
    axis: FlipAxis
    level_pair: str
    contest_stratum: ContestStratum
    prescreen_stratum: str | None
    rate: Estimate


class AgreementResults(StrictModel):
    bundle_kappa_by_family: dict[str, dict[BundleId, dict[BundleId, Estimate]]]
    canonical_family_kappa: dict[str, dict[str, Estimate]]
    krippendorff_alpha: Estimate


class OrderingCheck(StrictModel):
    rates: dict[Axis, Estimate]
    healthy_order_holds: bool


class AxisStatistics(StrictModel):
    entropy_tercile_cuts: tuple[float, float]
    marginals: list[MarginalResult]
    noise_floor: Estimate
    flips: list[FlipResult]
    agreement: AgreementResults
    ordering: OrderingCheck


class AdmissionDecision(StrictModel):
    axis: AdmissionAxis
    level: str
    admitted: bool
    non_contested_flip: Estimate
    family_flip: Estimate
    reasons: list[str]


class EscalationAxis(StrictModel):
    axis: EscalationAxisName
    disagreement_yield: Estimate
    marginal_cost_usd: float | None
    marginal_cost: Estimate
    yield_per_dollar: float | None
    yield_per_dollar_estimate: Estimate


class NominationSeed(StrictModel):
    relation_id: str
    card_hash: Sha256Hex
    entropy: float
    vote_counts: dict[Verdict, NonNegativeInt]
    n_votes: NonNegativeInt


class CardPosterior(StrictModel):
    relation_id: str
    card_hash: Sha256Hex
    counts: dict[Verdict, NonNegativeInt]
    probabilities: dict[Verdict, float]
    n_votes: NonNegativeInt


class FamilyCostAudit(StrictModel):
    family_id: str
    n: NonNegativeInt
    cost_reported_n: NonNegativeInt
    measured_cost_per_vote_usd: Estimate
    projected_calls: NonNegativeInt
    projected_cost_usd: float | None
    projected_cost: Estimate
    billed_tokens_per_vote: Estimate
    token_inflation_factor: Estimate


class EffortDecision(StrictModel):
    family_id: str
    baseline_effort: str
    selected_effort: str
    candidate_effort: str | None
    baseline_holdout_correct: NonNegativeInt
    candidate_holdout_correct: NonNegativeInt | None
    non_contested_flip: Estimate | None
    rescues: NonNegativeInt
    regressions: NonNegativeInt
    reasons: list[str]


class AnalysisDecisions(StrictModel):
    schema_version: Literal[1]
    policy: AnalysisPolicy
    input_hashes: dict[str, Sha256Hex]
    prompt_pack_hash: Sha256Hex
    rubric_version: str
    sampling_seeds: list[int]
    pruned_families: list[str]
    admitted_shells: list[ShellId]
    admitted_templates: list[FramingId]
    escalation_order: list[EscalationAxisName]
    floor_error_bar: Estimate
    nomination_seeds: list[NominationSeed]
    projected_grid_cost_usd: float | None
    projected_grid_cost: Estimate
    per_card_posteriors: list[CardPosterior]
    effort_policy: list[EffortDecision]
    data_health: DataHealth
    qualification: list[QualificationResult]
    axis_statistics: AxisStatistics
    admissions: list[AdmissionDecision]
    escalation: list[EscalationAxis]
    cost_audit: list[FamilyCostAudit]
