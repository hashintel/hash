"""Validate the complete request semantics of pilot and grid runs.

Configuration is frozen after validation. Fields designated as operational may
change between resume sessions because they affect scheduling or local policy,
not the bytes sent to a provider. Every other field contributes to the request
contract and therefore to logical vote identity.
"""

from collections.abc import Sequence
from datetime import timedelta
from typing import Annotated, ClassVar, Literal, Self
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, PositiveInt, TypeAdapter, field_validator, model_validator

from atlas_tools.relation.evaluation.domain._model import FrozenModel
from atlas_tools.relation.evaluation.domain.identity import (
    JudgeFamilyId,
    ModelId,
    OpenRouterRegion,
    ProviderName,
    ProviderSlug,
    ReasoningEffort,
)
from atlas_tools.relation.evaluation.domain.scalar import (
    FiniteFloat,
    HttpErrorStatusCode,
    NonEmptyStr,
    NonNegativeDuration,
    OpenProbability,
    PositiveDuration,
    PositiveFiniteFloat,
    Probability,
)

RUBRIC_VERSION = "rubric-v1"
HTTP_SERVER_ERROR_START = 500
RETRYABLE_CLIENT_ERROR_STATUS_CODES = frozenset({408, 425, 429})

def normalize_embedding_endpoint_url(endpoint_url: str) -> str:
    """Return one canonical HTTPS embeddings operation URL."""
    parsed = urlsplit(endpoint_url)
    path = parsed.path.rstrip("/")
    if (
        parsed.scheme.lower() != "https"
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or not path.endswith("/embeddings")
    ):
        raise ValueError("embedding endpoint URL must be an HTTPS /embeddings operation URL")
    return urlunsplit(("https", parsed.netloc.lower(), path, "", ""))


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


class JudgeRequestSpec(FrozenModel):
    """Pin one model route and its decoding policy."""

    provider_slug: ProviderSlug
    provider_name: ProviderName
    openrouter_region: OpenRouterRegion = "global"
    model: ModelId
    temperature: FiniteFloat | None = 0.0
    seed: int | None = 0
    output_token_limit: OutputTokenLimit = MaxCompletionTokensLimit(tokens=256)

    @property
    def family_id(self) -> JudgeFamilyId:
        """Use the canonical model ID as the stable analysis family."""
        return JudgeFamilyId(self.model)

    def as_request_spec(self) -> JudgeRequestSpec:
        """Drop planning and guard metadata from a persisted request pin."""
        if type(self) is JudgeRequestSpec:
            return self
        return JudgeRequestSpec(
            provider_slug=self.provider_slug,
            provider_name=self.provider_name,
            openrouter_region=self.openrouter_region,
            model=self.model,
            temperature=self.temperature,
            seed=self.seed,
            output_token_limit=self.output_token_limit,
        )


class JudgeConfig(JudgeRequestSpec):
    """Add the optional deliberation arm used only by pilot planning."""

    higher_effort: ReasoningEffort | None = None


class TransientRetryConfig(FrozenModel):
    """Bound retries for one request stage and reject unsafe status lists."""

    maximum_attempts: PositiveInt = 1
    initial_delay: NonNegativeDuration = timedelta(seconds=2)
    maximum_delay: NonNegativeDuration = timedelta(minutes=1)
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
    """Bound global workers and each independently adaptive model family."""

    initial: PositiveInt = 1
    maximum: PositiveInt = 1
    family_maximum: PositiveInt = 1
    ramp: Literal["doubling-v1"] = "doubling-v1"

    @model_validator(mode="after")
    def check_bounds(self) -> Self:
        if self.maximum < self.initial:
            raise ValueError("maximum must be greater than or equal to initial")
        if self.family_maximum > self.maximum:
            raise ValueError("family_maximum must not exceed the global maximum")
        return self


class BaseRunConfig(FrozenModel):
    """Hold request policy shared by both supported execution modes."""

    OPERATIONAL_FIELDS: ClassVar[frozenset[str]] = frozenset({"max_cost_usd", "concurrency"})

    rubric_version: Literal["rubric-v1"] = RUBRIC_VERSION
    baseline_effort: ReasoningEffort = "minimal"
    max_cost_usd: PositiveFiniteFloat | None = None
    request_timeout: PositiveDuration = timedelta(minutes=2)
    transient_retries: TransientRetryConfig = TransientRetryConfig()
    concurrency: ConcurrencyConfig = ConcurrencyConfig()


def _check_unique_families(judges: Sequence[JudgeRequestSpec]) -> None:
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
            judge.family_id for judge in self.judges if judge.higher_effort == self.baseline_effort
        )
        if duplicate_efforts:
            raise ValueError(
                f"higher_effort must differ from baseline_effort for {', '.join(duplicate_efforts)}"
            )
        return self


class GridJudge(JudgeRequestSpec):
    """Add measured pilot cost and the one effort used by a grid seat."""

    effort: ReasoningEffort
    pilot_cost_per_vote_usd: PositiveFiniteFloat


class ManualPrune(FrozenModel):
    """Record an operator decision that removes a qualified family."""

    model: ModelId
    reason: NonEmptyStr

    @property
    def family_id(self) -> JudgeFamilyId:
        """Expose the pruned model through the shared family vocabulary."""
        return JudgeFamilyId(self.model)


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
        families = tuple(prune.family_id for prune in self.manual_prunes)
        if len(families) != len(set(families)):
            raise ValueError("manual_prunes contains duplicate family IDs")
        return self


class EmbeddingConfig(FrozenModel):
    """Bind vector semantics separately from operational acquisition policy.

    Endpoint, model, and dimension identify vector bytes. Batch size, timeout,
    credentials, and the paid-text ceiling govern acquisition without changing
    the identity of an individual card vector.
    """

    endpoint_url: NonEmptyStr
    model: ModelId
    api_key_env: NonEmptyStr | None = "EMBEDDING_API_KEY"
    dimension: PositiveInt | None = None
    batch_size: PositiveInt = 64
    max_texts: PositiveInt | None = None
    request_timeout: PositiveDuration = timedelta(minutes=2)

    @field_validator("endpoint_url")
    @classmethod
    def normalize_endpoint(cls, endpoint_url: str) -> str:
        """Store one canonical HTTPS embeddings operation URL."""
        return normalize_embedding_endpoint_url(endpoint_url)


class ClassifierConfig(FrozenModel):
    """Pin nested grouped soft-label classifier fitting.

    `folds` controls both the outer validation split and each outer-training
    partition's inner calibration split. Grid preparation rejects card
    cohorts that cannot fill both levels before provider work begins.
    """

    folds: Annotated[int, Field(ge=2)] = 5
    regularization: PositiveFiniteFloat = 1.0
    max_iterations: PositiveInt = 1000
    seed: int = 0


class ReportConfig(FrozenModel):
    """Pin evaluation gates and calibrated decision thresholds."""

    coincident_precision_target: OpenProbability = 0.98
    confidence_level: OpenProbability = 0.95
    calibrated_threshold: Probability = 0.5
    calibration_bins: PositiveInt = 10
    acceptance_cost_ceiling_usd: PositiveFiniteFloat = 135.0


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
        pruned = {prune.family_id for prune in self.panel.manual_prunes}
        seated = {judge.family_id for judge in self.judges}
        overlap = sorted(pruned & seated)
        if overlap:
            raise ValueError(f"manually pruned families cannot hold seats: {overlap}")
        return self


type RunConfig = Annotated[PilotRunConfig | GridRunConfig, Field(discriminator="mode")]

RUN_CONFIG_ADAPTER: TypeAdapter[RunConfig] = TypeAdapter(RunConfig)
