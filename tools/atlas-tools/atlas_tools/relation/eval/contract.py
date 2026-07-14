"""Typed configuration, input, and execution contracts for relation evaluation."""

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Annotated, Literal, Protocol, Self

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
    QUALIFICATION_BUNDLE,
    AnalysisDecisions,
    BundleId,
    FullGridExpectation,
    ReasoningEffort,
    SliceDerivation,
    SliceRow,
)
from atlas_tools.relation_cards.common.cards import RelationId, RelationNamespace

RUBRIC_VERSION = "rubric-v1"
HTTP_CLIENT_ERROR_START = 400
HTTP_SERVER_ERROR_START = 500
RETRYABLE_CLIENT_ERROR_STATUS_CODES = frozenset({408, 425, 429})

type JudgeFamilyId = str
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
    """Fields shared by pilot and full schema-v3 runs."""

    schema_version: Literal[3] = 3
    rubric_version: Literal["rubric-v1"] = RUBRIC_VERSION
    baseline_effort: ReasoningEffort = "minimal"
    max_cost_usd: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    request_timeout: timedelta = Field(default=timedelta(minutes=2), gt=timedelta(0))
    transient_retries: TransientRetryConfig = Field(default_factory=TransientRetryConfig)
    concurrency: ConcurrencyConfig = Field(default_factory=ConcurrencyConfig)
    judges: list[JudgeConfig]

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    @model_validator(mode="after")
    def check_judges(self) -> Self:
        if not self.judges:
            raise ValueError("judges must not be empty")
        family_ids = [judge.family_id for judge in self.judges]
        if len(family_ids) != len(set(family_ids)):
            raise ValueError("judges contains duplicate family_id values")
        for judge in self.judges:
            if judge.higher_effort == self.baseline_effort:
                raise ValueError(
                    f"higher_effort must differ from baseline_effort for {judge.family_id}"
                )
        return self


class PilotRunConfig(BaseRunConfig):
    """Fully resolved request and sampling configuration for a pilot run."""

    mode: Literal["pilot"] = "pilot"
    sampling: SliceSamplingConfig
    repeat_count: PositiveInt = 1


class FullRunConfig(BaseRunConfig):
    """Fully resolved request and decisions configuration for a full run."""

    mode: Literal["full"] = "full"
    decisions: Path


type RunConfig = Annotated[
    PilotRunConfig | FullRunConfig,
    Field(discriminator="mode"),
]

RUN_CONFIG_ADAPTER: TypeAdapter[RunConfig] = TypeAdapter(RunConfig)


class EvaluationCard(ConcatCardRow):
    """Optional sampling annotations projected alongside a concatenated card."""

    prescreen_stratum: str = "unstratified"
    pilot_strata: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class LoadedRunConfig:
    """A validated config plus filesystem paths resolved outside its payload."""

    path: Path
    config: RunConfig
    decisions_path: Path | None

    def full(self) -> tuple[FullRunConfig, Path]:
        if not isinstance(self.config, FullRunConfig) or self.decisions_path is None:
            raise TypeError("loaded run config is not a full-run config")
        return self.config, self.decisions_path


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
class LoadedAnalysisDecisions:
    path: Path
    decisions: AnalysisDecisions
    content_hash: Sha256Hex


@dataclass(frozen=True)
class AuthorizedJudges:
    judges: tuple[JudgeConfig, ...]
    family_efforts: dict[str, ReasoningEffort]


@dataclass(frozen=True)
class FullGridAuthorization:
    expectation: FullGridExpectation
    judges: tuple[JudgeConfig, ...]


@dataclass(frozen=True)
class FullGridPreparedInputs(PreparedCards):
    decisions_path: Path
    decisions_hash: Sha256Hex
    decisions: AnalysisDecisions
    expectation: FullGridExpectation
    judges: tuple[JudgeConfig, ...]


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


@dataclass(frozen=True)
class FullGridVotePlan:
    config: FullRunConfig
    prepared: FullGridPreparedInputs

    @property
    def expected_votes(self) -> int:
        expectation = self.prepared.expectation
        return len(expectation.families) * len(expectation.bundles) * len(expectation.relation_ids)

    def tasks(self) -> Iterator[VoteTask]:
        streams = tuple(self._judge_tasks(judge) for judge in self.prepared.judges)
        yield from _interleave_task_streams(streams)

    def _judge_tasks(self, judge: JudgeConfig) -> Iterator[VoteTask]:
        expectation = self.prepared.expectation
        effort = expectation.family_efforts[judge.family_id]
        for bundle_id in expectation.bundles:
            for relation_id in expectation.relation_ids:
                card = self.prepared.cards[relation_id]
                yield VoteTask(
                    judge=judge,
                    bundle_id=bundle_id,
                    relation_id=relation_id,
                    card_hash=card.card_hash,
                    effort=effort,
                    repeat_index=0,
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
