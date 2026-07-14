"""Validate durable pilot and grid identities independently of storage layout.

Run state protects resumability; manifests describe completed output. Both bind
exact source hashes and semantic request pins. These models preserve existing
artifact schemas while replacing mutable arrays with tuples in memory.
"""

from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, Field, JsonValue, NonNegativeInt, PositiveInt, model_validator

from atlas_tools.common import Sha256Hex
from atlas_tools.relation.evaluation.domain._collection import FrozenMapping
from atlas_tools.relation.evaluation.domain._model import FrozenModel
from atlas_tools.relation.evaluation.domain.configuration import (
    GridJudge,
    JudgeConfig,
    JudgeRequestSpec,
    OutputTokenLimit,
    PilotRunConfig,
)
from atlas_tools.relation.evaluation.domain.identity import (
    BUNDLES,
    BundleId,
    CardHash,
    FiniteFloat,
    JudgeFamilyId,
    ModelId,
    NonEmptyStr,
    NonNegativeFiniteFloat,
    OpenRouterRegion,
    PlanHash,
    PositiveFiniteFloat,
    Probability,
    PromptPackHash,
    ProviderName,
    ProviderSlug,
    ReasoningEffort,
    Verdict,
)
from atlas_tools.relation_cards.common.cards import RelationId


class SliceRecord(FrozenModel):
    """Persist why one card did or did not enter the fixed pilot slice."""

    kind: Literal["pilot-slice"] = "pilot-slice"
    schema_version: Literal[2] = 2
    relation_id: RelationId
    card_hash: CardHash
    prescreen_stratum: NonEmptyStr
    sampling_stratum: NonEmptyStr
    length_quartile: Literal[1, 2, 3, 4]
    pilot_strata: tuple[NonEmptyStr, ...]
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


class SliceDerivation(FrozenModel):
    """Bind the sampling inputs and selected row set to content hashes."""

    algorithm: Literal["stratified-hash-v1"]
    sampling_seed: int
    requested_non_holdouts: PositiveInt
    eligible_non_holdouts: NonNegativeInt
    selected_non_holdouts: NonNegativeInt
    cards_hash: Sha256Hex
    sampling_config_hash: Sha256Hex
    selection_hash: Sha256Hex


class ExpectedGrid(FrozenModel):
    """Describe every repeat-zero cell required by the factorial pilot."""

    families: tuple[JudgeFamilyId, ...]
    bundles: tuple[BundleId, ...]
    relation_ids: tuple[RelationId, ...]
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
            raise ValueError("rubric-v1 requires the complete 3 by 3 bundle grid")
        return self


class ExpectedRepeatArm(FrozenModel):
    """Describe repeat work attached to the qualification bundle."""

    families: tuple[JudgeFamilyId, ...]
    bundle_id: Literal["S1xF1"] = "S1xF1"
    relation_ids: tuple[RelationId, ...]
    effort: ReasoningEffort
    repeat_indices: tuple[PositiveInt, ...]

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


class ExpectedEffortArm(FrozenModel):
    """Describe alternative-effort work attached to the qualification bundle."""

    family_efforts: FrozenMapping[JudgeFamilyId, ReasoningEffort]
    bundle_id: Literal["S1xF1"] = "S1xF1"
    relation_ids: tuple[RelationId, ...]
    repeat_index: Literal[0] = 0

    @model_validator(mode="after")
    def check_unique(self) -> Self:
        if not self.family_efforts:
            raise ValueError("family_efforts must not be empty")
        if not self.relation_ids or len(self.relation_ids) != len(set(self.relation_ids)):
            raise ValueError("effort relation_ids must be non-empty and unique")
        return self


class RunDates(FrozenModel):
    """Bound a run to ordered wall-clock endpoints."""

    started_at: AwareDatetime
    completed_at: AwareDatetime

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.completed_at < self.started_at:
            raise ValueError("completed_at must not precede started_at")
        return self


class _JudgePin[Judge: JudgeRequestSpec](FrozenModel):
    judge: Judge

    @property
    def family_id(self) -> JudgeFamilyId:
        return self.judge.family_id

    @property
    def provider_slug(self) -> ProviderSlug:
        return self.judge.provider_slug

    @property
    def provider_name(self) -> ProviderName:
        return self.judge.provider_name

    @property
    def openrouter_region(self) -> OpenRouterRegion:
        return self.judge.openrouter_region

    @property
    def model(self) -> ModelId:
        return self.judge.model

    @property
    def temperature(self) -> FiniteFloat | None:
        return self.judge.temperature

    @property
    def seed(self) -> int | None:
        return self.judge.seed

    @property
    def output_token_limit(self) -> OutputTokenLimit:
        return self.judge.output_token_limit


class PilotJudgePin(_JudgePin[JudgeConfig]):
    """Snapshot one complete pilot judge contract."""

    kind: Literal["pilot-judge"] = "pilot-judge"

    @property
    def higher_effort(self) -> ReasoningEffort | None:
        return self.judge.higher_effort


class GridJudgePin(_JudgePin[GridJudge]):
    """Snapshot one complete production-grid judge contract."""

    kind: Literal["grid-judge"] = "grid-judge"

    @property
    def effort(self) -> ReasoningEffort:
        return self.judge.effort

    @property
    def pilot_cost_per_vote_usd(self) -> PositiveFiniteFloat:
        return self.judge.pilot_cost_per_vote_usd


type JudgePin = Annotated[PilotJudgePin | GridJudgePin, Field(discriminator="kind")]


class PilotRunState(FrozenModel):
    """Identify the exact pilot plan accepted by append-only journals."""

    schema_version: Literal[3] = 3
    plan_hash: PlanHash
    request_contract_hash: Sha256Hex
    source_hashes: FrozenMapping[str, Sha256Hex]
    prompt_pack_hash: PromptPackHash
    slice_hash: Sha256Hex
    expected_votes: PositiveInt
    openrouter_sdk_version: NonEmptyStr
    openrouter_openapi_version: NonEmptyStr


class GridRunState(FrozenModel):
    """Identify a dynamic two-phase grid without pretending it has a fixed plan hash."""

    schema_version: Literal[2] = 2
    request_contract_hash: Sha256Hex
    source_hashes: FrozenMapping[str, Sha256Hex]
    prompt_pack_hash: PromptPackHash
    rubric_version: Literal["rubric-v1"]
    panel_version: PositiveInt
    panel_frozen: bool
    pool_cards: PositiveInt
    corpus_hash: Sha256Hex
    imported_votes_hash: Sha256Hex
    imported_attempts_hash: Sha256Hex
    openrouter_sdk_version: NonEmptyStr
    openrouter_openapi_version: NonEmptyStr

    @model_validator(mode="after")
    def check_sources(self) -> Self:
        required = {
            "cards.jsonl",
            "cards.manifest.json",
            "judges-panel",
            "pilot-attempts.jsonl",
            "pilot-manifest.json",
            "pilot-votes.jsonl",
        }
        if set(self.source_hashes) != required:
            raise ValueError("grid state must bind deck, panel, and complete pilot provenance")
        if not self.panel_frozen:
            raise ValueError("a production grid requires a frozen panel")
        return self


class HandoffManifest(FrozenModel):
    """Describe one completed normalized pilot handoff."""

    schema_version: Literal[3] = 3
    expected_grid: ExpectedGrid
    expected_repeat_arm: ExpectedRepeatArm
    expected_effort_arm: ExpectedEffortArm | None
    slice_derivation: SliceDerivation
    run_dates: RunDates
    judges: tuple[PilotJudgePin, ...]
    prompt_pack_hash: PromptPackHash
    rubric_version: Literal["rubric-v1"]
    full_grid_card_count: PositiveInt
    source_hashes: FrozenMapping[str, Sha256Hex]
    openrouter_sdk_version: NonEmptyStr
    openrouter_openapi_version: NonEmptyStr
    executor_config: FrozenMapping[str, JsonValue]

    @model_validator(mode="after")
    def check_arms(self) -> Self:
        families = tuple(judge.family_id for judge in self.judges)
        if len(families) != len(set(families)):
            raise ValueError("judges contains duplicate family IDs")
        if set(families) != set(self.expected_grid.families):
            raise ValueError("judges and expected grid must contain the same families")
        if set(self.expected_repeat_arm.families) != set(families):
            raise ValueError("repeat families must match the expected grid")
        if self.expected_repeat_arm.effort != self.expected_grid.effort:
            raise ValueError("repeat arm must use the grid effort")
        effort = self.expected_effort_arm
        if effort is not None:
            if not set(effort.family_efforts) <= set(families):
                raise ValueError("effort families must belong to configured judges")
            if any(value == self.expected_grid.effort for value in effort.family_efforts.values()):
                raise ValueError("alternative effort must differ from grid effort")
        return self


class CorpusRecord(FrozenModel):
    """Make every deck inclusion or fixed-shot exclusion explicit."""

    kind: Literal["grid-corpus"] = "grid-corpus"
    schema_version: Literal[2] = 2
    relation_id: RelationId
    card_hash: CardHash
    prescreen_stratum: NonEmptyStr
    token_count: NonNegativeInt
    is_holdout: bool
    holdout_verdict: Verdict | None
    is_shot_excluded: bool

    @model_validator(mode="after")
    def check_flags(self) -> Self:
        if self.is_holdout != (self.holdout_verdict is not None):
            raise ValueError("holdout_verdict must be set iff is_holdout is true")
        if self.is_holdout and self.is_shot_excluded:
            raise ValueError("a holdout cannot be fixed-shot excluded")
        return self


class FamilyGridCounts(FrozenModel):
    """Account for grid votes and whether their complete billed cost is known."""

    family_id: JudgeFamilyId
    imported_votes: NonNegativeInt
    fresh_baseline_votes: NonNegativeInt
    refinement_votes: NonNegativeInt
    abstentions: NonNegativeInt
    known_cost_usd: NonNegativeFiniteFloat
    cost_complete: bool


class GridManifest(FrozenModel):
    """Describe one finalized normalized production grid."""

    schema_version: Literal[3] = 3
    bundle_id: Literal["S1xF1"] = "S1xF1"
    panel_version: PositiveInt
    panel_frozen: bool
    judges: tuple[GridJudgePin, ...]
    pilot_config: PilotRunConfig
    manual_prunes: FrozenMapping[JudgeFamilyId, NonEmptyStr]
    reserve_topology: Literal["dormant"] = "dormant"
    run_dates: RunDates
    prompt_pack_hash: PromptPackHash
    rubric_version: Literal["rubric-v1"]
    source_hashes: FrozenMapping[str, Sha256Hex]
    request_contract_hash: Sha256Hex
    pool_cards: PositiveInt
    shot_excluded_cards: NonNegativeInt
    holdout_cards: NonNegativeInt
    refined_cards: NonNegativeInt
    realized_trigger_rate: Probability
    family_counts: tuple[FamilyGridCounts, ...]
    total_votes: NonNegativeInt
    openrouter_sdk_version: NonEmptyStr
    openrouter_openapi_version: NonEmptyStr
    executor_config: FrozenMapping[str, JsonValue]
    executor_policy: FrozenMapping[str, JsonValue]
    request_policy: FrozenMapping[str, JsonValue]

    def _check_panel_contract(self) -> None:
        families = tuple(judge.family_id for judge in self.judges)
        if len(families) != len(set(families)):
            raise ValueError("judges contains duplicate family IDs")
        if {row.family_id for row in self.family_counts} != set(families):
            raise ValueError("family counts must cover exactly the seated judges")
        overlap = sorted(set(self.manual_prunes) & set(families))
        if overlap:
            raise ValueError(f"manually pruned families cannot hold seats: {overlap}")

    def _check_pilot_contract(self) -> None:
        pilot_judges = {judge.family_id: judge for judge in self.pilot_config.judges}
        for pin in self.judges:
            pilot_judge = pilot_judges.get(pin.family_id)
            if pilot_judge is None:
                raise ValueError(f"pilot config lacks seated family {pin.family_id}")
            if pilot_judge.as_request_spec() != pin.judge.as_request_spec():
                raise ValueError(f"pilot request pins differ for seated family {pin.family_id}")
        if self.pilot_config.rubric_version != self.rubric_version:
            raise ValueError("pilot and grid rubric versions must match")

    def _check_artifact_contract(self) -> None:
        required_hashes = {
            "attempts.jsonl",
            "cards.jsonl",
            "cards.manifest.json",
            "corpus.jsonl",
            "imported-attempts.jsonl",
            "imported-votes.jsonl",
            "judges-panel",
            "pilot-attempts.jsonl",
            "pilot-manifest.json",
            "pilot-votes.jsonl",
            "votes.jsonl",
        }
        if set(self.source_hashes) != required_hashes:
            raise ValueError("grid source hashes must contain exactly the bound artifacts")
        if self.refined_cards > self.pool_cards:
            raise ValueError("refined cards cannot exceed pool cards")
        expected_votes = sum(
            row.imported_votes + row.fresh_baseline_votes + row.refinement_votes
            for row in self.family_counts
        )
        if self.total_votes != expected_votes:
            raise ValueError("total votes must equal the family-count sum")

    @model_validator(mode="after")
    def check_contract(self) -> Self:
        self._check_panel_contract()
        self._check_pilot_contract()
        self._check_artifact_contract()
        return self
