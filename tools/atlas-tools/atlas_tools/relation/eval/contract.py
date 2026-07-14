"""Typed configuration, input, and execution contracts for relation evaluation."""

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Annotated, ClassVar, Literal, Protocol, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    TypeAdapter,
    model_validator,
)

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.concat import ConcatCardRow
from atlas_tools.relation.eval.prompt import PromptPrefix
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    FRAMINGS,
    QUALIFICATION_BUNDLE,
    BundleId,
    FramingId,
    JudgeFamilyId,
    ReasoningEffort,
    RelationFamilyId,
    ShellId,
    SliceDerivation,
    SliceRow,
)
from atlas_tools.relation_cards.common.cards import RelationId, RelationNamespace

RUBRIC_VERSION = "rubric-v1"
MINIMUM_RUNG_SPAN = 2
HTTP_CLIENT_ERROR_START = 400
HTTP_SERVER_ERROR_START = 500
RETRYABLE_CLIENT_ERROR_STATUS_CODES = frozenset({408, 425, 429})

type OpenRouterRegion = Literal["global", "eu"]
type RequestStage = Literal["initial", "repair"]
type HttpErrorStatusCode = Annotated[int, Field(ge=400, le=599)]


class SliceSamplingConfig(BaseModel):
    """Versioned deterministic sampling policy for a pilot slice."""

    algorithm: Literal["stratified-hash-v1"] = "stratified-hash-v1"
    seed: int
    non_holdout_count: PositiveInt = 144

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class MaxTokensLimit(BaseModel):
    """An output limit sent through OpenRouter's portable ``max_tokens`` field."""

    parameter: Literal["max_tokens"] = "max_tokens"
    tokens: PositiveInt

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class MaxCompletionTokensLimit(BaseModel):
    """An output limit sent through OpenRouter's completion-token field."""

    parameter: Literal["max_completion_tokens"] = "max_completion_tokens"
    tokens: PositiveInt

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


type OutputTokenLimit = Annotated[
    MaxTokensLimit | MaxCompletionTokensLimit,
    Field(discriminator="parameter"),
]


class JudgeConfig(BaseModel):
    """One judge model and its exact OpenRouter provider endpoint."""

    provider_slug: str = Field(min_length=1)
    provider_name: str = Field(min_length=1)
    openrouter_region: OpenRouterRegion = "global"
    model: str = Field(min_length=1)
    temperature: float | None = Field(default=0.0, allow_inf_nan=False)
    seed: int | None = 0
    higher_effort: ReasoningEffort | None = None
    output_token_limit: OutputTokenLimit = MaxCompletionTokensLimit(tokens=256)

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    @property
    def family_id(self) -> JudgeFamilyId:
        """Derive the analysis family identity from the canonical model ID."""
        return self.model


class TransientRetryConfig(BaseModel):
    """Visible retry policy, expressed as total physical attempts per request stage."""

    maximum_attempts: PositiveInt = 1
    initial_delay: timedelta = Field(default=timedelta(seconds=2), ge=timedelta())
    maximum_delay: timedelta = Field(default=timedelta(minutes=1), ge=timedelta())
    backoff_multiplier: float = Field(default=2.0, ge=1.0, allow_inf_nan=False)
    retry_transport_errors: bool = True
    status_codes: tuple[HttpErrorStatusCode, ...] = (
        408,
        425,
        429,
        500,
        502,
        503,
        504,
        520,
        522,
        524,
    )

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    @model_validator(mode="after")
    def check_policy(self) -> Self:
        if self.maximum_delay < self.initial_delay:
            raise ValueError("transient_retries.maximum_delay must not precede initial_delay")
        if len(self.status_codes) != len(set(self.status_codes)):
            raise ValueError("transient_retries.status_codes contains duplicates")
        permanent_client_errors = sorted(
            status
            for status in self.status_codes
            if status < HTTP_SERVER_ERROR_START
            and status not in RETRYABLE_CLIENT_ERROR_STATUS_CODES
        )
        if permanent_client_errors:
            raise ValueError(
                "transient_retries.status_codes contains permanent client errors: "
                f"{permanent_client_errors}"
            )
        return self


class ConcurrencyConfig(BaseModel):
    """Deterministic bounded-concurrency ramp configuration."""

    initial: PositiveInt = 1
    maximum: PositiveInt = 1
    ramp: Literal["doubling-v1"] = "doubling-v1"

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    @model_validator(mode="after")
    def check_bounds(self) -> Self:
        if self.maximum < self.initial:
            raise ValueError("concurrency.maximum must be greater than or equal to initial")

        return self


class BaseRunConfig(BaseModel):
    """Request-semantics fields shared by factorial-pilot and ladder runs.

    ``OPERATIONAL_FIELDS`` names config fields that cannot change any request's
    semantics and may be retuned between resumed sessions; they are excluded
    from the request contract hash. Subclasses pin their own ``schema_version``
    and ``mode`` discriminator and type their own ``judges`` roster.
    """

    OPERATIONAL_FIELDS: ClassVar[frozenset[str]] = frozenset({"max_cost_usd", "concurrency"})

    rubric_version: Literal["rubric-v1"] = RUBRIC_VERSION
    baseline_effort: ReasoningEffort = "minimal"
    max_cost_usd: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    request_timeout: timedelta = Field(default=timedelta(minutes=2), gt=timedelta(0))
    transient_retries: TransientRetryConfig = Field(default_factory=TransientRetryConfig)
    concurrency: ConcurrencyConfig = Field(default_factory=ConcurrencyConfig)

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


def _check_unique_families(judges: Sequence[JudgeConfig]) -> None:
    if not judges:
        raise ValueError("judges must not be empty")
    family_ids = [judge.family_id for judge in judges]
    if len(family_ids) != len(set(family_ids)):
        raise ValueError("judges contains duplicate family_id values")


class PilotRunConfig(BaseRunConfig):
    """Fully resolved request and sampling configuration for a pilot run."""

    schema_version: Literal[3] = 3
    mode: Literal["pilot"] = "pilot"
    sampling: SliceSamplingConfig
    repeat_count: PositiveInt = 1
    judges: list[JudgeConfig]

    @model_validator(mode="after")
    def check_judges(self) -> Self:
        _check_unique_families(self.judges)
        for judge in self.judges:
            if judge.higher_effort == self.baseline_effort:
                raise ValueError(
                    f"higher_effort must differ from baseline_effort for {judge.family_id}"
                )
        return self


class LadderJudge(JudgeConfig):
    """One panel judge with its rung assignment, cost tier, and voter framings.

    A (judge, framing) pair is one voter. The judge's conditioning effort is
    ``effort`` when set, otherwise the run's ``baseline_effort``; the factorial
    pilot's ``higher_effort`` arm does not exist on the ladder, so that field
    must stay unset here.
    """

    rung: PositiveInt
    cost_tier: str = Field(min_length=1)
    effort: ReasoningEffort | None = None
    framings: tuple[FramingId, ...] = FRAMINGS

    @model_validator(mode="after")
    def check_voters(self) -> Self:
        if not self.framings:
            raise ValueError(f"judge {self.family_id} must vote through at least one framing")
        if len(self.framings) != len(set(self.framings)):
            raise ValueError(f"judge {self.family_id} repeats a framing")
        if self.higher_effort is not None:
            raise ValueError(
                f"judge {self.family_id} sets higher_effort; ladder judges pin effort directly"
            )
        return self


class PanelConfig(BaseModel):
    """Panel freeze state recorded alongside the roster it governs."""

    version: PositiveInt
    frozen: bool
    pruning_floor: str | None = None

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    @model_validator(mode="after")
    def check_freeze(self) -> Self:
        if self.frozen and not (self.pruning_floor or "").strip():
            raise ValueError("a frozen panel must document its pruning floor")
        return self


class EmbeddingConfig(BaseModel):
    """The one permitted card-embedding endpoint and its budget cap."""

    endpoint_url: str = Field(min_length=1)
    model: str = Field(min_length=1)
    api_key_env: str | None = "EMBEDDING_API_KEY"
    dimension: PositiveInt | None = None
    batch_size: PositiveInt = 64
    max_texts: PositiveInt | None = None
    request_timeout: timedelta = Field(default=timedelta(minutes=2), gt=timedelta(0))

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class ClassifierConfig(BaseModel):
    """Soft-label multinomial logistic-regression fitting policy."""

    folds: PositiveInt = 5
    regularization: float = Field(default=1.0, gt=0.0, allow_inf_nan=False)
    max_iterations: PositiveInt = 1000
    seed: int = 0

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class ReportConfig(BaseModel):
    """Evaluation-report gates and calibrated decision thresholds."""

    coincident_precision_target: float = Field(default=0.98, gt=0.0, lt=1.0, allow_inf_nan=False)
    confidence_level: float = Field(default=0.95, gt=0.0, lt=1.0, allow_inf_nan=False)
    calibrated_threshold: float = Field(default=0.5, ge=0.0, le=1.0, allow_inf_nan=False)
    calibration_bins: PositiveInt = 10

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class LadderRunConfig(BaseRunConfig):
    """Schema-v4 vote-ladder panel configuration (the versioned judges.yaml).

    Every rung must span at least two model families and at least two
    framings; violations are hard errors at load time. Corpus execution
    refuses an unfrozen panel; only pilot qualification may run one.
    """

    OPERATIONAL_FIELDS: ClassVar[frozenset[str]] = BaseRunConfig.OPERATIONAL_FIELDS | {
        "per_provider_concurrency",
        "embedding",
        "classifier",
        "report",
    }

    schema_version: Literal[4] = 4
    mode: Literal["ladder"] = "ladder"
    shell: ShellId = "S1"
    panel: PanelConfig
    per_provider_concurrency: PositiveInt | None = None
    embedding: EmbeddingConfig | None = None
    classifier: ClassifierConfig = Field(default_factory=ClassifierConfig)
    report: ReportConfig = Field(default_factory=ReportConfig)
    judges: list[LadderJudge]

    @model_validator(mode="after")
    def check_rungs(self) -> Self:
        _check_unique_families(self.judges)
        rung_indices = sorted({judge.rung for judge in self.judges})
        if rung_indices != list(range(1, len(rung_indices) + 1)):
            raise ValueError(f"judge rungs must be contiguous from 1, got {rung_indices}")
        for rung in rung_indices:
            rung_judges = [judge for judge in self.judges if judge.rung == rung]
            families = {judge.family_id for judge in rung_judges}
            framings = {framing for judge in rung_judges for framing in judge.framings}
            if len(families) < MINIMUM_RUNG_SPAN:
                raise ValueError(f"rung {rung} must span at least two model families")
            if len(framings) < MINIMUM_RUNG_SPAN:
                raise ValueError(f"rung {rung} must span at least two framings")
        return self

    @property
    def rung_count(self) -> int:
        return max(judge.rung for judge in self.judges)

    def judge_effort(self, judge: LadderJudge) -> ReasoningEffort:
        return judge.effort if judge.effort is not None else self.baseline_effort


type RunConfig = Annotated[
    PilotRunConfig | LadderRunConfig,
    Field(discriminator="mode"),
]

RUN_CONFIG_ADAPTER: TypeAdapter[RunConfig] = TypeAdapter(RunConfig)


class EvaluationCard(ConcatCardRow):
    """Optional sampling and grouping annotations projected alongside a card.

    ``family_id`` is the Track A relation-family grouping (a relation, its
    inverse, and siblings share one family). It is optional at the card layer;
    classifier fitting requires it and fails loudly when absent.
    """

    prescreen_stratum: str = "unstratified"
    pilot_strata: list[str] = Field(default_factory=list)
    family_id: RelationFamilyId | None = None


@dataclass(frozen=True)
class LoadedRunConfig:
    """A validated config plus its exact source location and content hash."""

    path: Path
    config: RunConfig
    content_hash: Sha256Hex

    def ladder(self) -> LadderRunConfig:
        if not isinstance(self.config, LadderRunConfig):
            raise TypeError("loaded run config is not a ladder config")
        return self.config


@dataclass(frozen=True)
class CardCandidate:
    relation_id: RelationId
    producer: RelationNamespace
    card_hash: Sha256Hex
    token_count: int
    prescreen_stratum: str
    pilot_strata: tuple[str, ...]


@dataclass(frozen=True)
class VerifiedConcat:
    cards_path: Path
    manifest_path: Path
    source_hashes: dict[str, Sha256Hex]
    row_count: int
    source_namespaces: frozenset[RelationNamespace]


@dataclass(frozen=True)
class BundleParts:
    shell: Literal["S1", "S2", "S3"]
    framing: Literal["F1", "F2", "F3"]


@dataclass(frozen=True)
class DerivedSlice:
    rows: tuple[SliceRow, ...]
    derivation: SliceDerivation


@dataclass(frozen=True)
class PreparedCards:
    cards_dir: Path
    cards_path: Path
    manifest_path: Path
    source_hashes: dict[str, Sha256Hex]
    cards: dict[RelationId, EvaluationCard]
    prefixes: dict[BundleId, PromptPrefix]
    pack_hash: Sha256Hex


@dataclass(frozen=True)
class PreparedInputs(PreparedCards):
    full_grid_card_count: int
    slice_rows: tuple[SliceRow, ...]
    slice_derivation: SliceDerivation


@dataclass(frozen=True)
class LadderPreparedInputs(PreparedCards):
    """Verified corpus plus the deterministic voting population for a ladder run.

    ``eligible`` is every non-few-shot card in ascending ``relation_id`` order;
    that order is the ladder's card order everywhere downstream.
    """

    config_hash: Sha256Hex
    eligible: tuple[EvaluationCard, ...]


class FamilyDecision(Protocol):
    @property
    def family_id(self) -> str: ...


@dataclass(frozen=True)
class VoteTask:
    judge: JudgeConfig
    bundle_id: BundleId
    relation_id: RelationId
    card_hash: Sha256Hex
    effort: ReasoningEffort
    repeat_index: int
    pack_hash: Sha256Hex
    rubric_version: Literal["rubric-v1"]

    @property
    def vote_id(self) -> Sha256Hex:
        return task_hash(self)


class VotePlan(Protocol):
    """A deterministic, streaming sequence of logical votes."""

    @property
    def expected_votes(self) -> int: ...

    def tasks(self) -> Iterator[VoteTask]: ...


def _interleave_task_streams(streams: Sequence[Iterator[VoteTask]]) -> Iterator[VoteTask]:
    active = list(streams)
    while active:
        remaining: list[Iterator[VoteTask]] = []
        for stream in active:
            try:
                yield next(stream)
            except StopIteration:
                continue
            remaining.append(stream)
        active = remaining


@dataclass(frozen=True)
class PilotVotePlan:
    config: PilotRunConfig
    prepared: PreparedInputs

    @property
    def expected_votes(self) -> int:
        grid = len(self.config.judges) * len(BUNDLES) * len(self.prepared.slice_rows)
        repeats = (
            len(self.config.judges)
            * self.config.repeat_count
            * sum(not row.is_holdout for row in self.prepared.slice_rows)
        )
        effort = sum(
            len(self.prepared.slice_rows)
            for judge in self.config.judges
            if judge.higher_effort is not None
        )
        return grid + repeats + effort

    def tasks(self) -> Iterator[VoteTask]:
        streams = tuple(self._judge_tasks(judge) for judge in self.config.judges)
        yield from _interleave_task_streams(streams)

    def _judge_tasks(self, judge: JudgeConfig) -> Iterator[VoteTask]:
        non_holdouts = tuple(row for row in self.prepared.slice_rows if not row.is_holdout)
        for bundle_id in BUNDLES:
            for row in self.prepared.slice_rows:
                yield self._task(judge, bundle_id, row, self.config.baseline_effort, 0)
            if bundle_id != QUALIFICATION_BUNDLE:
                continue
            for repeat_index in range(1, self.config.repeat_count + 1):
                for row in non_holdouts:
                    yield self._task(
                        judge,
                        bundle_id,
                        row,
                        self.config.baseline_effort,
                        repeat_index,
                    )
            if judge.higher_effort is not None:
                for row in self.prepared.slice_rows:
                    yield self._task(judge, bundle_id, row, judge.higher_effort, 0)

    def _task(
        self,
        judge: JudgeConfig,
        bundle_id: BundleId,
        row: SliceRow,
        effort: ReasoningEffort,
        repeat_index: int,
    ) -> VoteTask:
        return VoteTask(
            judge=judge,
            bundle_id=bundle_id,
            relation_id=row.relation_id,
            card_hash=row.card_hash,
            effort=effort,
            repeat_index=repeat_index,
            pack_hash=self.prepared.pack_hash,
            rubric_version=self.config.rubric_version,
        )


def task_hash(task: VoteTask) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "bundle_id": task.bundle_id,
                "card_hash": task.card_hash,
                "effort": task.effort,
                "provider_name": task.judge.provider_name,
                "provider_slug": task.judge.provider_slug,
                "openrouter_region": task.judge.openrouter_region,
                "family_id": task.judge.family_id,
                "output_token_limit": task.judge.output_token_limit.model_dump(mode="json"),
                "model": task.judge.model,
                "prompt_pack_hash": task.pack_hash,
                "relation_id": task.relation_id,
                "repeat_index": task.repeat_index,
                "rubric_version": task.rubric_version,
                "seed": task.judge.seed,
                "temperature": task.judge.temperature,
            }
        )
    )


def session_id(task: VoteTask) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "bundle": task.bundle_id,
                "effort": task.effort,
                "family": task.judge.family_id,
            }
        )
    )


def attempt_id(request_hash_value: Sha256Hex, stage_attempt: int) -> Sha256Hex:
    if stage_attempt < 0:
        raise ValueError("stage_attempt must not be negative")
    return sha256_bytes(
        canonical_json_bytes(
            {
                "request_hash": request_hash_value,
                "stage_attempt": stage_attempt,
            }
        )
    )
