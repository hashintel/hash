"""Validate the complete request semantics of pilot and grid runs.

Configuration is frozen after validation. Fields designated as operational may
change between resume sessions because they affect scheduling or local policy,
not the bytes sent to a provider. Every other field contributes to the request
contract and therefore to logical vote identity.
"""

from collections.abc import Sequence
from datetime import timedelta
from typing import Annotated, ClassVar, Literal, Self

from pydantic import Field, PositiveInt, TypeAdapter, model_validator

from atlas_tools.relation.evaluation.domain._model import FrozenModel
from atlas_tools.relation.evaluation.domain.identity import (
    JudgeFamilyId,
    OpenRouterRegion,
    ReasoningEffort,
)

RUBRIC_VERSION = "rubric-v1"
HTTP_SERVER_ERROR_START = 500
RETRYABLE_CLIENT_ERROR_STATUS_CODES = frozenset({408, 425, 429})

type HttpErrorStatusCode = Annotated[int, Field(ge=400, le=599)]


class SliceSamplingConfig(FrozenModel):
    """Pin deterministic pilot sampling independently of deck order."""

    algorithm: Literal["stratified-hash-v1"] = "stratified-hash-v1"
    seed: int
    non_holdout_count: PositiveInt = 144


class MaxTokensLimit(FrozenModel):
    """Send an output limit through the portable `max_tokens` field."""

    parameter: Literal["max_tokens"] = "max_tokens"
    tokens: PositiveInt


class MaxCompletionTokensLimit(FrozenModel):
    """Send an output limit through `max_completion_tokens`."""

    parameter: Literal["max_completion_tokens"] = "max_completion_tokens"
    tokens: PositiveInt


type OutputTokenLimit = Annotated[
    MaxTokensLimit | MaxCompletionTokensLimit,
    Field(discriminator="parameter"),
]


class JudgeConfig(FrozenModel):
    """Pin one model to one provider endpoint and decoding policy."""

    provider_slug: str = Field(min_length=1)
    provider_name: str = Field(min_length=1)
    openrouter_region: OpenRouterRegion = "global"
    model: str = Field(min_length=1)
    temperature: float | None = Field(default=0.0, allow_inf_nan=False)
    seed: int | None = 0
    higher_effort: ReasoningEffort | None = None
    output_token_limit: OutputTokenLimit = MaxCompletionTokensLimit(tokens=256)

    @property
    def family_id(self) -> JudgeFamilyId:
        """Use the canonical model ID as the stable analysis family."""
        return self.model


class TransientRetryConfig(FrozenModel):
    """Bound retries for one request stage and reject unsafe status lists."""

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

    @model_validator(mode="after")
    def check_policy(self) -> Self:
        if self.maximum_delay < self.initial_delay:
            raise ValueError("maximum_delay must not precede initial_delay")
        if len(self.status_codes) != len(set(self.status_codes)):
            raise ValueError("status_codes contains duplicates")
        permanent = sorted(
            status
            for status in self.status_codes
            if status < HTTP_SERVER_ERROR_START
            and status not in RETRYABLE_CLIENT_ERROR_STATUS_CODES
        )
        if permanent:
            raise ValueError(f"status_codes contains permanent client errors: {permanent}")
        return self


class ConcurrencyConfig(FrozenModel):
    """Bound worker growth with a deterministic ramp."""

    initial: PositiveInt = 1
    maximum: PositiveInt = 1
    ramp: Literal["doubling-v1"] = "doubling-v1"

    @model_validator(mode="after")
    def check_bounds(self) -> Self:
        if self.maximum < self.initial:
            raise ValueError("maximum must be greater than or equal to initial")
        return self


class BaseRunConfig(FrozenModel):
    """Hold request policy shared by both supported execution modes."""

    OPERATIONAL_FIELDS: ClassVar[frozenset[str]] = frozenset({"max_cost_usd", "concurrency"})

    rubric_version: Literal["rubric-v1"] = RUBRIC_VERSION
    baseline_effort: ReasoningEffort = "minimal"
    max_cost_usd: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    request_timeout: timedelta = Field(default=timedelta(minutes=2), gt=timedelta())
    transient_retries: TransientRetryConfig = TransientRetryConfig()
    concurrency: ConcurrencyConfig = ConcurrencyConfig()


def _check_unique_families(judges: Sequence[JudgeConfig]) -> None:
    if not judges:
        raise ValueError("judges must not be empty")
    families = tuple(judge.family_id for judge in judges)
    if len(families) != len(set(families)):
        raise ValueError("judges contains duplicate family IDs")


class PilotRunConfig(BaseRunConfig):
    """Resolve every sampling and request pin for a pilot run."""

    schema_version: Literal[3] = 3
    mode: Literal["pilot"] = "pilot"
    sampling: SliceSamplingConfig
    repeat_count: PositiveInt = 1
    judges: tuple[JudgeConfig, ...]

    @model_validator(mode="after")
    def check_judges(self) -> Self:
        _check_unique_families(self.judges)
        duplicate_efforts = tuple(
            judge.family_id
            for judge in self.judges
            if judge.higher_effort == self.baseline_effort
        )
        if duplicate_efforts:
            raise ValueError(
                "higher_effort must differ from baseline_effort for "
                f"{', '.join(duplicate_efforts)}"
            )
        return self


class GridJudge(JudgeConfig):
    """Add measured pilot cost and the one effort used by a grid seat."""

    effort: ReasoningEffort | None = None
    pilot_cost_per_vote_usd: float = Field(gt=0.0, allow_inf_nan=False)

    @model_validator(mode="after")
    def check_seat(self) -> Self:
        if self.higher_effort is not None:
            raise ValueError("grid judges pin effort directly; higher_effort must be null")
        return self


class ManualPrune(FrozenModel):
    """Record an operator decision that removes a qualified family."""

    model: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class PanelConfig(FrozenModel):
    """Freeze the admitted roster and keep reserve topology explicitly dormant."""

    version: PositiveInt
    frozen: bool
    pruning_floor: str | None = None
    manual_prunes: tuple[ManualPrune, ...] = ()
    reserve_topology: Literal["dormant"] = "dormant"

    @model_validator(mode="after")
    def check_freeze(self) -> Self:
        if self.frozen and not (self.pruning_floor or "").strip():
            raise ValueError("a frozen panel must document its pruning floor")
        return self


class EmbeddingConfig(FrozenModel):
    """Bound one card-embedding endpoint and its local batching policy."""

    endpoint_url: str = Field(min_length=1)
    model: str = Field(min_length=1)
    api_key_env: str | None = "EMBEDDING_API_KEY"
    dimension: PositiveInt | None = None
    batch_size: PositiveInt = 64
    max_texts: PositiveInt | None = None
    request_timeout: timedelta = Field(default=timedelta(minutes=2), gt=timedelta())


class ClassifierConfig(FrozenModel):
    """Pin soft-label multinomial logistic-regression fitting."""

    folds: PositiveInt = 5
    regularization: float = Field(default=1.0, gt=0.0, allow_inf_nan=False)
    max_iterations: PositiveInt = 1000
    seed: int = 0


class ReportConfig(FrozenModel):
    """Pin evaluation gates and calibrated decision thresholds."""

    coincident_precision_target: float = Field(default=0.98, gt=0.0, lt=1.0)
    confidence_level: float = Field(default=0.95, gt=0.0, lt=1.0)
    calibrated_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    calibration_bins: PositiveInt = 10


class GuardConfig(FrozenModel):
    """Stop a family stream when cache or rolling-cost evidence drifts."""

    cache_check_vote: PositiveInt = 5
    cost_window: PositiveInt = 50
    cost_multiplier: float = Field(default=1.5, gt=1.0, allow_inf_nan=False)


class GridRunConfig(BaseRunConfig):
    """Freeze the admitted S1xF1 panel and its production-grid policy."""

    OPERATIONAL_FIELDS: ClassVar[frozenset[str]] = BaseRunConfig.OPERATIONAL_FIELDS | {
        "guards",
        "embedding",
        "classifier",
        "report",
    }

    schema_version: Literal[4] = 4
    mode: Literal["grid"] = "grid"
    panel: PanelConfig
    guards: GuardConfig = GuardConfig()
    embedding: EmbeddingConfig | None = None
    classifier: ClassifierConfig = ClassifierConfig()
    report: ReportConfig = ReportConfig()
    judges: tuple[GridJudge, ...]

    @model_validator(mode="after")
    def check_roster(self) -> Self:
        _check_unique_families(self.judges)
        pruned = {prune.model for prune in self.panel.manual_prunes}
        seated = {judge.family_id for judge in self.judges}
        overlap = sorted(pruned & seated)
        if overlap:
            raise ValueError(f"manually pruned families cannot hold seats: {overlap}")
        return self

    def judge_effort(self, judge: GridJudge) -> ReasoningEffort:
        """Resolve the seat effort once at the mode boundary."""
        return judge.effort if judge.effort is not None else self.baseline_effort


type RunConfig = Annotated[PilotRunConfig | GridRunConfig, Field(discriminator="mode")]

RUN_CONFIG_ADAPTER: TypeAdapter[RunConfig] = TypeAdapter(RunConfig)

