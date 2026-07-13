"""Execute resumable, privacy-pinned pilot and production relation-judge grids."""

import fcntl
import hashlib
import math
import os
import tempfile
import time
from collections import defaultdict
from collections.abc import Iterable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from importlib.metadata import version
from os import PathLike
from pathlib import Path
from typing import Annotated, Literal, Protocol, Self, assert_never, cast

import openrouter
import yaml
from openrouter import OpenRouter
from openrouter.components import (
    ChatMessages,
    ChatRequestReasoning,
    ChatResult,
    ProviderPreferences,
)
from openrouter.types import UNSET
from openrouter.utils.retries import BackoffStrategy, RetryConfig
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    NonNegativeInt,
    PositiveInt,
    ValidationError,
    model_validator,
)

from atlas_tools.common import (
    Sha256Hex,
    canonical_json_bytes,
    sha256_bytes,
    sha256_file,
)
from atlas_tools.relation.concat import CONCAT_SCHEMA_VERSION, ConcatCardRow, ConcatProvenance
from atlas_tools.relation.eval.prompt import (
    FEW_SHOT,
    HOLDOUT,
    MalformedResponseError,
    PromptPrefix,
    Response,
    build_live_prompt,
    build_prompt_prefix,
    build_retry_prompt,
    parse_response,
    prompt_pack_hash,
)
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    QUALIFICATION_BUNDLE,
    AnalysisDecisions,
    AttemptFailure,
    BundleId,
    ExpectedEffortArm,
    ExpectedGrid,
    ExpectedRepeatArm,
    FramingId,
    FullGridExpectation,
    FullGridManifest,
    HandoffManifest,
    JudgePin,
    PhysicalAttemptRow,
    ReasoningEffort,
    RunDates,
    ShellId,
    SliceDerivation,
    SliceRow,
    VoteRow,
)
from atlas_tools.relation_cards.common.cards import RelationId

RUBRIC_VERSION = "rubric-v1"
_NO_RETRIES = RetryConfig(
    strategy="none",
    backoff=BackoffStrategy(0, 0, 1.0, 0),
    retry_connection_errors=False,
)
_RESPONSE_CACHE_HEADERS = {"X-OpenRouter-Cache": "false"}
_HTTP_OK = 200
_GLOBAL_OPENROUTER_SERVER_URL = "https://openrouter.ai/api/v1"
_EU_OPENROUTER_SERVER_URL = "https://eu.openrouter.ai/api/v1"

type OpenRouterRegion = Literal["global", "eu"]


def _openrouter_server_url(region: OpenRouterRegion) -> str:
    match region:
        case "global":
            return _GLOBAL_OPENROUTER_SERVER_URL
        case "eu":
            return _EU_OPENROUTER_SERVER_URL
        case unexpected:
            assert_never(unexpected)


class SliceSamplingConfig(BaseModel):
    """Versioned deterministic sampling policy for the pilot slice."""

    algorithm: Literal["stratified-hash-v1"] = "stratified-hash-v1"
    seed: int
    non_holdout_count: PositiveInt = 144

    model_config = ConfigDict(extra="forbid", frozen=True)


class MaxTokensLimit(BaseModel):
    """An output limit sent through OpenRouter's portable ``max_tokens`` field."""

    parameter: Literal["max_tokens"] = "max_tokens"
    tokens: PositiveInt

    model_config = ConfigDict(extra="forbid", frozen=True)


class MaxCompletionTokensLimit(BaseModel):
    """An output limit sent through OpenRouter's OpenAI-style completion field."""

    parameter: Literal["max_completion_tokens"] = "max_completion_tokens"
    tokens: PositiveInt

    model_config = ConfigDict(extra="forbid", frozen=True)


type OutputTokenLimit = Annotated[
    MaxTokensLimit | MaxCompletionTokensLimit,
    Field(discriminator="parameter"),
]


class JudgeConfig(BaseModel):
    """One stable judge family and its exact OpenRouter provider endpoint."""

    family_id: str = Field(min_length=1)
    provider_slug: str = Field(min_length=1)
    provider_name: str = Field(min_length=1)
    openrouter_region: OpenRouterRegion = "global"
    model: str = Field(min_length=1)
    temperature: float | None = Field(default=0.0, allow_inf_nan=False)
    seed: int | None = 0
    higher_effort: ReasoningEffort | None = None
    output_token_limit: OutputTokenLimit = MaxCompletionTokensLimit(tokens=256)

    model_config = ConfigDict(extra="forbid", frozen=True)


class PilotRunConfig(BaseModel):
    """Fully resolved request and sampling configuration for one pilot run."""

    schema_version: Literal[2] = 2
    rubric_version: Literal["rubric-v1"] = RUBRIC_VERSION
    sampling: SliceSamplingConfig
    baseline_effort: ReasoningEffort = "minimal"
    repeat_count: PositiveInt = 1
    max_cost_usd: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    request_timeout: timedelta = Field(default=timedelta(minutes=2), gt=timedelta(0))
    judges: list[JudgeConfig]

    model_config = ConfigDict(extra="forbid", frozen=True)

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


class EvaluationCard(ConcatCardRow):
    """Optional sampling annotations projected alongside a concatenated card."""

    prescreen_stratum: str = "unstratified"
    pilot_strata: list[str] = Field(default_factory=list)


class PilotRunState(BaseModel):
    schema_version: Literal[2] = 2
    plan_hash: Sha256Hex
    request_contract_hash: Sha256Hex
    source_hashes: dict[str, Sha256Hex]
    prompt_pack_hash: Sha256Hex
    slice_hash: Sha256Hex
    expected_votes: PositiveInt
    openrouter_sdk_version: str = Field(min_length=1)
    openrouter_openapi_version: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", frozen=True)


@dataclass(frozen=True)
class PilotPaths:
    votes_jsonl: Path
    attempts_jsonl: Path
    slice_jsonl: Path
    manifest_json: Path
    run_state_json: Path
    inflight_json: Path
    lock_file: Path


class FullGridRunState(BaseModel):
    schema_version: Literal[1] = 1
    plan_hash: Sha256Hex
    request_contract_hash: Sha256Hex
    source_hashes: dict[str, Sha256Hex]
    prompt_pack_hash: Sha256Hex
    rubric_version: Literal["rubric-v1"]
    decisions_hash: Sha256Hex
    expected_votes: PositiveInt
    openrouter_sdk_version: str = Field(min_length=1)
    openrouter_openapi_version: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", frozen=True)

    @model_validator(mode="after")
    def check_sources(self) -> Self:
        if set(self.source_hashes) != {"cards.jsonl", "cards.manifest.json", "decisions.json"}:
            raise ValueError("full-grid run state must bind concat cards, manifest, and decisions")
        if self.source_hashes["decisions.json"] != self.decisions_hash:
            raise ValueError("full-grid run-state decisions hash is inconsistent")
        return self


@dataclass(frozen=True)
class FullGridPaths:
    votes_jsonl: Path
    attempts_jsonl: Path
    manifest_json: Path
    run_state_json: Path
    inflight_json: Path
    lock_file: Path


class ExecutionPaths(Protocol):
    @property
    def votes_jsonl(self) -> Path: ...

    @property
    def attempts_jsonl(self) -> Path: ...

    @property
    def inflight_json(self) -> Path: ...


class FamilyDecision(Protocol):
    @property
    def family_id(self) -> str: ...


class InFlightRequest(BaseModel):
    attempt_id: Sha256Hex
    vote_id: Sha256Hex
    request_hash: Sha256Hex
    request_stage: Literal["initial", "repair"]
    stage_attempt: NonNegativeInt
    created_at: AwareDatetime

    model_config = ConfigDict(extra="forbid", frozen=True)


@dataclass(frozen=True)
class CardCandidate:
    relation_id: RelationId
    producer: str
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
    source_namespaces: frozenset[str]


@dataclass(frozen=True)
class BundleParts:
    shell: ShellId
    framing: FramingId


@dataclass(frozen=True)
class AcceptedCompletion:
    content: str
    provider_name: str


@dataclass(frozen=True)
class UsageAccounting:
    tokens_in: int = 0
    tokens_out: int = 0
    tokens_cached: int = 0
    tokens_cache_write: int = 0
    tokens_reasoning: int = 0
    known_cost_usd: float = 0.0
    cost_complete: bool = True

    @property
    def cost_usd(self) -> float | None:
        return self.known_cost_usd if self.cost_complete else None

    def combine(self, other: Self) -> Self:
        return type(self)(
            tokens_in=self.tokens_in + other.tokens_in,
            tokens_out=self.tokens_out + other.tokens_out,
            tokens_cached=self.tokens_cached + other.tokens_cached,
            tokens_cache_write=self.tokens_cache_write + other.tokens_cache_write,
            tokens_reasoning=self.tokens_reasoning + other.tokens_reasoning,
            known_cost_usd=self.known_cost_usd + other.known_cost_usd,
            cost_complete=self.cost_complete and other.cost_complete,
        )

    def mark_incomplete(self) -> Self:
        return type(self)(
            tokens_in=self.tokens_in,
            tokens_out=self.tokens_out,
            tokens_cached=self.tokens_cached,
            tokens_cache_write=self.tokens_cache_write,
            tokens_reasoning=self.tokens_reasoning,
            known_cost_usd=self.known_cost_usd,
            cost_complete=False,
        )


@dataclass(frozen=True)
class DerivedSlice:
    rows: tuple[SliceRow, ...]
    derivation: SliceDerivation


@dataclass(frozen=True)
class CompletedJournals:
    votes: list[VoteRow]
    attempts: list[PhysicalAttemptRow]


@dataclass(frozen=True)
class ExpectedArms:
    repeat: ExpectedRepeatArm
    effort: ExpectedEffortArm | None


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


@dataclass(frozen=True)
class VoteTask:
    judge: JudgeConfig
    bundle_id: BundleId
    relation_id: RelationId
    card_hash: Sha256Hex
    effort: ReasoningEffort
    repeat_index: int
    pack_hash: Sha256Hex
    rubric_version: str

    @property
    def vote_id(self) -> Sha256Hex:
        return sha256_bytes(
            canonical_json_bytes(
                {
                    "bundle_id": self.bundle_id,
                    "card_hash": self.card_hash,
                    "effort": self.effort,
                    "provider_name": self.judge.provider_name,
                    "provider_slug": self.judge.provider_slug,
                    "openrouter_region": self.judge.openrouter_region,
                    "family_id": self.judge.family_id,
                    "output_token_limit": self.judge.output_token_limit.model_dump(mode="json"),
                    "model": self.judge.model,
                    "prompt_pack_hash": self.pack_hash,
                    "relation_id": self.relation_id,
                    "repeat_index": self.repeat_index,
                    "rubric_version": self.rubric_version,
                    "seed": self.judge.seed,
                    "temperature": self.judge.temperature,
                }
            )
        )


@dataclass(frozen=True)
class ResumePosition:
    next_task: VoteTask | None
    pending_attempts: list[PhysicalAttemptRow]


class VotePlan(Protocol):
    """A deterministic, streaming sequence of logical votes."""

    @property
    def expected_votes(self) -> int: ...

    def tasks(self) -> Iterator[VoteTask]: ...


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
        non_holdouts = [row for row in self.prepared.slice_rows if not row.is_holdout]
        for judge in self.config.judges:
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
    config: PilotRunConfig
    prepared: FullGridPreparedInputs

    @property
    def expected_votes(self) -> int:
        expectation = self.prepared.expectation
        return len(expectation.families) * len(expectation.bundles) * len(expectation.relation_ids)

    def tasks(self) -> Iterator[VoteTask]:
        expectation = self.prepared.expectation
        for judge in self.prepared.judges:
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


class CompletionTransport(Protocol):
    """One visible non-streaming request; SDK retries must remain disabled."""

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult: ...


def _duration_milliseconds(duration: timedelta) -> int:
    milliseconds = round(duration.total_seconds() * 1000)
    if milliseconds <= 0:
        raise ValueError("request timeout must be positive")
    return milliseconds


class OpenRouterTransport:
    """Native OpenRouter adapter with exact routing and privacy constraints."""

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("OpenRouter API key must not be empty")
        self._client = OpenRouter(api_key=api_key, retry_config=_NO_RETRIES)
        self._closed = False

    @classmethod
    def from_environment(cls) -> Self:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY is required to execute judge calls")
        return cls(api_key)

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        provider = ProviderPreferences(
            only=[judge.provider_slug],
            allow_fallbacks=False,
            require_parameters=True,
            data_collection="deny",
            zdr=True,
        )
        reasoning = ChatRequestReasoning(effort=effort)
        temperature = judge.temperature if judge.temperature is not None else UNSET
        seed = judge.seed if judge.seed is not None else UNSET
        match judge.output_token_limit:
            case MaxTokensLimit(tokens=tokens):
                result = self._client.chat.send(
                    messages=messages,
                    model=judge.model,
                    provider=provider,
                    reasoning=reasoning,
                    temperature=temperature,
                    seed=seed,
                    max_tokens=tokens,
                    x_open_router_metadata="enabled",
                    server_url=_openrouter_server_url(judge.openrouter_region),
                    session_id=session_id,
                    stream=False,
                    retries=_NO_RETRIES,
                    timeout_ms=_duration_milliseconds(timeout),
                    http_headers=_RESPONSE_CACHE_HEADERS,
                )
            case MaxCompletionTokensLimit(tokens=tokens):
                result = self._client.chat.send(
                    messages=messages,
                    model=judge.model,
                    provider=provider,
                    reasoning=reasoning,
                    temperature=temperature,
                    seed=seed,
                    max_completion_tokens=tokens,
                    x_open_router_metadata="enabled",
                    server_url=_openrouter_server_url(judge.openrouter_region),
                    session_id=session_id,
                    stream=False,
                    retries=_NO_RETRIES,
                    timeout_ms=_duration_milliseconds(timeout),
                    http_headers=_RESPONSE_CACHE_HEADERS,
                )
            case unexpected:
                assert_never(unexpected)
        if not isinstance(result, ChatResult):
            raise TypeError("OpenRouter returned a stream for a non-streaming request")
        return result

    def close(self) -> None:
        if not self._closed:
            self._client.__exit__(None, None, None)
            self._closed = True


def load_run_config(path: PathLike) -> PilotRunConfig:
    """Load and strictly validate the executor's versioned YAML configuration."""
    config_path = Path(path)
    try:
        payload = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        return PilotRunConfig.model_validate(payload)
    except (OSError, ValidationError, yaml.YAMLError) as error:
        raise ValueError(f"invalid pilot config {config_path}: {error}") from error


def _load_analysis_decisions(path: PathLike) -> LoadedAnalysisDecisions:
    decisions_path = Path(path)
    try:
        payload = decisions_path.read_bytes()
        decisions = AnalysisDecisions.model_validate_json(payload, strict=True)
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid analysis decisions {decisions_path}: {error}") from error
    return LoadedAnalysisDecisions(
        path=decisions_path,
        decisions=decisions,
        content_hash=sha256_bytes(payload),
    )


def load_analysis_decisions(path: PathLike) -> AnalysisDecisions:
    """Load a strict, versioned pilot decisions artifact."""
    return _load_analysis_decisions(path).decisions


def _bundle_parts(bundle_id: BundleId) -> BundleParts:
    shell, framing = bundle_id.split("x")
    return BundleParts(
        shell=cast("ShellId", shell),
        framing=cast("FramingId", framing),
    )


def _read_cards(path: Path) -> Iterator[EvaluationCard]:
    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                yield EvaluationCard.model_validate_json(line)
            except ValidationError as error:
                raise ValueError(f"invalid cards.jsonl line {line_number}: {error}") from error


def _verify_concat(cards_dir: Path) -> VerifiedConcat:
    cards_path = cards_dir / "cards.jsonl"
    manifest_path = cards_dir / "cards.manifest.json"
    if not cards_path.is_file() or not manifest_path.is_file():
        raise ValueError("evaluation requires a concat directory with cards and manifest")
    manifest_bytes = manifest_path.read_bytes()
    provenance = ConcatProvenance.model_validate_json(manifest_bytes)
    if provenance.producer != "relation.concat":
        raise ValueError("evaluation accepts only relation.concat card artifacts")
    if provenance.details.schema_version != CONCAT_SCHEMA_VERSION:
        raise ValueError(f"unsupported concat schema {provenance.details.schema_version}")
    recorded_hash = (provenance.content_hashes or {}).get("cards.jsonl")
    cards_hash = sha256_file(cards_path)
    if recorded_hash != cards_hash:
        raise ValueError("cards.jsonl does not match its concat manifest")
    return VerifiedConcat(
        cards_path=cards_path,
        manifest_path=manifest_path,
        source_hashes={
            "cards.jsonl": cards_hash,
            "cards.manifest.json": sha256_bytes(manifest_bytes),
        },
        row_count=provenance.details.row_count,
        source_namespaces=frozenset(provenance.details.sources),
    )


def _card_candidates(
    cards_path: Path,
    expected_rows: int,
    source_namespaces: set[str],
) -> tuple[list[CardCandidate], set[RelationId]]:
    candidates: list[CardCandidate] = []
    relation_ids: set[RelationId] = set()
    shot_ids = {relation_id for relation_id, _ in FEW_SHOT}
    for card in _read_cards(cards_path):
        if card.producer not in source_namespaces:
            raise ValueError(
                f"cards.jsonl relation {card.relation_id} references undeclared source "
                f"{card.producer!r}"
            )
        if card.relation_id in relation_ids:
            raise ValueError(f"cards.jsonl contains duplicate relation_id {card.relation_id}")
        relation_ids.add(card.relation_id)
        if card.relation_id not in shot_ids:
            candidates.append(
                CardCandidate(
                    relation_id=card.relation_id,
                    producer=card.producer,
                    card_hash=card.card_hash,
                    token_count=card.token_count,
                    prescreen_stratum=card.prescreen_stratum,
                    pilot_strata=tuple(sorted(set(card.pilot_strata))),
                )
            )
    if len(relation_ids) != expected_rows:
        raise ValueError(
            f"concat manifest row_count={expected_rows} but cards.jsonl contains "
            f"{len(relation_ids)} rows"
        )
    missing_shots = sorted(shot_ids - relation_ids)
    if missing_shots:
        raise ValueError(f"cards.jsonl is missing qualified few-shot cards: {missing_shots}")
    return candidates, relation_ids


def _length_quartiles(candidates: Sequence[CardCandidate]) -> dict[RelationId, int]:
    ordered = sorted(candidates, key=lambda card: (card.token_count, card.relation_id))
    count = len(ordered)
    return {card.relation_id: min(4, index * 4 // count + 1) for index, card in enumerate(ordered)}


def _sampling_stratum(card: CardCandidate, quartile: int) -> str:
    trouble = ",".join(card.pilot_strata) if card.pilot_strata else "ordinary"
    return f"{card.producer}|{card.prescreen_stratum}|length-q{quartile}|{trouble}"


def _selection_key(
    card: CardCandidate,
    *,
    cards_hash: Sha256Hex,
    sampling_hash: Sha256Hex,
    seed: int,
) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "card_hash": card.card_hash,
                "cards_hash": cards_hash,
                "relation_id": card.relation_id,
                "sampling_config_hash": sampling_hash,
                "seed": seed,
            }
        )
    )


def _apportion(sizes: Mapping[str, int], target: int) -> dict[str, int]:
    quotas = dict.fromkeys(sizes, 0)
    if target >= len(sizes):
        for stratum in sizes:
            quotas[stratum] = 1
    remaining = target - sum(quotas.values())

    while remaining:
        capacities = {
            stratum: size - quotas[stratum]
            for stratum, size in sizes.items()
            if size > quotas[stratum]
        }
        if not capacities:
            break
        total_capacity = sum(capacities.values())
        shares = {
            stratum: remaining * capacity / total_capacity
            for stratum, capacity in capacities.items()
        }
        allocated = 0
        for stratum, share in shares.items():
            amount = min(capacities[stratum], math.floor(share))
            quotas[stratum] += amount
            allocated += amount
        remaining -= allocated
        if remaining:
            ranked = sorted(
                capacities,
                key=lambda stratum: (-(shares[stratum] % 1), stratum),
            )
            for stratum in ranked:
                if remaining == 0:
                    break
                if quotas[stratum] < sizes[stratum]:
                    quotas[stratum] += 1
                    remaining -= 1
    return quotas


def _derive_slice(
    candidates: Sequence[CardCandidate],
    *,
    cards_hash: Sha256Hex,
    config: SliceSamplingConfig,
) -> DerivedSlice:
    if not candidates:
        raise ValueError("cards artifact contains no pilot-eligible relations")
    holdouts = dict(HOLDOUT)
    by_id = {card.relation_id: card for card in candidates}
    missing_holdouts = sorted(set(holdouts) - set(by_id))
    if missing_holdouts:
        raise ValueError(f"cards.jsonl is missing qualified holdout cards: {missing_holdouts}")

    quartiles = _length_quartiles(candidates)
    sampling_hash = sha256_bytes(canonical_json_bytes(config.model_dump(mode="json")))
    selection_keys = {
        card.relation_id: _selection_key(
            card,
            cards_hash=cards_hash,
            sampling_hash=sampling_hash,
            seed=config.seed,
        )
        for card in candidates
    }
    ordinary = [card for card in candidates if card.relation_id not in holdouts]
    target = min(config.non_holdout_count, len(ordinary))
    by_stratum: dict[str, list[CardCandidate]] = defaultdict(list)
    for card in ordinary:
        by_stratum[_sampling_stratum(card, quartiles[card.relation_id])].append(card)
    quotas = _apportion({stratum: len(cards) for stratum, cards in by_stratum.items()}, target)

    selected: list[CardCandidate] = []
    for stratum, cards in sorted(by_stratum.items()):
        ranked = sorted(
            cards, key=lambda card: (selection_keys[card.relation_id], card.relation_id)
        )
        selected.extend(ranked[: quotas[stratum]])
    selected.extend(by_id[relation_id] for relation_id in holdouts)

    rows = tuple(
        sorted(
            (
                SliceRow(
                    relation_id=card.relation_id,
                    card_hash=card.card_hash,
                    prescreen_stratum=card.prescreen_stratum,
                    sampling_stratum=_sampling_stratum(card, quartiles[card.relation_id]),
                    length_quartile=cast("Literal[1, 2, 3, 4]", quartiles[card.relation_id]),
                    pilot_strata=list(card.pilot_strata),
                    token_count=card.token_count,
                    is_holdout=card.relation_id in holdouts,
                    holdout_verdict=holdouts.get(card.relation_id),
                    sampling_seed=config.seed,
                    selection_key=selection_keys[card.relation_id],
                )
                for card in selected
            ),
            key=lambda row: row.relation_id,
        )
    )
    selection_hash = sha256_bytes(
        canonical_json_bytes([row.model_dump(mode="json") for row in rows])
    )
    return DerivedSlice(
        rows=rows,
        derivation=SliceDerivation(
            algorithm=config.algorithm,
            sampling_seed=config.seed,
            requested_non_holdouts=config.non_holdout_count,
            eligible_non_holdouts=len(ordinary),
            selected_non_holdouts=target,
            cards_hash=cards_hash,
            sampling_config_hash=sampling_hash,
            selection_hash=selection_hash,
        ),
    )


def _load_required_cards(
    cards_path: Path,
    required: set[RelationId],
) -> dict[RelationId, EvaluationCard]:
    cards = {
        card.relation_id: card for card in _read_cards(cards_path) if card.relation_id in required
    }
    missing = sorted(required - set(cards))
    if missing:
        raise ValueError(f"cards.jsonl is missing required cards: {missing}")
    return cards


def _build_prefixes(cards: Mapping[RelationId, EvaluationCard]) -> dict[BundleId, PromptPrefix]:
    prefixes: dict[BundleId, PromptPrefix] = {}
    for bundle in BUNDLES:
        parts = _bundle_parts(bundle)
        prefixes[bundle] = build_prompt_prefix(
            system_prompt=cast("Literal[1, 2, 3]", int(parts.shell[1])),
            framing=cast("Literal[1, 2, 3]", int(parts.framing[1])),
            cards=cards,
        )
    return prefixes


def _prepare_inputs(cards_dir: Path, config: PilotRunConfig) -> PreparedInputs:
    verified = _verify_concat(cards_dir)
    candidates, _ = _card_candidates(
        verified.cards_path,
        verified.row_count,
        set(verified.source_namespaces),
    )
    derived = _derive_slice(
        candidates,
        cards_hash=verified.source_hashes["cards.jsonl"],
        config=config.sampling,
    )
    required = {row.relation_id for row in derived.rows} | {
        relation_id for relation_id, _ in FEW_SHOT
    }
    cards = _load_required_cards(verified.cards_path, required)
    pack_hash = prompt_pack_hash(cards)
    if sha256_file(verified.cards_path) != verified.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed while preparing the pilot")
    return PreparedInputs(
        cards_dir=cards_dir,
        cards_path=verified.cards_path,
        manifest_path=verified.manifest_path,
        source_hashes=verified.source_hashes,
        cards=cards,
        prefixes=_build_prefixes(cards),
        pack_hash=pack_hash,
        full_grid_card_count=len(candidates),
        slice_rows=derived.rows,
        slice_derivation=derived.derivation,
    )


def _decision_family_map[Decision: FamilyDecision](
    decisions: Sequence[Decision],
    *,
    label: str,
) -> dict[str, Decision]:
    by_family: dict[str, Decision] = {}
    for decision in decisions:
        family_id = decision.family_id
        if not family_id:
            raise ValueError(f"{label} contains an invalid family_id")
        if family_id in by_family:
            raise ValueError(f"{label} contains duplicate family {family_id}")
        by_family[family_id] = decision
    return by_family


def _validate_admissions(decisions: AnalysisDecisions) -> None:
    by_axis: dict[Literal["shell", "template"], dict[str, bool]] = {
        "shell": {},
        "template": {},
    }
    for admission in decisions.admissions:
        levels = by_axis[admission.axis]
        if admission.level in levels:
            raise ValueError(
                f"analysis decisions contain duplicate {admission.axis} admission {admission.level}"
            )
        levels[admission.level] = admission.admitted

    expected_levels = {"shell": {"S2", "S3"}, "template": {"F2", "F3"}}
    if set(by_axis["shell"]) != expected_levels["shell"]:
        raise ValueError("analysis decisions do not contain the complete shell admission policy")
    if set(by_axis["template"]) != expected_levels["template"]:
        raise ValueError("analysis decisions do not contain the complete template admission policy")

    admitted_shells = {"S1"} | {level for level, admitted in by_axis["shell"].items() if admitted}
    admitted_templates = {"F1"} | {
        level for level, admitted in by_axis["template"].items() if admitted
    }
    if set(decisions.admitted_shells) != admitted_shells:
        raise ValueError("admitted_shells is inconsistent with the recorded admission decisions")
    if set(decisions.admitted_templates) != admitted_templates:
        raise ValueError("admitted_templates is inconsistent with the recorded admission decisions")


def _remaining_families(
    config: PilotRunConfig,
    decisions: AnalysisDecisions,
) -> set[str]:
    configured = {judge.family_id for judge in config.judges}
    qualification = _decision_family_map(decisions.qualification, label="qualification")
    if set(qualification) != configured:
        raise ValueError("analysis decisions and judge config contain different families")
    if len(decisions.pruned_families) != len(set(decisions.pruned_families)):
        raise ValueError("analysis decisions contain duplicate pruned families")
    expected_pruned = {
        family_id for family_id, result in qualification.items() if not result.passed
    }
    if set(decisions.pruned_families) != expected_pruned:
        raise ValueError("pruned_families is inconsistent with qualification results")
    remaining = configured - expected_pruned
    if not remaining:
        raise ValueError("analysis decisions pruned every configured judge family")
    return remaining


def _authorized_judges(
    config: PilotRunConfig,
    decisions: AnalysisDecisions,
) -> AuthorizedJudges:
    remaining = _remaining_families(config, decisions)
    efforts = _decision_family_map(decisions.effort_policy, label="effort_policy")
    cost_audit = _decision_family_map(decisions.cost_audit, label="cost_audit")
    if set(efforts) != remaining:
        raise ValueError("effort_policy must contain exactly the non-pruned judge families")
    if set(cost_audit) != remaining:
        raise ValueError("cost_audit must contain exactly the non-pruned judge families")

    family_efforts: dict[str, ReasoningEffort] = {}
    judges: list[JudgeConfig] = []
    for judge in config.judges:
        if judge.family_id not in remaining:
            continue
        decision = efforts[judge.family_id]
        selected = decision.selected_effort
        if decision.baseline_effort != config.baseline_effort:
            raise ValueError(f"baseline effort mismatch for family {judge.family_id}")
        if decision.candidate_effort != judge.higher_effort:
            raise ValueError(f"candidate effort mismatch for family {judge.family_id}")
        if selected not in {config.baseline_effort, judge.higher_effort}:
            raise ValueError(f"selected effort is not configured for family {judge.family_id}")
        if cost_audit[judge.family_id].selected_effort != selected:
            raise ValueError(f"cost audit effort mismatch for family {judge.family_id}")
        family_efforts[judge.family_id] = selected
        judges.append(judge)
    return AuthorizedJudges(judges=tuple(judges), family_efforts=family_efforts)


def _admitted_bundles(decisions: AnalysisDecisions) -> list[BundleId]:
    admitted_shells = set(decisions.admitted_shells)
    admitted_templates = set(decisions.admitted_templates)
    return [
        bundle
        for bundle in BUNDLES
        if (parts := _bundle_parts(bundle)).shell in admitted_shells
        and parts.framing in admitted_templates
    ]


def _full_grid_authorization(
    config: PilotRunConfig,
    decisions: AnalysisDecisions,
    candidates: Sequence[CardCandidate],
) -> FullGridAuthorization:
    if (
        decisions.rubric_version != RUBRIC_VERSION
        or decisions.rubric_version != config.rubric_version
    ):
        raise ValueError("analysis decisions, executor config, and current rubric do not match")
    _validate_admissions(decisions)
    authorized = _authorized_judges(config, decisions)
    expectation = FullGridExpectation(
        families=[judge.family_id for judge in authorized.judges],
        admitted_shells=list(decisions.admitted_shells),
        admitted_templates=list(decisions.admitted_templates),
        bundles=_admitted_bundles(decisions),
        relation_ids=sorted(candidate.relation_id for candidate in candidates),
        family_efforts=authorized.family_efforts,
    )
    return FullGridAuthorization(expectation=expectation, judges=authorized.judges)


def _prepare_full_grid_inputs(
    cards_dir: Path,
    decisions_path: Path,
    config: PilotRunConfig,
) -> FullGridPreparedInputs:
    loaded = _load_analysis_decisions(decisions_path)
    verified = _verify_concat(cards_dir)
    candidates, _ = _card_candidates(
        verified.cards_path,
        verified.row_count,
        set(verified.source_namespaces),
    )
    required = {candidate.relation_id for candidate in candidates} | {
        relation_id for relation_id, _ in FEW_SHOT
    }
    cards = _load_required_cards(verified.cards_path, required)
    pack_hash = prompt_pack_hash(cards)
    if pack_hash != loaded.decisions.prompt_pack_hash:
        raise ValueError(
            "analysis decisions prompt_pack_hash does not match the current prompt pack"
        )
    authorization = _full_grid_authorization(config, loaded.decisions, candidates)
    if sha256_file(verified.cards_path) != verified.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed while preparing the full grid")
    if sha256_file(loaded.path) != loaded.content_hash:
        raise ValueError("analysis decisions changed while preparing the full grid")
    return FullGridPreparedInputs(
        cards_dir=cards_dir,
        cards_path=verified.cards_path,
        manifest_path=verified.manifest_path,
        source_hashes=verified.source_hashes,
        cards=cards,
        prefixes=_build_prefixes(cards),
        pack_hash=pack_hash,
        decisions_path=loaded.path,
        decisions_hash=loaded.content_hash,
        decisions=loaded.decisions,
        expectation=authorization.expectation,
        judges=authorization.judges,
    )


def _executor_policy_payload() -> dict[str, JsonValue]:
    return {
        "card_eligibility": "exclude-few-shot-and-severely-truncated-v1",
        "malformed_output_repair_limit": 1,
        "task_order": "vote-plan-stream-v1",
    }


def _request_policy_payload() -> dict[str, JsonValue]:
    return cast(
        "dict[str, JsonValue]",
        {
            "allow_fallbacks": False,
            "cache_headers": _RESPONSE_CACHE_HEADERS,
            "data_collection": "deny",
            "metadata": "enabled",
            "require_parameters": True,
            "retries": "none",
            "stream": False,
            "zdr": True,
        },
    )


def _request_contract_hash(config: PilotRunConfig) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "config": config.model_dump(mode="json", exclude={"max_cost_usd"}),
                "executor_policy": _executor_policy_payload(),
                "openrouter_openapi_version": openrouter.OPENAPI_DOC_VERSION,
                "openrouter_sdk_version": version("openrouter"),
                "request_policy": _request_policy_payload(),
            }
        )
    )


def _plan_hash(config: PilotRunConfig, plan: VotePlan) -> Sha256Hex:
    digest = hashlib.sha256()
    digest.update(_request_contract_hash(config).encode("ascii"))
    digest.update(b"\n")
    for task in plan.tasks():
        digest.update(task.vote_id.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def _paths(out_dir: Path) -> PilotPaths:
    return PilotPaths(
        votes_jsonl=out_dir / "votes.jsonl",
        attempts_jsonl=out_dir / "attempts.jsonl",
        slice_jsonl=out_dir / "slice.jsonl",
        manifest_json=out_dir / "manifest.json",
        run_state_json=out_dir / "run-state.json",
        inflight_json=out_dir / "inflight-request.json",
        lock_file=out_dir / ".run.lock",
    )


def _full_grid_paths(out_dir: Path) -> FullGridPaths:
    return FullGridPaths(
        votes_jsonl=out_dir / "votes.jsonl",
        attempts_jsonl=out_dir / "attempts.jsonl",
        manifest_json=out_dir / "manifest.json",
        run_state_json=out_dir / "run-state.json",
        inflight_json=out_dir / "inflight-request.json",
        lock_file=out_dir / ".run.lock",
    )


def _sync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_atomic(path: Path, payload: bytes) -> None:
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as output:
        temporary = Path(output.name)
        try:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        temporary.replace(path)
        _sync_directory(path.parent)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


@contextmanager
def _exclusive_run_lock(out_dir: Path) -> Iterator[None]:
    out_dir.mkdir(parents=True, exist_ok=True)
    lock_path = out_dir / ".run.lock"
    with lock_path.open("a+b") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError(f"another evaluator is already using {out_dir}") from error
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def _jsonl_bytes(rows: Iterable[BaseModel]) -> bytes:
    return b"".join(canonical_json_bytes(row) + b"\n" for row in rows)


def _prepare_pilot_run_state(
    out_dir: Path,
    *,
    state: PilotRunState,
    slice_rows: Sequence[SliceRow],
) -> PilotPaths:
    paths = _paths(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if paths.manifest_json.exists():
        existing = PilotRunState.model_validate_json(paths.run_state_json.read_text())
        if existing != state:
            raise ValueError("completed output does not match the requested pilot plan")
        return paths

    if paths.run_state_json.exists():
        existing = PilotRunState.model_validate_json(paths.run_state_json.read_text())
        if existing != state:
            raise ValueError("partial output does not match the requested pilot plan")
        missing = [
            path.name
            for path in (paths.votes_jsonl, paths.attempts_jsonl, paths.slice_jsonl)
            if not path.is_file()
        ]
        if missing:
            raise ValueError(f"partial output is missing durable files: {sorted(missing)}")
        if sha256_file(paths.slice_jsonl) != state.slice_hash:
            raise ValueError("partial output slice.jsonl does not match run-state.json")
    else:
        unexpected = [
            path.name
            for path in (
                paths.votes_jsonl,
                paths.attempts_jsonl,
                paths.slice_jsonl,
                paths.inflight_json,
            )
            if path.exists()
        ]
        if unexpected:
            raise ValueError(f"output has files without run-state.json: {sorted(unexpected)}")
        slice_bytes = _jsonl_bytes(slice_rows)
        _write_atomic(paths.slice_jsonl, slice_bytes)
        paths.votes_jsonl.touch()
        paths.attempts_jsonl.touch()
        _write_atomic(
            paths.run_state_json,
            canonical_json_bytes(state.model_dump(mode="json")) + b"\n",
        )
    return paths


def _prepare_full_grid_run_state(
    out_dir: Path,
    *,
    state: FullGridRunState,
) -> FullGridPaths:
    paths = _full_grid_paths(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if paths.manifest_json.exists():
        existing = FullGridRunState.model_validate_json(paths.run_state_json.read_text())
        if existing != state:
            raise ValueError("completed output does not match the requested full-grid plan")
        return paths

    if paths.run_state_json.exists():
        existing = FullGridRunState.model_validate_json(paths.run_state_json.read_text())
        if existing != state:
            raise ValueError("partial output does not match the requested full-grid plan")
        missing = [
            path.name for path in (paths.votes_jsonl, paths.attempts_jsonl) if not path.is_file()
        ]
        if missing:
            raise ValueError(f"partial output is missing durable files: {sorted(missing)}")
    else:
        unexpected = [
            path.name
            for path in (paths.votes_jsonl, paths.attempts_jsonl, paths.inflight_json)
            if path.exists()
        ]
        if unexpected:
            raise ValueError(f"output has files without run-state.json: {sorted(unexpected)}")
        paths.votes_jsonl.touch()
        paths.attempts_jsonl.touch()
        _write_atomic(
            paths.run_state_json,
            canonical_json_bytes(state.model_dump(mode="json")) + b"\n",
        )
    return paths


def _load_jsonl[Model: BaseModel](path: Path, model: type[Model]) -> list[Model]:
    rows: list[Model] = []
    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                rows.append(model.model_validate_json(line))
            except ValidationError as error:
                raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error
    return rows


def _task_messages(task: VoteTask, prepared: PreparedCards) -> list[ChatMessages]:
    parts = _bundle_parts(task.bundle_id)
    return build_live_prompt(
        prepared.prefixes[task.bundle_id],
        framing=cast("Literal[1, 2, 3]", int(parts.framing[1])),
        card_text=prepared.cards[task.relation_id].card_text,
    )


def _validate_vote_task(vote: VoteRow, task: VoteTask) -> None:
    parts = _bundle_parts(task.bundle_id)
    expected = {
        "bundle_id": task.bundle_id,
        "card_hash": task.card_hash,
        "effort": task.effort,
        "family_id": task.judge.family_id,
        "framing_id": parts.framing,
        "prompt_pack_hash": task.pack_hash,
        "relation_id": task.relation_id,
        "repeat_index": task.repeat_index,
        "rubric_version": task.rubric_version,
        "seed": task.judge.seed,
        "shell_id": parts.shell,
        "temperature": task.judge.temperature,
        "vote_id": task.vote_id,
    }
    mismatches = [field for field, value in expected.items() if getattr(vote, field) != value]
    if mismatches:
        raise ValueError(f"vote {vote.vote_id} does not match its task fields: {mismatches}")
    if vote.model_returned != task.judge.model or vote.provider != task.judge.provider_name:
        raise ValueError(f"vote {vote.vote_id} does not match its model/provider pin")


type AttemptsByStage = dict[Literal["initial", "repair"], list[PhysicalAttemptRow]]


def _attempts_by_stage(task: VoteTask, attempts: Sequence[PhysicalAttemptRow]) -> AttemptsByStage:
    grouped: AttemptsByStage = {"initial": [], "repair": []}
    for attempt in attempts:
        identity = (
            attempt.vote_id,
            attempt.family_id,
            attempt.provider_slug,
            attempt.model_requested,
        )
        expected = (
            task.vote_id,
            task.judge.family_id,
            task.judge.provider_slug,
            task.judge.model,
        )
        if identity != expected:
            raise ValueError(
                f"attempt {attempt.attempt_id} does not match vote task {task.vote_id}"
            )
        expected_id = sha256_bytes(
            canonical_json_bytes(
                {
                    "request_hash": attempt.request_hash,
                    "stage_attempt": attempt.stage_attempt,
                }
            )
        )
        if attempt.attempt_id != expected_id:
            raise ValueError(f"attempt {attempt.attempt_id} has an invalid deterministic ID")
        grouped[attempt.request_stage].append(attempt)
    return grouped


def _validate_stage_journal(task: VoteTask, grouped: AttemptsByStage) -> None:
    for stage, attempts in grouped.items():
        if [attempt.stage_attempt for attempt in attempts] != list(range(len(attempts))):
            raise ValueError(f"attempts for {task.vote_id}/{stage} are not a contiguous journal")
        successful = [attempt for attempt in attempts if attempt.failure is None]
        if len(successful) > 1:
            raise ValueError(
                f"attempts for {task.vote_id} contain multiple successful {stage} calls"
            )
        if successful and attempts[-1] is not successful[0]:
            raise ValueError(f"attempts for {task.vote_id} continue after successful {stage} call")


def _successful_raw(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
    stage: Literal["initial", "repair"],
) -> str | None:
    attempt = _successful_attempt(attempts, stage)
    if attempt is None:
        return None
    if attempt.result is None:
        raise ValueError(f"successful {stage} attempt for {task.vote_id} has no result")
    return _accepted_completion(attempt.result, task.judge).content


def _validate_request_hashes(
    task: VoteTask,
    grouped: AttemptsByStage,
    prepared: PreparedCards,
    timeout: timedelta,
) -> None:
    messages = _task_messages(task, prepared)
    initial_hash = _request_hash(messages, task, "initial", timeout)
    if any(attempt.request_hash != initial_hash for attempt in grouped["initial"]):
        raise ValueError(f"initial request hash mismatch for {task.vote_id}")
    if not grouped["repair"]:
        return
    initial_raw = _successful_raw(task, grouped["initial"], "initial")
    if initial_raw is None:
        raise ValueError(f"repair attempts for {task.vote_id} lack a successful initial call")
    try:
        parse_response(initial_raw)
    except MalformedResponseError:
        pass
    else:
        raise ValueError(f"repair attempts for {task.vote_id} follow a valid initial response")
    repair_hash = _request_hash(build_retry_prompt(messages, initial_raw), task, "repair", timeout)
    if any(attempt.request_hash != repair_hash for attempt in grouped["repair"]):
        raise ValueError(f"repair request hash mismatch for {task.vote_id}")


def _validate_attempt_outcomes(task: VoteTask, attempts: Sequence[PhysicalAttemptRow]) -> None:
    for attempt in attempts:
        if attempt.result is None:
            continue
        try:
            _accepted_completion(attempt.result, task.judge)
        except ValueError:
            if attempt.failure is None:
                raise ValueError(
                    f"attempt {attempt.attempt_id} stores a rejected result as successful"
                ) from None
        else:
            if attempt.failure is not None:
                raise ValueError(
                    f"attempt {attempt.attempt_id} stores a valid result with a failure"
                )


def _validate_vote_accounting(vote: VoteRow, attempts: Sequence[PhysicalAttemptRow]) -> None:
    recorded = UsageAccounting(
        tokens_in=vote.tokens_in,
        tokens_out=vote.tokens_out,
        tokens_cached=vote.tokens_cached,
        tokens_cache_write=vote.tokens_cache_write,
        tokens_reasoning=vote.tokens_reasoning,
        known_cost_usd=vote.known_cost_usd,
        cost_complete=vote.cost_complete,
    )
    expected = _aggregate_physical_usage(attempts)
    if recorded != expected or vote.cost_usd != expected.cost_usd:
        raise ValueError(f"vote {vote.vote_id} accounting does not match attempts.jsonl")


def _validate_vote_timing(vote: VoteRow, attempts: Sequence[PhysicalAttemptRow]) -> None:
    if vote.ts_request != min(attempt.ts_request for attempt in attempts):
        raise ValueError(f"vote {vote.vote_id} ts_request does not match attempts.jsonl")
    if vote.ts_response != max(attempt.ts_response for attempt in attempts):
        raise ValueError(f"vote {vote.vote_id} ts_response does not match attempts.jsonl")
    expected_latency = sum((attempt.latency for attempt in attempts), start=timedelta())
    if vote.latency != expected_latency:
        raise ValueError(f"vote {vote.vote_id} latency does not match attempts.jsonl")


def _validate_completed_vote(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
    vote: VoteRow,
) -> None:
    _validate_vote_task(vote, task)
    successful_results = [
        attempt.result
        for attempt in attempts
        if attempt.failure is None and attempt.result is not None
    ]
    if successful_results != vote.attempt_results:
        raise ValueError(f"vote {vote.vote_id} native results do not match attempts.jsonl")
    if len(successful_results) != vote.parse_retries + 1:
        raise ValueError(f"vote {vote.vote_id} parse retry count does not match attempts.jsonl")
    _validate_vote_accounting(vote, attempts)
    _validate_vote_timing(vote, attempts)


def _validate_attempt_sequence(
    task: VoteTask,
    attempts: Sequence[PhysicalAttemptRow],
    prepared: PreparedCards,
    timeout: timedelta,
    vote: VoteRow | None,
) -> None:
    grouped = _attempts_by_stage(task, attempts)
    _validate_stage_journal(task, grouped)
    _validate_request_hashes(task, grouped, prepared, timeout)
    _validate_attempt_outcomes(task, attempts)
    if vote is not None:
        _validate_completed_vote(task, attempts, vote)


def _resume_position(
    tasks: Iterator[VoteTask],
    votes: Sequence[VoteRow],
    attempts: Sequence[PhysicalAttemptRow],
    prepared: PreparedCards,
    timeout: timedelta,
) -> ResumePosition:
    attempt_ids: set[Sha256Hex] = set()
    by_vote: dict[Sha256Hex, list[PhysicalAttemptRow]] = defaultdict(list)
    for attempt in attempts:
        if attempt.attempt_id in attempt_ids:
            raise ValueError(f"attempts.jsonl contains duplicate attempt {attempt.attempt_id}")
        attempt_ids.add(attempt.attempt_id)
        by_vote[attempt.vote_id].append(attempt)

    for vote in votes:
        try:
            task = next(tasks)
        except StopIteration as error:
            raise ValueError("votes.jsonl contains more votes than the requested plan") from error
        if vote.vote_id != task.vote_id:
            raise ValueError("votes.jsonl is not a valid prefix of the requested plan")
        task_attempts = by_vote.pop(vote.vote_id, [])
        if not task_attempts:
            raise ValueError(f"vote {vote.vote_id} has no physical attempt evidence")
        _validate_attempt_sequence(task, task_attempts, prepared, timeout, vote)

    next_task = next(tasks, None)
    if next_task is None:
        if by_vote:
            raise ValueError("attempts.jsonl contains attempts beyond the completed plan")
        return ResumePosition(next_task=None, pending_attempts=[])
    unexpected = set(by_vote) - {next_task.vote_id}
    if unexpected:
        raise ValueError("attempts.jsonl contains an attempt beyond the resumable vote")
    incomplete = by_vote.get(next_task.vote_id, [])
    _validate_attempt_sequence(next_task, incomplete, prepared, timeout, None)
    return ResumePosition(next_task=next_task, pending_attempts=incomplete)


def _session_id(task: VoteTask) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "bundle": task.bundle_id,
                "effort": task.effort,
                "family": task.judge.family_id,
            }
        )
    )


def _request_hash(
    messages: Sequence[ChatMessages],
    task: VoteTask,
    stage: Literal["initial", "repair"],
    timeout: timedelta,
) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "effort": task.effort,
                "output_token_limit": task.judge.output_token_limit.model_dump(mode="json"),
                "messages": [
                    message.model_dump(mode="json", by_alias=True, exclude_unset=True)
                    for message in messages
                ],
                "model": task.judge.model,
                "provider_name": task.judge.provider_name,
                "provider_slug": task.judge.provider_slug,
                "openrouter_region": task.judge.openrouter_region,
                "request_policy": _request_policy_payload(),
                "seed": task.judge.seed,
                "session_id": _session_id(task),
                "stage": stage,
                "temperature": task.judge.temperature,
                "timeout": timeout.total_seconds(),
                "vote_id": task.vote_id,
            }
        )
    )


def _failure_from_exception(error: Exception, category: str) -> AttemptFailure:
    response = getattr(error, "raw_response", None)
    status = getattr(error, "status_code", None)
    if not isinstance(status, int):
        status = getattr(response, "status_code", None)
    body = getattr(error, "body", None)
    return AttemptFailure(
        category=cast(
            "Literal['transport', 'provider', 'response', 'routing', 'accounting']",
            category,
        ),
        exception_type=f"{type(error).__module__}.{type(error).__qualname__}",
        message=str(error) or type(error).__qualname__,
        status_code=status if isinstance(status, int) else None,
        response_body=body if isinstance(body, str) else None,
    )


def _completion_content(result: ChatResult) -> str:
    if len(result.choices) != 1:
        raise ValueError("completion must contain exactly one choice")
    choice = result.choices[0]
    if choice.index != 0:
        raise ValueError("completion choice index must be zero")
    if choice.finish_reason != "stop":
        raise ValueError(f"completion finish_reason must be stop, got {choice.finish_reason!r}")

    message = choice.message.model_dump(mode="json", by_alias=True, exclude_unset=True)
    if message.get("refusal") not in (None, ""):
        raise ValueError("completion contained a refusal")
    if message.get("tool_calls"):
        raise ValueError("completion contained tool calls")
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("completion content must be a non-empty string")
    return content


def _validate_usage(result: ChatResult) -> None:
    if result.usage is None:
        raise ValueError("completion omitted required usage accounting")
    usage = result.usage.model_dump(mode="json", by_alias=True, exclude_unset=True)
    for field in ("prompt_tokens", "completion_tokens", "total_tokens"):
        value = usage.get(field)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError(f"completion usage.{field} must be a non-negative integer")


def _route_provider(result: ChatResult, judge: JudgeConfig) -> str:
    if result.model != judge.model:
        raise ValueError(f"completion returned model {result.model!r}, expected {judge.model!r}")
    metadata = result.openrouter_metadata
    if metadata is None:
        raise ValueError("completion omitted required OpenRouter routing metadata")
    if metadata.requested != judge.model:
        raise ValueError(
            f"router metadata requested model {metadata.requested!r}, expected {judge.model!r}"
        )
    if metadata.strategy != "direct" or metadata.attempt != 1:
        raise ValueError("completion was not served by the first direct provider attempt")

    selected = [endpoint for endpoint in metadata.endpoints.available if endpoint.selected]
    if len(selected) != 1:
        raise ValueError("completion metadata must identify exactly one selected endpoint")
    provider_name = selected[0].provider
    if provider_name != judge.provider_name:
        raise ValueError(
            f"selected endpoint used provider {provider_name!r}, expected {judge.provider_name!r}"
        )

    if metadata.attempts:
        if len(metadata.attempts) != 1:
            raise ValueError("completion reported multiple provider attempts for an exact route")
        route = metadata.attempts[0]
        if route.status != _HTTP_OK:
            raise ValueError(f"provider attempt status must be {_HTTP_OK}, got {route.status}")
        if route.provider != provider_name:
            raise ValueError("provider attempt disagrees with the selected endpoint")
    return provider_name


def _accepted_completion(result: ChatResult, judge: JudgeConfig) -> AcceptedCompletion:
    content = _completion_content(result)
    _validate_usage(result)
    return AcceptedCompletion(
        content=content,
        provider_name=_route_provider(result, judge),
    )


def _append_jsonl(path: Path, row: BaseModel) -> None:
    with path.open("ab") as output:
        output.write(canonical_json_bytes(row) + b"\n")
        # Every row follows a potentially paid call. fsync is intentional: resume must never
        # issue a duplicate request because an acknowledged journal row remained in page cache.
        output.flush()
        os.fsync(output.fileno())


def _clear_inflight(path: Path) -> None:
    path.unlink(missing_ok=True)
    _sync_directory(path.parent)


def _recover_inflight(path: Path, attempts: Sequence[PhysicalAttemptRow]) -> None:
    if not path.exists():
        return
    try:
        inflight = InFlightRequest.model_validate_json(path.read_bytes())
    except ValidationError as error:
        raise ValueError(f"invalid {path.name}: {error}") from error
    if any(attempt.attempt_id == inflight.attempt_id for attempt in attempts):
        _clear_inflight(path)
        return
    raise ValueError(
        "a request was durably marked in flight but has no recorded outcome; its billing state "
        "is unknown, so automatic retry is unsafe"
    )


def _call(
    *,
    task: VoteTask,
    stage: Literal["initial", "repair"],
    messages: list[ChatMessages],
    previous: Sequence[PhysicalAttemptRow],
    transport: CompletionTransport,
    attempts_path: Path,
    inflight_path: Path,
    timeout: timedelta,
) -> PhysicalAttemptRow:
    stage_attempt = sum(attempt.request_stage == stage for attempt in previous)
    request_hash = _request_hash(messages, task, stage, timeout)
    attempt_id = sha256_bytes(
        canonical_json_bytes(
            {
                "request_hash": request_hash,
                "stage_attempt": stage_attempt,
            }
        )
    )
    ts_request = datetime.now(UTC)
    _write_atomic(
        inflight_path,
        canonical_json_bytes(
            InFlightRequest(
                attempt_id=attempt_id,
                vote_id=task.vote_id,
                request_hash=request_hash,
                request_stage=stage,
                stage_attempt=stage_attempt,
                created_at=ts_request,
            )
        )
        + b"\n",
    )
    monotonic_start = time.monotonic()
    try:
        result = transport.complete(
            messages=messages,
            judge=task.judge,
            effort=task.effort,
            session_id=_session_id(task),
            timeout=timeout,
        )
    except Exception as error:
        ts_response = datetime.now(UTC)
        attempt = PhysicalAttemptRow(
            attempt_id=attempt_id,
            vote_id=task.vote_id,
            request_stage=stage,
            stage_attempt=stage_attempt,
            request_hash=request_hash,
            family_id=task.judge.family_id,
            provider_slug=task.judge.provider_slug,
            model_requested=task.judge.model,
            result=None,
            failure=_failure_from_exception(error, "transport"),
            ts_request=ts_request,
            ts_response=ts_response,
            latency=timedelta(seconds=time.monotonic() - monotonic_start),
        )
        _append_jsonl(attempts_path, attempt)
        _clear_inflight(inflight_path)
        raise RuntimeError(f"physical request failed; resume preserved at {attempt_id}") from error

    ts_response = datetime.now(UTC)
    try:
        _accepted_completion(result, task.judge)
    except ValueError as error:
        message = str(error)
        category = (
            "accounting"
            if "usage" in message
            else "routing"
            if any(token in message for token in ("route", "model", "provider", "metadata"))
            else "response"
        )
        attempt = PhysicalAttemptRow(
            attempt_id=attempt_id,
            vote_id=task.vote_id,
            request_stage=stage,
            stage_attempt=stage_attempt,
            request_hash=request_hash,
            family_id=task.judge.family_id,
            provider_slug=task.judge.provider_slug,
            model_requested=task.judge.model,
            result=result,
            failure=_failure_from_exception(error, category),
            ts_request=ts_request,
            ts_response=ts_response,
            latency=timedelta(seconds=time.monotonic() - monotonic_start),
        )
        _append_jsonl(attempts_path, attempt)
        _clear_inflight(inflight_path)
        raise RuntimeError(
            f"provider response rejected; resume preserved at {attempt_id}"
        ) from error

    attempt = PhysicalAttemptRow(
        attempt_id=attempt_id,
        vote_id=task.vote_id,
        request_stage=stage,
        stage_attempt=stage_attempt,
        request_hash=request_hash,
        family_id=task.judge.family_id,
        provider_slug=task.judge.provider_slug,
        model_requested=task.judge.model,
        result=result,
        failure=None,
        ts_request=ts_request,
        ts_response=ts_response,
        latency=timedelta(seconds=time.monotonic() - monotonic_start),
    )
    _append_jsonl(attempts_path, attempt)
    _clear_inflight(inflight_path)
    return attempt


def _successful_attempt(
    attempts: Sequence[PhysicalAttemptRow],
    stage: Literal["initial", "repair"],
) -> PhysicalAttemptRow | None:
    successful = [
        attempt
        for attempt in attempts
        if attempt.request_stage == stage and attempt.failure is None
    ]
    if len(successful) > 1:
        raise ValueError(f"attempt journal contains multiple successful {stage} requests")
    return successful[0] if successful else None


def _usage_number(payload: Mapping[str, JsonValue], field: str) -> int:
    value = payload.get(field)
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"native usage field {field} is missing or invalid")
    return value


def _nested_usage_number(
    payload: Mapping[str, JsonValue],
    parent: str,
    field: str,
) -> int:
    details = payload.get(parent)
    if details is None:
        return 0
    if not isinstance(details, dict):
        raise TypeError(f"native usage field {parent} must be an object when present")
    value = details.get(field)
    if value is None:
        return 0
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"native usage field {parent}.{field} must be a non-negative integer")
    return value


def _usage_cost(payload: Mapping[str, JsonValue]) -> float | None:
    cost = payload.get("cost")
    if isinstance(cost, bool) or not isinstance(cost, int | float) or not math.isfinite(cost):
        return None
    known_cost = float(cost)
    if known_cost < 0:
        raise ValueError("native usage cost must not be negative")
    return known_cost


def _aggregate_usage(results: Sequence[ChatResult]) -> UsageAccounting:
    accounting = UsageAccounting()
    for result in results:
        if result.usage is None:
            raise ValueError("cannot aggregate a result without usage")
        usage = cast(
            "dict[str, JsonValue]",
            result.usage.model_dump(mode="json", by_alias=True, exclude_unset=True),
        )
        known_cost = _usage_cost(usage)
        result_accounting = UsageAccounting(
            tokens_in=_usage_number(usage, "prompt_tokens"),
            tokens_out=_usage_number(usage, "completion_tokens"),
            tokens_cached=_nested_usage_number(usage, "prompt_tokens_details", "cached_tokens"),
            tokens_cache_write=_nested_usage_number(
                usage, "prompt_tokens_details", "cache_write_tokens"
            ),
            tokens_reasoning=_nested_usage_number(
                usage, "completion_tokens_details", "reasoning_tokens"
            ),
            known_cost_usd=known_cost if known_cost is not None else 0.0,
            cost_complete=known_cost is not None,
        )
        accounting = accounting.combine(result_accounting)
    return accounting


def _aggregate_physical_usage(attempts: Sequence[PhysicalAttemptRow]) -> UsageAccounting:
    accounting = UsageAccounting()
    for attempt in attempts:
        if attempt.result is None:
            accounting = accounting.mark_incomplete()
            continue
        try:
            result_accounting = _aggregate_usage([attempt.result])
        except TypeError, ValueError:
            accounting = accounting.mark_incomplete()
            continue
        accounting = accounting.combine(result_accounting)
    return accounting


def _execute_vote(
    *,
    task: VoteTask,
    card: EvaluationCard,
    prefix: PromptPrefix,
    pending: list[PhysicalAttemptRow],
    transport: CompletionTransport,
    attempts_path: Path,
    inflight_path: Path,
    config: PilotRunConfig,
    prior_known_cost: float,
    prior_cost_complete: bool,
    votes_completed: int,
) -> VoteRow:
    parts = _bundle_parts(task.bundle_id)
    framing_number = cast("Literal[1, 2, 3]", int(parts.framing[1]))
    messages = build_live_prompt(prefix, framing=framing_number, card_text=card.card_text)

    initial = _successful_attempt(pending, "initial")
    if initial is None:
        initial = _call(
            task=task,
            stage="initial",
            messages=messages,
            previous=pending,
            transport=transport,
            attempts_path=attempts_path,
            inflight_path=inflight_path,
            timeout=config.request_timeout,
        )
        pending.append(initial)
    if initial.result is None:
        raise ValueError("successful initial attempt is missing its result")
    initial_raw = _accepted_completion(initial.result, task.judge).content

    results = [initial.result]
    initial_raw_completion: str | None = None
    try:
        parsed: Response | None = parse_response(initial_raw)
    except MalformedResponseError:
        parsed = None
    final_raw = initial_raw

    if parsed is None:
        initial_raw_completion = initial_raw
        pending_accounting = _aggregate_physical_usage(pending)
        _enforce_cost_cap(
            config,
            votes_completed=votes_completed,
            known_cost=prior_known_cost + pending_accounting.known_cost_usd,
            cost_complete=prior_cost_complete and pending_accounting.cost_complete,
        )
        repair_messages = build_retry_prompt(messages, initial_raw)
        repair = _successful_attempt(pending, "repair")
        if repair is None:
            repair = _call(
                task=task,
                stage="repair",
                messages=repair_messages,
                previous=pending,
                transport=transport,
                attempts_path=attempts_path,
                inflight_path=inflight_path,
                timeout=config.request_timeout,
            )
            pending.append(repair)
        if repair.result is None:
            raise ValueError("successful repair attempt is missing its result")
        final_raw = _accepted_completion(repair.result, task.judge).content
        results.append(repair.result)
        try:
            parsed = parse_response(final_raw)
        except MalformedResponseError:
            parsed = None

    accounting = _aggregate_physical_usage(pending)
    accepted = _accepted_completion(results[-1], task.judge)
    parts = _bundle_parts(task.bundle_id)
    return VoteRow(
        vote_id=task.vote_id,
        relation_id=task.relation_id,
        card_hash=task.card_hash,
        family_id=task.judge.family_id,
        provider=accepted.provider_name,
        model_returned=results[-1].model,
        shell_id=parts.shell,
        framing_id=parts.framing,
        bundle_id=task.bundle_id,
        rubric_version=task.rubric_version,
        prompt_pack_hash=task.pack_hash,
        verdict=parsed.verdict if parsed is not None else "ABSTAIN",
        reason=parsed.reason if parsed is not None else "",
        raw_completion=final_raw,
        parse_retries=1 if initial_raw_completion is not None else 0,
        abstained=parsed is None,
        initial_raw_completion=initial_raw_completion,
        attempt_results=results,
        effort=task.effort,
        temperature=task.judge.temperature,
        seed=task.judge.seed,
        repeat_index=task.repeat_index,
        tokens_in=accounting.tokens_in,
        tokens_out=accounting.tokens_out,
        tokens_cached=accounting.tokens_cached,
        tokens_cache_write=accounting.tokens_cache_write,
        tokens_reasoning=accounting.tokens_reasoning,
        known_cost_usd=accounting.known_cost_usd,
        cost_complete=accounting.cost_complete,
        cost_usd=accounting.cost_usd,
        ts_request=min(attempt.ts_request for attempt in pending),
        ts_response=max(attempt.ts_response for attempt in pending),
        latency=sum((attempt.latency for attempt in pending), start=timedelta()),
    )


def _expected_arms(
    config: PilotRunConfig,
    prepared: PreparedInputs,
) -> ExpectedArms:
    non_holdouts = [row.relation_id for row in prepared.slice_rows if not row.is_holdout]
    repeat_arm = ExpectedRepeatArm(
        families=[judge.family_id for judge in config.judges],
        relation_ids=non_holdouts,
        effort=config.baseline_effort,
        repeat_indices=list(range(1, config.repeat_count + 1)),
    )
    family_efforts = {
        judge.family_id: judge.higher_effort
        for judge in config.judges
        if judge.higher_effort is not None
    }
    effort_arm = (
        ExpectedEffortArm(
            family_efforts=cast("dict[str, ReasoningEffort]", family_efforts),
            relation_ids=[row.relation_id for row in prepared.slice_rows],
        )
        if family_efforts
        else None
    )
    return ExpectedArms(repeat=repeat_arm, effort=effort_arm)


def _write_manifest(
    *,
    paths: PilotPaths,
    prepared: PreparedInputs,
    config: PilotRunConfig,
    votes: Sequence[VoteRow],
) -> None:
    arms = _expected_arms(config, prepared)
    source_hashes = prepared.source_hashes | {
        "attempts.jsonl": sha256_file(paths.attempts_jsonl),
        "slice.jsonl": sha256_file(paths.slice_jsonl),
        "votes.jsonl": sha256_file(paths.votes_jsonl),
    }
    manifest = HandoffManifest(
        schema_version=2,
        expected_grid=ExpectedGrid(
            families=[judge.family_id for judge in config.judges],
            bundles=list(BUNDLES),
            relation_ids=[row.relation_id for row in prepared.slice_rows],
            effort=config.baseline_effort,
        ),
        expected_repeat_arm=arms.repeat,
        expected_effort_arm=arms.effort,
        slice_derivation=prepared.slice_derivation,
        run_dates=RunDates(
            started_at=min(vote.ts_request for vote in votes),
            completed_at=max(vote.ts_response for vote in votes),
        ),
        judges=[JudgePin.model_validate(judge.model_dump(mode="json")) for judge in config.judges],
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        full_grid_card_count=prepared.full_grid_card_count,
        source_hashes=source_hashes,
        openrouter_sdk_version=version("openrouter"),
        openrouter_openapi_version=openrouter.OPENAPI_DOC_VERSION,
        executor_config=cast(
            "dict[str, JsonValue]", config.model_dump(mode="json", exclude={"max_cost_usd"})
        ),
    )
    _write_atomic(
        paths.manifest_json,
        canonical_json_bytes(manifest.model_dump(mode="json")) + b"\n",
    )


def _enforce_cost_cap(
    config: PilotRunConfig,
    *,
    votes_completed: int,
    known_cost: float,
    cost_complete: bool,
) -> None:
    if config.max_cost_usd is None:
        return
    if not cost_complete:
        raise ValueError("cannot enforce max_cost_usd with incomplete provider costs")
    if known_cost >= config.max_cost_usd:
        raise ValueError(
            f"executor cost cap reached after {votes_completed} votes: ${known_cost:.6f}"
        )


def _execute_plan(
    *,
    paths: ExecutionPaths,
    prepared: PreparedCards,
    config: PilotRunConfig,
    plan: VotePlan,
    transport: CompletionTransport,
) -> list[VoteRow]:
    votes = _load_jsonl(paths.votes_jsonl, VoteRow)
    attempts = _load_jsonl(paths.attempts_jsonl, PhysicalAttemptRow)
    _recover_inflight(paths.inflight_json, attempts)
    tasks = plan.tasks()
    resume = _resume_position(tasks, votes, attempts, prepared, config.request_timeout)
    next_task = resume.next_task
    pending = resume.pending_attempts
    pending_vote_id = next_task.vote_id if next_task is not None else None
    completed_attempts = [attempt for attempt in attempts if attempt.vote_id != pending_vote_id]
    accounting = _aggregate_physical_usage(completed_attempts)

    while next_task is not None:
        _enforce_cost_cap(
            config,
            votes_completed=len(votes),
            known_cost=accounting.known_cost_usd,
            cost_complete=accounting.cost_complete,
        )
        vote = _execute_vote(
            task=next_task,
            card=prepared.cards[next_task.relation_id],
            prefix=prepared.prefixes[next_task.bundle_id],
            pending=pending,
            transport=transport,
            attempts_path=paths.attempts_jsonl,
            inflight_path=paths.inflight_json,
            config=config,
            prior_known_cost=accounting.known_cost_usd,
            prior_cost_complete=accounting.cost_complete,
            votes_completed=len(votes),
        )
        _append_jsonl(paths.votes_jsonl, vote)
        votes.append(vote)
        accounting = accounting.combine(_aggregate_physical_usage(pending))
        next_task = next(tasks, None)
        pending = []

    if len(votes) != plan.expected_votes:
        raise ValueError(f"completed {len(votes)} votes, expected {plan.expected_votes}")
    return votes


def _verify_sources_unchanged(prepared: PreparedCards) -> None:
    if sha256_file(prepared.cards_path) != prepared.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed during execution; manifest was not finalized")
    if sha256_file(prepared.manifest_path) != prepared.source_hashes["cards.manifest.json"]:
        raise ValueError("cards.manifest.json changed during execution")


def _verify_full_grid_sources_unchanged(prepared: FullGridPreparedInputs) -> None:
    _verify_sources_unchanged(prepared)
    if sha256_file(prepared.decisions_path) != prepared.decisions_hash:
        raise ValueError("analysis decisions changed during execution")


def _validate_completed_journals(
    *,
    paths: ExecutionPaths,
    prepared: PreparedCards,
    config: PilotRunConfig,
    plan: VotePlan,
) -> CompletedJournals:
    votes = _load_jsonl(paths.votes_jsonl, VoteRow)
    attempts = _load_jsonl(paths.attempts_jsonl, PhysicalAttemptRow)
    _recover_inflight(paths.inflight_json, attempts)
    resume = _resume_position(
        plan.tasks(),
        votes,
        attempts,
        prepared,
        config.request_timeout,
    )
    if resume.next_task is not None or resume.pending_attempts or len(votes) != plan.expected_votes:
        raise ValueError("completed output journals do not contain the complete requested plan")
    return CompletedJournals(votes=votes, attempts=attempts)


def _validate_completed_pilot_output(
    paths: PilotPaths,
    prepared: PreparedInputs,
    config: PilotRunConfig,
    state: PilotRunState,
    plan: PilotVotePlan,
) -> None:
    try:
        manifest = HandoffManifest.model_validate_json(paths.manifest_json.read_bytes())
    except ValidationError as error:
        raise ValueError(f"invalid completed manifest.json: {error}") from error
    expected_hash_paths = {
        "attempts.jsonl": paths.attempts_jsonl,
        "cards.jsonl": prepared.cards_path,
        "cards.manifest.json": prepared.manifest_path,
        "slice.jsonl": paths.slice_jsonl,
        "votes.jsonl": paths.votes_jsonl,
    }
    for name, path in expected_hash_paths.items():
        if manifest.source_hashes.get(name) != sha256_file(path):
            raise ValueError(f"completed {name} does not match manifest.json")
    if manifest.prompt_pack_hash != prepared.pack_hash:
        raise ValueError("completed manifest prompt pack does not match the requested plan")
    if manifest.openrouter_sdk_version != state.openrouter_sdk_version:
        raise ValueError("completed manifest OpenRouter SDK version does not match run-state")
    if manifest.openrouter_openapi_version != state.openrouter_openapi_version:
        raise ValueError("completed manifest OpenRouter OpenAPI version does not match run-state")
    if manifest.executor_config != config.model_dump(mode="json", exclude={"max_cost_usd"}):
        raise ValueError("completed manifest executor config does not match the requested plan")
    _validate_completed_journals(
        paths=paths,
        prepared=prepared,
        config=config,
        plan=plan,
    )


def _full_grid_input_hashes(prepared: FullGridPreparedInputs) -> dict[str, Sha256Hex]:
    return prepared.source_hashes | {"decisions.json": prepared.decisions_hash}


def _full_grid_manifest(
    *,
    paths: FullGridPaths,
    prepared: FullGridPreparedInputs,
    config: PilotRunConfig,
    state: FullGridRunState,
    votes: Sequence[VoteRow],
) -> FullGridManifest:
    return FullGridManifest(
        expectation=prepared.expectation,
        run_dates=RunDates(
            started_at=min(vote.ts_request for vote in votes),
            completed_at=max(vote.ts_response for vote in votes),
        ),
        judges=[
            JudgePin.model_validate(judge.model_dump(mode="json")) for judge in prepared.judges
        ],
        decisions_hash=prepared.decisions_hash,
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        source_hashes=_full_grid_input_hashes(prepared)
        | {
            "attempts.jsonl": sha256_file(paths.attempts_jsonl),
            "votes.jsonl": sha256_file(paths.votes_jsonl),
        },
        plan_hash=state.plan_hash,
        request_contract_hash=state.request_contract_hash,
        openrouter_sdk_version=state.openrouter_sdk_version,
        openrouter_openapi_version=state.openrouter_openapi_version,
        executor_config=cast(
            "dict[str, JsonValue]",
            config.model_dump(mode="json", exclude={"max_cost_usd"}),
        ),
        executor_policy=_executor_policy_payload(),
        request_policy=_request_policy_payload(),
    )


def _write_full_grid_manifest(
    *,
    paths: FullGridPaths,
    prepared: FullGridPreparedInputs,
    config: PilotRunConfig,
    state: FullGridRunState,
    votes: Sequence[VoteRow],
) -> None:
    manifest = _full_grid_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        votes=votes,
    )
    _write_atomic(
        paths.manifest_json,
        canonical_json_bytes(manifest.model_dump(mode="json")) + b"\n",
    )


def _validate_completed_full_grid_output(
    *,
    paths: FullGridPaths,
    prepared: FullGridPreparedInputs,
    config: PilotRunConfig,
    state: FullGridRunState,
    plan: FullGridVotePlan,
) -> None:
    try:
        manifest = FullGridManifest.model_validate_json(paths.manifest_json.read_bytes())
    except ValidationError as error:
        raise ValueError(f"invalid completed full-grid manifest.json: {error}") from error
    journals = _validate_completed_journals(
        paths=paths,
        prepared=prepared,
        config=config,
        plan=plan,
    )
    expected = _full_grid_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        votes=journals.votes,
    )
    if manifest != expected:
        raise ValueError("completed full-grid manifest does not match the requested plan")


def run_pilot(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    config: PilotRunConfig,
    transport: CompletionTransport | None = None,
) -> PilotPaths:
    """Derive the slice, execute or resume every typed arm, and finalize the handoff."""
    prepared = _prepare_inputs(Path(cards_dir), config)
    plan = PilotVotePlan(config=config, prepared=prepared)
    state = PilotRunState(
        plan_hash=_plan_hash(config, plan),
        request_contract_hash=_request_contract_hash(config),
        source_hashes=prepared.source_hashes,
        prompt_pack_hash=prepared.pack_hash,
        slice_hash=sha256_bytes(_jsonl_bytes(prepared.slice_rows)),
        expected_votes=plan.expected_votes,
        openrouter_sdk_version=version("openrouter"),
        openrouter_openapi_version=openrouter.OPENAPI_DOC_VERSION,
    )

    output = Path(out_dir)
    with _exclusive_run_lock(output):
        paths = _prepare_pilot_run_state(
            output,
            state=state,
            slice_rows=prepared.slice_rows,
        )
        if paths.manifest_json.exists():
            _validate_completed_pilot_output(paths, prepared, config, state, plan)
            return paths

        owned_transport = transport is None
        completion_transport = transport or OpenRouterTransport.from_environment()
        try:
            votes = _execute_plan(
                paths=paths,
                prepared=prepared,
                config=config,
                plan=plan,
                transport=completion_transport,
            )
            _verify_sources_unchanged(prepared)
            _write_manifest(paths=paths, prepared=prepared, config=config, votes=votes)
            return paths
        finally:
            if owned_transport:
                cast("OpenRouterTransport", completion_transport).close()


def run_full_grid(
    *,
    cards_dir: PathLike,
    decisions_path: PathLike,
    out_dir: PathLike,
    config: PilotRunConfig,
    transport: CompletionTransport | None = None,
) -> FullGridPaths:
    """Execute or resume the production Cartesian product authorized by pilot decisions."""
    prepared = _prepare_full_grid_inputs(Path(cards_dir), Path(decisions_path), config)
    plan = FullGridVotePlan(config=config, prepared=prepared)
    state = FullGridRunState(
        plan_hash=_plan_hash(config, plan),
        request_contract_hash=_request_contract_hash(config),
        source_hashes=_full_grid_input_hashes(prepared),
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        decisions_hash=prepared.decisions_hash,
        expected_votes=plan.expected_votes,
        openrouter_sdk_version=version("openrouter"),
        openrouter_openapi_version=openrouter.OPENAPI_DOC_VERSION,
    )

    output = Path(out_dir)
    with _exclusive_run_lock(output):
        paths = _prepare_full_grid_run_state(output, state=state)
        if paths.manifest_json.exists():
            _validate_completed_full_grid_output(
                paths=paths,
                prepared=prepared,
                config=config,
                state=state,
                plan=plan,
            )
            return paths

        owned_transport = transport is None
        completion_transport = transport or OpenRouterTransport.from_environment()
        try:
            votes = _execute_plan(
                paths=paths,
                prepared=prepared,
                config=config,
                plan=plan,
                transport=completion_transport,
            )
            _verify_full_grid_sources_unchanged(prepared)
            _write_full_grid_manifest(
                paths=paths,
                prepared=prepared,
                config=config,
                state=state,
                votes=votes,
            )
            return paths
        finally:
            if owned_transport:
                cast("OpenRouterTransport", completion_transport).close()
