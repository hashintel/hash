"""Typed executor handoff and factorial-pilot analysis schemas."""

from datetime import timedelta
from typing import Annotated, Literal, Self

from openrouter.components import ChatRequestReasoningEffort, ChatResult
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
from atlas_tools.relation_cards.common.cards import RelationId

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
type ReasoningEffort = ChatRequestReasoningEffort
type NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]
type Probability = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
type OpenProbability = Annotated[float, Field(gt=0.0, lt=1.0, allow_inf_nan=False)]
type PositiveFiniteFloat = Annotated[float, Field(gt=0.0, allow_inf_nan=False)]

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
QUALIFICATION_BUNDLE: BundleId = "S1xF1"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class VoteRow(StrictModel):
    """One logical vote, including the optional malformed-output repair call."""

    vote_id: NonEmptyStr
    relation_id: RelationId
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
    attempt_results: list[ChatResult]
    effort: ReasoningEffort
    temperature: Annotated[float, Field(allow_inf_nan=False)] | None
    seed: int | None
    repeat_index: NonNegativeInt
    tokens_in: NonNegativeInt
    tokens_out: NonNegativeInt
    tokens_cached: NonNegativeInt
    tokens_cache_write: NonNegativeInt = 0
    tokens_reasoning: NonNegativeInt = 0
    known_cost_usd: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    cost_complete: bool
    cost_usd: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None
    ts_request: AwareDatetime
    ts_response: AwareDatetime
    latency: Annotated[timedelta, Field(ge=timedelta(0))]

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        expected_bundle = f"{self.shell_id}x{self.framing_id}"
        if self.bundle_id != expected_bundle:
            raise ValueError(f"bundle_id must be {expected_bundle}")
        if self.abstained != (self.verdict == "ABSTAIN"):
            raise ValueError("abstained must be true if and only if verdict is ABSTAIN")
        if (self.initial_raw_completion is not None) != (self.parse_retries == 1):
            raise ValueError("initial_raw_completion must be set iff parse_retries is 1")
        if len(self.attempt_results) != self.parse_retries + 1:
            raise ValueError("attempt_results must contain one native result per model call")
        if any(result.usage is None for result in self.attempt_results):
            raise ValueError("every attempt result must include usage")
        if self.attempt_results[-1].model != self.model_returned:
            raise ValueError("model_returned must match the final native result")
        if self.cost_complete != (self.cost_usd is not None):
            raise ValueError("cost_usd must be set if and only if cost_complete is true")
        if self.cost_usd is not None and self.cost_usd != self.known_cost_usd:
            raise ValueError("complete cost_usd must equal known_cost_usd")
        if self.ts_response < self.ts_request:
            raise ValueError("ts_response must not precede ts_request")
        return self


class AttemptFailure(StrictModel):
    category: Literal["transport", "provider", "response", "routing", "accounting"]
    exception_type: NonEmptyStr
    message: NonEmptyStr
    status_code: int | None = None
    response_body: str | None = None


class PhysicalAttemptRow(StrictModel):
    """One visible physical API request, including failures and malformed-output repairs."""

    attempt_id: Sha256Hex
    vote_id: Sha256Hex
    request_stage: Literal["initial", "repair"]
    stage_attempt: NonNegativeInt
    request_hash: Sha256Hex
    family_id: NonEmptyStr
    provider_slug: NonEmptyStr
    model_requested: NonEmptyStr
    result: ChatResult | None
    failure: AttemptFailure | None
    ts_request: AwareDatetime
    ts_response: AwareDatetime
    latency: Annotated[timedelta, Field(ge=timedelta(0))]

    @model_validator(mode="after")
    def check_outcome(self) -> Self:
        if self.result is None and self.failure is None:
            raise ValueError("an attempt must contain a result or failure")
        # A rejected HTTP-200 response intentionally carries both its native result (for billing
        # and route audit) and the local validation failure. Transport failures carry only failure.
        if self.ts_response < self.ts_request:
            raise ValueError("ts_response must not precede ts_request")
        return self


class SliceRow(StrictModel):
    relation_id: RelationId
    card_hash: Sha256Hex
    prescreen_stratum: NonEmptyStr
    sampling_stratum: NonEmptyStr
    length_quartile: Literal[1, 2, 3, 4]
    pilot_strata: list[NonEmptyStr]
    token_count: NonNegativeInt
    is_holdout: bool
    holdout_verdict: Verdict | None
    sampling_seed: int
    selection_key: Sha256Hex

    @model_validator(mode="after")
    def check_holdout(self) -> Self:
        if self.is_holdout != (self.holdout_verdict is not None):
            raise ValueError("holdout_verdict must be set iff is_holdout is true")
        return self


class ExpectedGrid(StrictModel):
    families: list[NonEmptyStr]
    bundles: list[BundleId]
    relation_ids: list[RelationId]
    effort: ReasoningEffort
    repeat_index: Literal[0] = 0

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
        if set(self.bundles) != set(BUNDLES):
            raise ValueError("rubric-v1 expected_grid must contain the complete 3x3 bundle grid")
        return self


class FullGridExpectation(StrictModel):
    """The exact production Cartesian product authorized by pilot decisions."""

    families: list[NonEmptyStr]
    admitted_shells: list[ShellId]
    admitted_templates: list[FramingId]
    bundles: list[BundleId]
    relation_ids: list[RelationId]
    family_efforts: dict[NonEmptyStr, ReasoningEffort]
    repeat_index: Literal[0] = 0

    @model_validator(mode="after")
    def check_product(self) -> Self:
        for name, values in (
            ("families", self.families),
            ("admitted_shells", self.admitted_shells),
            ("admitted_templates", self.admitted_templates),
            ("bundles", self.bundles),
            ("relation_ids", self.relation_ids),
        ):
            if not values:
                raise ValueError(f"full_grid_expectation.{name} must not be empty")
            if len(values) != len(set(values)):
                raise ValueError(f"full_grid_expectation.{name} contains duplicates")
        expected_bundles = {
            f"{shell}x{template}"
            for shell in self.admitted_shells
            for template in self.admitted_templates
        }
        if set(self.bundles) != expected_bundles:
            raise ValueError("full-grid bundles must equal the admitted shell/template product")
        if set(self.family_efforts) != set(self.families):
            raise ValueError("full-grid family efforts must match the expected families")
        return self


class ExpectedRepeatArm(StrictModel):
    families: list[NonEmptyStr]
    bundle_id: Literal["S1xF1"] = QUALIFICATION_BUNDLE
    relation_ids: list[RelationId]
    effort: ReasoningEffort
    repeat_indices: list[PositiveInt]

    @model_validator(mode="after")
    def check_unique(self) -> Self:
        for name, values in (
            ("families", self.families),
            ("relation_ids", self.relation_ids),
            ("repeat_indices", self.repeat_indices),
        ):
            if not values or len(values) != len(set(values)):
                raise ValueError(f"expected_repeat_arm.{name} must be non-empty and unique")
        return self


class ExpectedEffortArm(StrictModel):
    family_efforts: dict[NonEmptyStr, ReasoningEffort]
    bundle_id: Literal["S1xF1"] = QUALIFICATION_BUNDLE
    relation_ids: list[RelationId]
    repeat_index: Literal[0] = 0

    @model_validator(mode="after")
    def check_unique(self) -> Self:
        if not self.family_efforts:
            raise ValueError("expected_effort_arm.family_efforts must not be empty")
        if not self.relation_ids or len(self.relation_ids) != len(set(self.relation_ids)):
            raise ValueError("expected_effort_arm.relation_ids must be non-empty and unique")
        return self


class SliceDerivation(StrictModel):
    algorithm: Literal["stratified-hash-v1"]
    sampling_seed: int
    requested_non_holdouts: PositiveInt
    eligible_non_holdouts: NonNegativeInt
    selected_non_holdouts: NonNegativeInt
    cards_hash: Sha256Hex
    sampling_config_hash: Sha256Hex
    selection_hash: Sha256Hex


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
    provider_slug: NonEmptyStr
    provider_name: NonEmptyStr
    model: NonEmptyStr

    # The complete judges.yaml entry is a snapshot and may carry pricing/tier metadata that
    # rubric-v1 analysis does not interpret.
    model_config = ConfigDict(extra="allow", frozen=True)


class HandoffManifest(StrictModel):
    schema_version: Literal[2]
    expected_grid: ExpectedGrid
    expected_repeat_arm: ExpectedRepeatArm
    expected_effort_arm: ExpectedEffortArm | None
    slice_derivation: SliceDerivation
    run_dates: RunDates
    judges: list[JudgePin]
    prompt_pack_hash: Sha256Hex
    rubric_version: Literal["rubric-v1"]
    full_grid_card_count: PositiveInt
    source_hashes: dict[str, Sha256Hex]
    openrouter_sdk_version: NonEmptyStr
    openrouter_openapi_version: NonEmptyStr
    executor_config: dict[str, JsonValue]

    @model_validator(mode="after")
    def check_grid(self) -> Self:
        judge_families = [judge.family_id for judge in self.judges]
        if len(judge_families) != len(set(judge_families)):
            raise ValueError("judges contains duplicate family_id values")
        if set(judge_families) != set(self.expected_grid.families):
            raise ValueError("judges and expected_grid.families must contain the same families")
        if set(self.expected_repeat_arm.families) != set(judge_families):
            raise ValueError("repeat-arm families must match expected-grid families")
        if self.expected_repeat_arm.effort != self.expected_grid.effort:
            raise ValueError("repeat arm must use the grid effort")
        if self.expected_effort_arm is not None:
            if not set(self.expected_effort_arm.family_efforts) <= set(judge_families):
                raise ValueError("effort-arm families must be configured judges")
            if any(
                effort == self.expected_grid.effort
                for effort in self.expected_effort_arm.family_efforts.values()
            ):
                raise ValueError("effort-arm settings must differ from the grid effort")
        return self


class FullGridManifest(StrictModel):
    """Finalized production-grid artifact contract, separate from the pilot handoff."""

    schema_version: Literal[1] = 1
    expectation: FullGridExpectation
    run_dates: RunDates
    judges: list[JudgePin]
    decisions_hash: Sha256Hex
    prompt_pack_hash: Sha256Hex
    rubric_version: Literal["rubric-v1"]
    source_hashes: dict[str, Sha256Hex]
    plan_hash: Sha256Hex
    request_contract_hash: Sha256Hex
    openrouter_sdk_version: NonEmptyStr
    openrouter_openapi_version: NonEmptyStr
    executor_config: dict[str, JsonValue]
    executor_policy: dict[str, JsonValue]
    request_policy: dict[str, JsonValue]

    @model_validator(mode="after")
    def check_contract(self) -> Self:
        judge_families = [judge.family_id for judge in self.judges]
        if len(judge_families) != len(set(judge_families)):
            raise ValueError("judges contains duplicate family_id values")
        if set(judge_families) != set(self.expectation.families):
            raise ValueError("judges and full-grid families must contain the same families")
        required_hashes = {
            "attempts.jsonl",
            "cards.jsonl",
            "cards.manifest.json",
            "decisions.json",
            "votes.jsonl",
        }
        if set(self.source_hashes) != required_hashes:
            raise ValueError("full-grid source_hashes must contain exactly the bound artifacts")
        if self.source_hashes["decisions.json"] != self.decisions_hash:
            raise ValueError("decisions_hash must match source_hashes['decisions.json']")
        return self


class AnalysisPolicy(StrictModel):
    version: Literal["rubric-v1-analysis-3"] = "rubric-v1-analysis-3"
    bootstrap_resamples: Literal[1000] = 1000
    bootstrap_seed: Literal[0] = 0
    ci_level: OpenProbability = 0.95
    minimum_bootstrap_defined_rate: OpenProbability = 0.95
    absolute_flip_ceiling: Probability = 0.05
    stream_missing_rerun_rate: Probability = 0.02
    routing_rerun_rate: Probability = 0.005
    abstention_flag_rate: Probability = 0.05
    estimated_tokens_per_vote: Literal[7500] = 7500
    dirichlet_alpha: PositiveFiniteFloat = 1.0


class Estimate(StrictModel):
    est: float | None
    lo: float | None
    hi: float | None
    n: NonNegativeInt
    bootstrap_resamples: NonNegativeInt = 0
    bootstrap_defined: NonNegativeInt = 0
    successes: NonNegativeInt | None = None

    @model_validator(mode="after")
    def check_interval(self) -> Self:
        if self.bootstrap_defined > self.bootstrap_resamples:
            raise ValueError("defined bootstrap draws cannot exceed requested draws")
        if self.successes is not None and self.successes > self.n:
            raise ValueError("successes cannot exceed n")
        if self.est is None:
            if self.lo is not None or self.hi is not None:
                raise ValueError("an undefined estimate cannot have interval bounds")
            return self
        if (self.lo is None) != (self.hi is None):
            raise ValueError("confidence interval bounds must be both set or both null")
        if self.lo is not None and self.hi is not None and self.lo > self.hi:
            raise ValueError("confidence interval lower bound must not exceed upper bound")
        return self


class DurationEstimate(StrictModel):
    est: timedelta | None
    lo: timedelta | None
    hi: timedelta | None
    n: NonNegativeInt
    bootstrap_resamples: NonNegativeInt = 0
    bootstrap_defined: NonNegativeInt = 0

    @model_validator(mode="after")
    def check_interval(self) -> Self:
        if self.bootstrap_defined > self.bootstrap_resamples:
            raise ValueError("defined bootstrap draws cannot exceed requested draws")
        if self.est is None:
            if self.lo is not None or self.hi is not None:
                raise ValueError("an undefined duration cannot have interval bounds")
            return self
        if (self.lo is None) != (self.hi is None):
            raise ValueError("duration interval bounds must be both set or both null")
        if self.lo is not None and self.hi is not None and self.lo > self.hi:
            raise ValueError("duration interval lower bound must not exceed upper bound")
        return self


class CoverageStream(StrictModel):
    family_id: str
    bundle_id: BundleId
    expected: NonNegativeInt
    raw_observed: NonNegativeInt
    routing_dropped: NonNegativeInt
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
    latency: DurationEstimate


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
    bundle_correctness: dict[BundleId, dict[RelationId, bool]]


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
    expected_pairs: NonNegativeInt = 0
    matched_pairs: NonNegativeInt = 0
    missing_pairs: NonNegativeInt = 0


class AgreementResults(StrictModel):
    bundle_kappa_by_family: dict[str, dict[BundleId, dict[BundleId, Estimate]]]
    qualification_family_kappa: dict[str, dict[str, Estimate]]
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
    marginal_cost: Estimate
    cost_eligible_n: NonNegativeInt
    cost_reported_n: NonNegativeInt
    yield_per_dollar_estimate: Estimate
    rankable: bool


class NominationSeed(StrictModel):
    relation_id: RelationId
    card_hash: Sha256Hex
    entropy: float
    vote_counts: dict[Verdict, NonNegativeInt]
    n_votes: NonNegativeInt
    abstentions: NonNegativeInt


class CardPosterior(StrictModel):
    relation_id: RelationId
    card_hash: Sha256Hex
    counts: dict[Verdict, NonNegativeInt]
    probabilities: dict[Verdict, float]
    n_votes: NonNegativeInt
    abstentions: NonNegativeInt


class FamilyCostAudit(StrictModel):
    family_id: str
    selected_effort: ReasoningEffort
    cost_basis_bundles: list[BundleId]
    n: NonNegativeInt
    cost_reported_n: NonNegativeInt
    measured_cost_per_vote_usd: Estimate
    projected_calls: NonNegativeInt
    projected_cost: Estimate
    billed_tokens_per_vote: Estimate
    token_inflation_factor: Estimate


class EffortDecision(StrictModel):
    family_id: str
    baseline_effort: ReasoningEffort
    selected_effort: ReasoningEffort
    candidate_effort: ReasoningEffort | None
    baseline_holdout_correct: NonNegativeInt
    candidate_holdout_correct: NonNegativeInt | None
    non_contested_flip: Estimate | None
    rescues: NonNegativeInt
    regressions: NonNegativeInt
    reasons: list[str]


class AnalysisDecisions(StrictModel):
    schema_version: Literal[2]
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
