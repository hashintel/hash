"""Execute a resumable, privacy-pinned factorial relation-judge pilot."""

import hashlib
import math
import os
import time
from collections import defaultdict
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.metadata import version
from os import PathLike
from pathlib import Path
from typing import Literal, Protocol, Self, cast

import openrouter
import yaml
from openrouter import OpenRouter
from openrouter.components import (
    ChatMessages,
    ChatRequestReasoning,
    ChatResult,
    ProviderPreferences,
)
from openrouter.utils.retries import BackoffStrategy, RetryConfig
from pydantic import (
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
    write_sidecar,
)
from atlas_tools.relation.concat import ConcatCardRow, ConcatProvenance
from atlas_tools.relation.eval.prompt import (
    FEW_SHOT,
    HOLDOUT,
    OPENROUTER_RESPONSE_FORMAT,
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
    AttemptFailure,
    BundleId,
    ExpectedEffortArm,
    ExpectedGrid,
    ExpectedRepeatArm,
    FramingId,
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


class SliceSamplingConfig(BaseModel):
    """Versioned deterministic sampling policy for the pilot slice."""

    algorithm: Literal["stratified-hash-v1"] = "stratified-hash-v1"
    seed: int
    non_holdout_count: PositiveInt = 144

    model_config = ConfigDict(extra="forbid", frozen=True)


class JudgeConfig(BaseModel):
    """One stable judge family and its exact OpenRouter provider endpoint."""

    family_id: str = Field(min_length=1)
    endpoint_slug: str = Field(min_length=1)
    model: str = Field(min_length=1)
    temperature: float | None = Field(default=0.0, allow_inf_nan=False)
    seed: int | None = 0
    higher_effort: ReasoningEffort | None = None
    max_completion_tokens: PositiveInt = 256

    model_config = ConfigDict(extra="forbid", frozen=True)


class PilotRunConfig(BaseModel):
    """Fully resolved request and sampling configuration for one pilot run."""

    schema_version: Literal[2] = 2
    rubric_version: Literal["rubric-v1"] = RUBRIC_VERSION
    sampling: SliceSamplingConfig
    baseline_effort: ReasoningEffort = "minimal"
    repeat_count: NonNegativeInt = 1
    max_cost_usd: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    timeout_ms: PositiveInt = 120_000
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


class RunState(BaseModel):
    schema_version: Literal[1] = 1
    plan_hash: Sha256Hex
    source_hashes: dict[str, Sha256Hex]
    prompt_pack_hash: Sha256Hex
    slice_hash: Sha256Hex
    expected_votes: PositiveInt

    model_config = ConfigDict(extra="forbid", frozen=True)


@dataclass(frozen=True)
class PilotPaths:
    votes_jsonl: Path
    attempts_jsonl: Path
    slice_jsonl: Path
    manifest_json: Path
    run_state_json: Path


@dataclass(frozen=True)
class CardCandidate:
    relation_id: RelationId
    producer: str
    card_hash: Sha256Hex
    token_count: int
    prescreen_stratum: str
    pilot_strata: tuple[str, ...]


@dataclass(frozen=True)
class PreparedInputs:
    cards_dir: Path
    cards_path: Path
    manifest_path: Path
    source_hashes: dict[str, Sha256Hex]
    full_grid_card_count: int
    slice_rows: tuple[SliceRow, ...]
    slice_derivation: SliceDerivation
    cards: dict[RelationId, EvaluationCard]
    prefixes: dict[BundleId, PromptPrefix]
    pack_hash: Sha256Hex


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
                    "endpoint_slug": self.judge.endpoint_slug,
                    "family_id": self.judge.family_id,
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


class CompletionTransport(Protocol):
    """One visible non-streaming request; SDK retries must remain disabled."""

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout_ms: int,
    ) -> ChatResult: ...


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
        timeout_ms: int,
    ) -> ChatResult:
        result = self._client.chat.send(
            messages=messages,
            model=judge.model,
            provider=ProviderPreferences(
                only=[judge.endpoint_slug],
                allow_fallbacks=False,
                require_parameters=True,
                data_collection="deny",
                zdr=True,
            ),
            reasoning=ChatRequestReasoning(effort=effort),
            response_format=OPENROUTER_RESPONSE_FORMAT,
            temperature=judge.temperature,
            seed=judge.seed,
            max_completion_tokens=judge.max_completion_tokens,
            x_open_router_metadata="enabled",
            session_id=session_id,
            stream=False,
            retries=_NO_RETRIES,
            timeout_ms=timeout_ms,
            http_headers=_RESPONSE_CACHE_HEADERS,
        )
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


def _bundle_parts(bundle_id: BundleId) -> tuple[ShellId, FramingId]:
    shell, framing = bundle_id.split("x")
    return cast("ShellId", shell), cast("FramingId", framing)


def _read_cards(path: Path) -> Iterator[EvaluationCard]:
    with path.open(encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            if not line.strip():
                continue
            try:
                yield EvaluationCard.model_validate_json(line)
            except ValidationError as error:
                raise ValueError(f"invalid cards.jsonl line {line_number}: {error}") from error


def _verify_concat(cards_dir: Path) -> tuple[Path, Path, dict[str, Sha256Hex], int]:
    cards_path = cards_dir / "cards.jsonl"
    manifest_path = cards_dir / "cards.manifest.json"
    if not cards_path.is_file() or not manifest_path.is_file():
        raise ValueError("evaluation requires a concat directory with cards and manifest")
    provenance = ConcatProvenance.load(manifest_path)
    if provenance.producer != "relation.concat":
        raise ValueError("evaluation accepts only relation.concat card artifacts")
    recorded_hash = (provenance.content_hashes or {}).get("cards.jsonl")
    cards_hash = sha256_file(cards_path)
    if recorded_hash != cards_hash:
        raise ValueError("cards.jsonl does not match its concat manifest")
    return (
        cards_path,
        manifest_path,
        {
            "cards.jsonl": cards_hash,
            "cards.manifest.json": sha256_file(manifest_path),
        },
        provenance.details.row_count,
    )


def _card_candidates(
    cards_path: Path, expected_rows: int
) -> tuple[list[CardCandidate], set[RelationId]]:
    candidates: list[CardCandidate] = []
    relation_ids: set[RelationId] = set()
    shot_ids = {relation_id for relation_id, _ in FEW_SHOT}
    for card in _read_cards(cards_path):
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
) -> tuple[tuple[SliceRow, ...], SliceDerivation]:
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
    return rows, SliceDerivation(
        algorithm=config.algorithm,
        sampling_seed=config.seed,
        requested_non_holdouts=config.non_holdout_count,
        eligible_non_holdouts=len(ordinary),
        selected_non_holdouts=target,
        cards_hash=cards_hash,
        sampling_config_hash=sampling_hash,
        selection_hash=selection_hash,
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
        shell, framing = _bundle_parts(bundle)
        prefixes[bundle] = build_prompt_prefix(
            system_prompt=cast("Literal[1, 2, 3]", int(shell[1])),
            framing=cast("Literal[1, 2, 3]", int(framing[1])),
            cards=cards,
        )
    return prefixes


def _prepare_inputs(cards_dir: Path, config: PilotRunConfig) -> PreparedInputs:
    cards_path, manifest_path, source_hashes, expected_rows = _verify_concat(cards_dir)
    candidates, _ = _card_candidates(cards_path, expected_rows)
    slice_rows, derivation = _derive_slice(
        candidates,
        cards_hash=source_hashes["cards.jsonl"],
        config=config.sampling,
    )
    required = {row.relation_id for row in slice_rows} | {
        relation_id for relation_id, _ in FEW_SHOT
    }
    cards = _load_required_cards(cards_path, required)
    pack_hash = prompt_pack_hash(cards)
    if sha256_file(cards_path) != source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed while preparing the pilot")
    return PreparedInputs(
        cards_dir=cards_dir,
        cards_path=cards_path,
        manifest_path=manifest_path,
        source_hashes=source_hashes,
        full_grid_card_count=len(candidates),
        slice_rows=slice_rows,
        slice_derivation=derivation,
        cards=cards,
        prefixes=_build_prefixes(cards),
        pack_hash=pack_hash,
    )


def _tasks(config: PilotRunConfig, prepared: PreparedInputs) -> Iterator[VoteTask]:
    non_holdouts = [row for row in prepared.slice_rows if not row.is_holdout]
    for judge in config.judges:
        for bundle_id in BUNDLES:
            for row in prepared.slice_rows:
                yield VoteTask(
                    judge=judge,
                    bundle_id=bundle_id,
                    relation_id=row.relation_id,
                    card_hash=row.card_hash,
                    effort=config.baseline_effort,
                    repeat_index=0,
                    pack_hash=prepared.pack_hash,
                    rubric_version=config.rubric_version,
                )
            if bundle_id != QUALIFICATION_BUNDLE:
                continue
            for repeat_index in range(1, config.repeat_count + 1):
                for row in non_holdouts:
                    yield VoteTask(
                        judge=judge,
                        bundle_id=bundle_id,
                        relation_id=row.relation_id,
                        card_hash=row.card_hash,
                        effort=config.baseline_effort,
                        repeat_index=repeat_index,
                        pack_hash=prepared.pack_hash,
                        rubric_version=config.rubric_version,
                    )
            if judge.higher_effort is not None:
                for row in prepared.slice_rows:
                    yield VoteTask(
                        judge=judge,
                        bundle_id=bundle_id,
                        relation_id=row.relation_id,
                        card_hash=row.card_hash,
                        effort=judge.higher_effort,
                        repeat_index=0,
                        pack_hash=prepared.pack_hash,
                        rubric_version=config.rubric_version,
                    )


def _task_count(config: PilotRunConfig, prepared: PreparedInputs) -> int:
    grid = len(config.judges) * len(BUNDLES) * len(prepared.slice_rows)
    repeats = (
        len(config.judges)
        * config.repeat_count
        * sum(not row.is_holdout for row in prepared.slice_rows)
    )
    effort = sum(
        len(prepared.slice_rows) for judge in config.judges if judge.higher_effort is not None
    )
    return grid + repeats + effort


def _plan_hash(config: PilotRunConfig, prepared: PreparedInputs) -> Sha256Hex:
    digest = hashlib.sha256()
    for task in _tasks(config, prepared):
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
    )


def _write_atomic(path: Path, payload: bytes) -> None:
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(payload)
    temporary.replace(path)


def _jsonl_bytes(rows: Iterable[BaseModel]) -> bytes:
    return b"".join(canonical_json_bytes(row) + b"\n" for row in rows)


def _prepare_run_state(
    out_dir: Path,
    *,
    state: RunState,
    slice_rows: Sequence[SliceRow],
) -> PilotPaths:
    paths = _paths(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if paths.manifest_json.exists():
        existing = RunState.model_validate_json(paths.run_state_json.read_text())
        if existing != state:
            raise ValueError("completed output does not match the requested pilot plan")
        return paths

    if paths.run_state_json.exists():
        existing = RunState.model_validate_json(paths.run_state_json.read_text())
        if existing != state:
            raise ValueError("partial output does not match the requested pilot plan")
        if sha256_file(paths.slice_jsonl) != state.slice_hash:
            raise ValueError("partial output slice.jsonl does not match run-state.json")
    else:
        unexpected = [
            path.name
            for path in (paths.votes_jsonl, paths.attempts_jsonl, paths.slice_jsonl)
            if path.exists()
        ]
        if unexpected:
            raise ValueError(f"output has files without run-state.json: {sorted(unexpected)}")
        slice_bytes = _jsonl_bytes(slice_rows)
        _write_atomic(paths.slice_jsonl, slice_bytes)
        _write_atomic(
            paths.run_state_json,
            canonical_json_bytes(state.model_dump(mode="json")) + b"\n",
        )
    paths.votes_jsonl.touch(exist_ok=True)
    paths.attempts_jsonl.touch(exist_ok=True)
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


def _resume_position(
    tasks: Iterator[VoteTask],
    votes: Sequence[VoteRow],
    attempts: Sequence[PhysicalAttemptRow],
) -> tuple[VoteTask | None, list[PhysicalAttemptRow]]:
    completed_ids: set[Sha256Hex] = set()
    for vote in votes:
        try:
            task = next(tasks)
        except StopIteration as error:
            raise ValueError("votes.jsonl contains more votes than the requested plan") from error
        if vote.vote_id != task.vote_id:
            raise ValueError("votes.jsonl is not a valid prefix of the requested plan")
        completed_ids.add(vote.vote_id)

    next_task = next(tasks, None)
    incomplete: list[PhysicalAttemptRow] = []
    attempt_ids: set[Sha256Hex] = set()
    for attempt in attempts:
        if attempt.attempt_id in attempt_ids:
            raise ValueError(f"attempts.jsonl contains duplicate attempt {attempt.attempt_id}")
        attempt_ids.add(attempt.attempt_id)
        if attempt.vote_id in completed_ids:
            continue
        if next_task is None or attempt.vote_id != next_task.vote_id:
            raise ValueError("attempts.jsonl contains an attempt beyond the resumable vote")
        incomplete.append(attempt)
    return next_task, incomplete


def _request_hash(
    messages: Sequence[ChatMessages],
    task: VoteTask,
    stage: Literal["initial", "repair"],
) -> Sha256Hex:
    return sha256_bytes(
        canonical_json_bytes(
            {
                "endpoint_slug": task.judge.endpoint_slug,
                "effort": task.effort,
                "messages": [
                    message.model_dump(mode="json", by_alias=True, exclude_unset=True)
                    for message in messages
                ],
                "model": task.judge.model,
                "stage": stage,
                "vote_id": task.vote_id,
            }
        )
    )


def _failure_from_exception(error: Exception, category: str) -> AttemptFailure:
    response = getattr(error, "raw_response", None)
    status = getattr(response, "status_code", None)
    body = getattr(error, "raw_response_text", None)
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
    if metadata is None or not metadata.attempts:
        raise ValueError("completion omitted required OpenRouter routing metadata")
    if len(metadata.attempts) != 1:
        raise ValueError("completion reported multiple provider attempts for an exact route")
    route = metadata.attempts[0]
    if route.status != _HTTP_OK:
        raise ValueError(f"provider attempt status must be {_HTTP_OK}, got {route.status}")
    if route.model != judge.model:
        raise ValueError(f"provider attempt used model {route.model!r}, expected {judge.model!r}")
    if route.provider != judge.endpoint_slug:
        raise ValueError(
            f"provider attempt used endpoint {route.provider!r}, expected {judge.endpoint_slug!r}"
        )
    return route.provider


def _accepted_completion(result: ChatResult, judge: JudgeConfig) -> tuple[str, str]:
    content = _completion_content(result)
    _validate_usage(result)
    return content, _route_provider(result, judge)


def _append_jsonl(path: Path, row: BaseModel) -> None:
    with path.open("a", encoding="utf-8") as output:
        output.write(canonical_json_bytes(row).decode("utf-8") + "\n")
        # Every row follows a potentially paid call. Flushing here is a durability boundary,
        # not a throughput accident: a crash must never make a paid attempt invisible.
        output.flush()


def _call(
    *,
    task: VoteTask,
    stage: Literal["initial", "repair"],
    messages: list[ChatMessages],
    previous: Sequence[PhysicalAttemptRow],
    transport: CompletionTransport,
    attempts_path: Path,
    timeout_ms: int,
) -> PhysicalAttemptRow:
    stage_attempt = sum(attempt.request_stage == stage for attempt in previous)
    request_hash = _request_hash(messages, task, stage)
    attempt_id = sha256_bytes(
        canonical_json_bytes(
            {
                "request_hash": request_hash,
                "stage_attempt": stage_attempt,
            }
        )
    )
    ts_request = datetime.now(UTC)
    monotonic_start = time.monotonic()
    try:
        result = transport.complete(
            messages=messages,
            judge=task.judge,
            effort=task.effort,
            session_id=sha256_bytes(
                canonical_json_bytes(
                    {
                        "bundle": task.bundle_id,
                        "effort": task.effort,
                        "family": task.judge.family_id,
                    }
                )
            ),
            timeout_ms=timeout_ms,
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
            endpoint_slug=task.judge.endpoint_slug,
            model_requested=task.judge.model,
            result=None,
            failure=_failure_from_exception(error, "transport"),
            ts_request=ts_request,
            ts_response=ts_response,
            latency_seconds=time.monotonic() - monotonic_start,
        )
        _append_jsonl(attempts_path, attempt)
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
            endpoint_slug=task.judge.endpoint_slug,
            model_requested=task.judge.model,
            result=result,
            failure=_failure_from_exception(error, category),
            ts_request=ts_request,
            ts_response=ts_response,
            latency_seconds=time.monotonic() - monotonic_start,
        )
        _append_jsonl(attempts_path, attempt)
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
        endpoint_slug=task.judge.endpoint_slug,
        model_requested=task.judge.model,
        result=result,
        failure=None,
        ts_request=ts_request,
        ts_response=ts_response,
        latency_seconds=time.monotonic() - monotonic_start,
    )
    _append_jsonl(attempts_path, attempt)
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
    if not isinstance(details, dict):
        return 0
    value = details.get(field)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _aggregate_usage(results: Sequence[ChatResult]) -> tuple[int, int, int, int, int, float, bool]:
    tokens_in = 0
    tokens_out = 0
    cached = 0
    cache_write = 0
    reasoning = 0
    known_costs: list[float] = []
    cost_complete = True
    for result in results:
        if result.usage is None:
            raise ValueError("cannot aggregate a result without usage")
        usage = cast(
            "dict[str, JsonValue]",
            result.usage.model_dump(mode="json", by_alias=True, exclude_unset=True),
        )
        tokens_in += _usage_number(usage, "prompt_tokens")
        tokens_out += _usage_number(usage, "completion_tokens")
        cached += _nested_usage_number(usage, "prompt_tokens_details", "cached_tokens")
        cache_write += _nested_usage_number(usage, "prompt_tokens_details", "cache_write_tokens")
        reasoning += _nested_usage_number(usage, "completion_tokens_details", "reasoning_tokens")
        cost = usage.get("cost")
        if isinstance(cost, bool) or not isinstance(cost, int | float) or not math.isfinite(cost):
            cost_complete = False
        elif cost < 0:
            raise ValueError("native usage cost must not be negative")
        else:
            known_costs.append(float(cost))
    return (
        tokens_in,
        tokens_out,
        cached,
        cache_write,
        reasoning,
        math.fsum(known_costs),
        cost_complete,
    )


def _execute_vote(
    *,
    task: VoteTask,
    card: EvaluationCard,
    prefix: PromptPrefix,
    pending: list[PhysicalAttemptRow],
    transport: CompletionTransport,
    attempts_path: Path,
    timeout_ms: int,
) -> VoteRow:
    _, framing = _bundle_parts(task.bundle_id)
    framing_number = cast("Literal[1, 2, 3]", int(framing[1]))
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
            timeout_ms=timeout_ms,
        )
        pending.append(initial)
    if initial.result is None:
        raise ValueError("successful initial attempt is missing its result")
    initial_raw, _ = _accepted_completion(initial.result, task.judge)

    results = [initial.result]
    attempt_rows = [initial]
    initial_raw_completion: str | None = None
    try:
        parsed: Response | None = parse_response(initial_raw)
    except MalformedResponseError:
        parsed = None
    final_raw = initial_raw

    if parsed is None:
        initial_raw_completion = initial_raw
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
                timeout_ms=timeout_ms,
            )
            pending.append(repair)
        if repair.result is None:
            raise ValueError("successful repair attempt is missing its result")
        final_raw, _ = _accepted_completion(repair.result, task.judge)
        results.append(repair.result)
        attempt_rows.append(repair)
        try:
            parsed = parse_response(final_raw)
        except MalformedResponseError:
            parsed = None

    tokens_in, tokens_out, cached, cache_write, reasoning, known_cost, complete = _aggregate_usage(
        results
    )
    _, provider = _accepted_completion(results[-1], task.judge)
    shell, framing_id = _bundle_parts(task.bundle_id)
    return VoteRow(
        vote_id=task.vote_id,
        relation_id=task.relation_id,
        card_hash=task.card_hash,
        family_id=task.judge.family_id,
        provider=provider,
        model_returned=results[-1].model,
        shell_id=shell,
        framing_id=framing_id,
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
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        tokens_cached=cached,
        tokens_cache_write=cache_write,
        tokens_reasoning=reasoning,
        known_cost_usd=known_cost,
        cost_complete=complete,
        cost_usd=known_cost if complete else None,
        ts_request=attempt_rows[0].ts_request,
        ts_response=attempt_rows[-1].ts_response,
        latency_seconds=math.fsum(attempt.latency_seconds for attempt in attempt_rows),
    )


def _expected_arms(
    config: PilotRunConfig,
    prepared: PreparedInputs,
) -> tuple[ExpectedRepeatArm | None, ExpectedEffortArm | None]:
    non_holdouts = [row.relation_id for row in prepared.slice_rows if not row.is_holdout]
    repeat_arm = (
        ExpectedRepeatArm(
            families=[judge.family_id for judge in config.judges],
            relation_ids=non_holdouts,
            effort=config.baseline_effort,
            repeat_indices=list(range(1, config.repeat_count + 1)),
        )
        if config.repeat_count
        else None
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
    return repeat_arm, effort_arm


def _write_manifest(
    *,
    paths: PilotPaths,
    prepared: PreparedInputs,
    config: PilotRunConfig,
    votes: Sequence[VoteRow],
) -> None:
    repeat_arm, effort_arm = _expected_arms(config, prepared)
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
        expected_repeat_arm=repeat_arm,
        expected_effort_arm=effort_arm,
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
    temporary = paths.manifest_json.with_name(".manifest.json.tmp")
    write_sidecar(temporary, manifest.model_dump(mode="json"))
    temporary.replace(paths.manifest_json)


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
        raise ValueError(f"pilot cost cap reached after {votes_completed} votes: ${known_cost:.6f}")


def _execute_plan(
    *,
    paths: PilotPaths,
    prepared: PreparedInputs,
    config: PilotRunConfig,
    transport: CompletionTransport,
    expected_votes: int,
) -> list[VoteRow]:
    votes = _load_jsonl(paths.votes_jsonl, VoteRow)
    attempts = _load_jsonl(paths.attempts_jsonl, PhysicalAttemptRow)
    tasks = _tasks(config, prepared)
    next_task, pending = _resume_position(tasks, votes, attempts)
    known_cost = math.fsum(vote.known_cost_usd for vote in votes)
    cost_complete = all(vote.cost_complete for vote in votes)

    while next_task is not None:
        _enforce_cost_cap(
            config,
            votes_completed=len(votes),
            known_cost=known_cost,
            cost_complete=cost_complete,
        )
        vote = _execute_vote(
            task=next_task,
            card=prepared.cards[next_task.relation_id],
            prefix=prepared.prefixes[next_task.bundle_id],
            pending=pending,
            transport=transport,
            attempts_path=paths.attempts_jsonl,
            timeout_ms=config.timeout_ms,
        )
        _append_jsonl(paths.votes_jsonl, vote)
        votes.append(vote)
        known_cost += vote.known_cost_usd
        cost_complete = cost_complete and vote.cost_complete
        next_task = next(tasks, None)
        pending = []

    if len(votes) != expected_votes:
        raise ValueError(f"completed {len(votes)} votes, expected {expected_votes}")
    return votes


def _verify_sources_unchanged(prepared: PreparedInputs) -> None:
    if sha256_file(prepared.cards_path) != prepared.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed during execution; manifest was not finalized")
    if sha256_file(prepared.manifest_path) != prepared.source_hashes["cards.manifest.json"]:
        raise ValueError("cards.manifest.json changed during execution")


def run_pilot(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    config: PilotRunConfig,
    transport: CompletionTransport | None = None,
) -> PilotPaths:
    """Derive the slice, execute or resume every typed arm, and finalize the handoff."""
    prepared = _prepare_inputs(Path(cards_dir), config)
    expected_votes = _task_count(config, prepared)
    state = RunState(
        plan_hash=_plan_hash(config, prepared),
        source_hashes=prepared.source_hashes,
        prompt_pack_hash=prepared.pack_hash,
        slice_hash=sha256_bytes(_jsonl_bytes(prepared.slice_rows)),
        expected_votes=expected_votes,
    )

    owned_transport = transport is None
    completion_transport = transport or OpenRouterTransport.from_environment()
    try:
        paths = _prepare_run_state(
            Path(out_dir),
            state=state,
            slice_rows=prepared.slice_rows,
        )
        if paths.manifest_json.exists():
            return paths
        votes = _execute_plan(
            paths=paths,
            prepared=prepared,
            config=config,
            transport=completion_transport,
            expected_votes=expected_votes,
        )
        _verify_sources_unchanged(prepared)
        _write_manifest(paths=paths, prepared=prepared, config=config, votes=votes)
        return paths
    finally:
        if owned_transport:
            cast("OpenRouterTransport", completion_transport).close()
