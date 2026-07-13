"""Execute the factorial relation-judge pilot and emit an analysis handoff."""

import math
import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from os import PathLike
from pathlib import Path
from typing import Annotated, Literal, Protocol, Self, cast

import yaml
from openrouter import OpenRouter
from openrouter.components import (
    ChatMessages,
    ChatRequestReasoning,
    ChatResult,
    ProviderPreferences,
)
from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    NonNegativeInt,
    PositiveInt,
    StringConstraints,
    TypeAdapter,
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
from atlas_tools.relation.eval.prompt import (
    FEW_SHOT,
    HOLDOUT,
    OPENROUTER_RESPONSE_FORMAT,
    MalformedResponseError,
    Response,
    build_retry_prompt,
    builds_prompt,
    parse_response,
    prompt_pack_hash,
)
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    BundleId,
    ExpectedGrid,
    FramingId,
    HandoffManifest,
    JudgePin,
    RunDates,
    ShellId,
    SliceRow,
    VoteRow,
)
from atlas_tools.relation_cards.common.cards import CardRow
from atlas_tools.wikidata.model import Pid, PidField

type ReasoningEffort = Literal[
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
]
type NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]

RUBRIC_VERSION = "rubric-v1"
CANONICAL_BUNDLE: BundleId = "S1xF1"
_JSON_USAGE = TypeAdapter(dict[str, JsonValue])


class LargeLanguageModel(BaseModel):
    """A compact model request configuration retained for programmatic callers."""

    model: str
    temperature: float | None = 0.0
    provider: ProviderPreferences | None = None
    reasoning: ChatRequestReasoning | None = None


# These are candidate model routes, not a runnable pilot configuration. A run additionally
# needs stable family IDs and exact provider pins, which are supplied in PilotRunConfig.
MODELS = (
    LargeLanguageModel(
        model="anthropic/claude-opus-4.8",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
    LargeLanguageModel(
        model="anthropic/claude-sonnet-5",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
    LargeLanguageModel(
        model="openai/gpt-5.6-sol-pro",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
    LargeLanguageModel(
        model="openai/gpt-5.6-luna",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
    LargeLanguageModel(
        model="google/gemini-3.5-flash",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
    LargeLanguageModel(
        model="z-ai/glm-5.2",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
    LargeLanguageModel(
        model="nvidia/nemotron-3-ultra-550b-a55b",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
    LargeLanguageModel(
        model="deepseek/deepseek-v4-pro",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
    LargeLanguageModel(
        model="mistralai/mistral-small-2603",
        reasoning=ChatRequestReasoning(effort="low"),
    ),
)


class JudgeConfig(BaseModel):
    """One stable judge family and its exact OpenRouter route."""

    family_id: NonEmptyStr
    provider: NonEmptyStr
    model: NonEmptyStr
    temperature: float | None = 0.0
    seed: int | None = 0
    higher_effort: ReasoningEffort | None = None
    max_completion_tokens: PositiveInt = 256
    zdr: bool = False

    model_config = ConfigDict(extra="forbid", frozen=True)


class PilotRunConfig(BaseModel):
    """Versioned, fully resolved configuration for one factorial pilot run."""

    schema_version: Literal[1] = 1
    rubric_version: Literal["rubric-v1"] = RUBRIC_VERSION
    baseline_effort: ReasoningEffort = "minimal"
    full_grid_card_count: PositiveInt
    repeat_count: NonNegativeInt = 1
    max_cost_usd: Annotated[float, Field(gt=0, allow_inf_nan=False)] | None = None
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
        invalid_efforts = [
            judge.family_id for judge in self.judges if judge.higher_effort == self.baseline_effort
        ]
        if invalid_efforts:
            raise ValueError(
                "higher_effort must differ from baseline_effort for " + ", ".join(invalid_efforts)
            )
        return self


class EvaluationCard(CardRow):
    """The card fields needed by the Wikidata pilot executor."""

    pid: PidField


class CompletionAttempt(BaseModel):
    """One provider call, before logical-vote retry aggregation."""

    raw_completion: str
    model_returned: NonEmptyStr
    provider: NonEmptyStr
    completion_id: NonEmptyStr
    usage: dict[str, JsonValue]
    ts_request: AwareDatetime
    ts_response: AwareDatetime

    model_config = ConfigDict(extra="forbid", frozen=True)

    @model_validator(mode="after")
    def check_timestamps(self) -> Self:
        if self.ts_response < self.ts_request:
            raise ValueError("ts_response must not precede ts_request")
        return self


@dataclass(frozen=True)
class PilotPaths:
    votes_jsonl: Path
    slice_jsonl: Path
    manifest_json: Path


@dataclass(frozen=True)
class VoteTask:
    judge: JudgeConfig
    bundle_id: BundleId
    relation_id: str
    effort: ReasoningEffort
    repeat_index: int


class CompletionTransport(Protocol):
    """The single-call boundary used by the executor and fake transports in tests."""

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        timeout_ms: int,
    ) -> CompletionAttempt: ...


class OpenRouterTransport:
    """OpenRouter SDK adapter with exact model/provider routing."""

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("OpenRouter API key must not be empty")
        self._client = OpenRouter(api_key=api_key)

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
        timeout_ms: int,
    ) -> CompletionAttempt:
        ts_request = datetime.now(UTC)
        result = self._client.chat.send(
            messages=messages,
            model=judge.model,
            provider=ProviderPreferences(
                only=[judge.provider],
                allow_fallbacks=False,
                require_parameters=True,
                zdr=judge.zdr,
            ),
            reasoning_effort=effort,
            response_format=OPENROUTER_RESPONSE_FORMAT,
            temperature=judge.temperature,
            seed=judge.seed,
            max_completion_tokens=judge.max_completion_tokens,
            x_open_router_metadata="enabled",
            stream=False,
            timeout_ms=timeout_ms,
        )
        ts_response = datetime.now(UTC)
        if not isinstance(result, ChatResult):
            raise TypeError("OpenRouter returned a stream for a non-streaming request")
        if not result.choices:
            raise ValueError("OpenRouter completion did not contain a choice")

        message = result.choices[0].message
        if isinstance(message.content, str):
            raw_completion = message.content
        else:
            raw_completion = canonical_json_bytes(
                message.model_dump(mode="json", by_alias=True, exclude_unset=True)
            ).decode("utf-8")

        usage = (
            _JSON_USAGE.validate_python(
                result.usage.model_dump(mode="json", by_alias=True, exclude_unset=True)
            )
            if result.usage is not None
            else {}
        )
        provider = judge.provider
        metadata = result.openrouter_metadata
        if metadata is not None and metadata.attempts:
            provider = metadata.attempts[-1].provider

        return CompletionAttempt(
            raw_completion=raw_completion,
            model_returned=result.model,
            provider=provider,
            completion_id=result.id,
            usage=usage,
            ts_request=ts_request,
            ts_response=ts_response,
        )


def load_run_config(path: PathLike) -> PilotRunConfig:
    """Load and strictly validate the executor's versioned YAML configuration."""
    config_path = Path(path)
    try:
        payload = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        return PilotRunConfig.model_validate(payload)
    except (OSError, ValidationError, yaml.YAMLError) as error:
        raise ValueError(f"invalid pilot config {config_path}: {error}") from error


def _load_jsonl[Model: BaseModel](path: Path, model: type[Model]) -> list[Model]:
    rows: list[Model] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise ValueError(f"cannot read {path}: {error}") from error

    for line_number, line in enumerate(lines, start=1):
        if not line:
            continue
        try:
            rows.append(model.model_validate_json(line))
        except ValidationError as error:
            raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error
    return rows


def _duplicates(values: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return sorted(duplicates)


def _index_cards(cards: Sequence[EvaluationCard]) -> dict[Pid, EvaluationCard]:
    duplicate_cards = _duplicates([str(card.pid) for card in cards])
    if duplicate_cards:
        raise ValueError(f"cards.jsonl contains duplicate PIDs: {duplicate_cards}")
    return {card.pid: card for card in cards}


def _validate_slice_identity(
    slice_rows: Sequence[SliceRow],
    shot_ids: set[Pid],
) -> None:
    duplicate_relations = _duplicates([row.relation_id for row in slice_rows])
    if duplicate_relations:
        raise ValueError(f"slice.jsonl contains duplicate relation IDs: {duplicate_relations}")
    if not slice_rows:
        raise ValueError("slice.jsonl must not be empty")

    expected_holdouts = {str(provider_id): verdict for _, provider_id, verdict in HOLDOUT}
    actual_holdouts = {row.relation_id: row.holdout_verdict for row in slice_rows if row.is_holdout}
    if actual_holdouts != expected_holdouts:
        raise ValueError(
            "slice holdouts must exactly match the six rubric-v1 anchors: "
            f"expected={expected_holdouts}, observed={actual_holdouts}"
        )

    contaminated = sorted(row.relation_id for row in slice_rows if Pid(row.relation_id) in shot_ids)
    if contaminated:
        raise ValueError(f"pilot slice contains few-shot relation IDs: {contaminated}")


def _validate_card_coverage(
    cards_by_pid: Mapping[Pid, EvaluationCard],
    slice_rows: Sequence[SliceRow],
    shot_ids: set[Pid],
) -> None:
    missing_shots = sorted(str(pid) for pid in shot_ids - set(cards_by_pid))
    if missing_shots:
        raise ValueError(f"cards.jsonl is missing few-shot cards: {missing_shots}")

    for row in slice_rows:
        card = cards_by_pid.get(Pid(row.relation_id))
        if card is None:
            raise ValueError(f"cards.jsonl is missing slice relation {row.relation_id}")
        if card.card_hash != row.card_hash:
            raise ValueError(f"card hash mismatch for {row.relation_id}")
        if card.token_count != row.token_count:
            raise ValueError(f"token count mismatch for {row.relation_id}")


def _load_inputs(
    cards_path: Path,
    slice_path: Path,
) -> tuple[dict[Pid, EvaluationCard], tuple[SliceRow, ...]]:
    if not cards_path.is_file():
        raise ValueError(f"cards file does not exist: {cards_path}")
    if not slice_path.is_file():
        raise ValueError(f"slice file does not exist: {slice_path}")

    cards_by_pid = _index_cards(_load_jsonl(cards_path, EvaluationCard))
    slice_rows = _load_jsonl(slice_path, SliceRow)
    shot_ids = {provider_id for _, provider_id, _ in FEW_SHOT}
    _validate_slice_identity(slice_rows, shot_ids)
    _validate_card_coverage(cards_by_pid, slice_rows, shot_ids)
    return cards_by_pid, tuple(sorted(slice_rows, key=lambda row: row.relation_id))


def _bundle_parts(bundle_id: BundleId) -> tuple[ShellId, FramingId]:
    shell, framing = bundle_id.split("x")
    return cast("ShellId", shell), cast("FramingId", framing)


def _tasks(config: PilotRunConfig, slice_rows: Sequence[SliceRow]) -> list[VoteTask]:
    tasks: list[VoteTask] = []
    non_holdouts = [row for row in slice_rows if not row.is_holdout]
    for judge in config.judges:
        for bundle_id in BUNDLES:
            tasks.extend(
                VoteTask(
                    judge=judge,
                    bundle_id=bundle_id,
                    relation_id=row.relation_id,
                    effort=config.baseline_effort,
                    repeat_index=0,
                )
                for row in slice_rows
            )
            if bundle_id != CANONICAL_BUNDLE:
                continue
            for repeat_index in range(1, config.repeat_count + 1):
                tasks.extend(
                    VoteTask(
                        judge=judge,
                        bundle_id=bundle_id,
                        relation_id=row.relation_id,
                        effort=config.baseline_effort,
                        repeat_index=repeat_index,
                    )
                    for row in non_holdouts
                )
            if judge.higher_effort is not None:
                tasks.extend(
                    VoteTask(
                        judge=judge,
                        bundle_id=bundle_id,
                        relation_id=row.relation_id,
                        effort=judge.higher_effort,
                        repeat_index=0,
                    )
                    for row in slice_rows
                )
    return tasks


def _usage_int(usage: Mapping[str, JsonValue], field: str) -> int:
    value = usage.get(field)
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _cached_tokens(usage: Mapping[str, JsonValue]) -> int:
    details = usage.get("prompt_tokens_details")
    if not isinstance(details, dict):
        return 0
    value = details.get("cached_tokens")
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _usage_cost(usage: Mapping[str, JsonValue]) -> float | None:
    value = usage.get("cost")
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    cost = float(value)
    return cost if math.isfinite(cost) and cost >= 0 else None


def _aggregate_usage(
    attempts: Sequence[CompletionAttempt],
) -> tuple[int, int, int, float | None]:
    tokens_in = sum(_usage_int(attempt.usage, "prompt_tokens") for attempt in attempts)
    tokens_out = sum(_usage_int(attempt.usage, "completion_tokens") for attempt in attempts)
    tokens_cached = sum(_cached_tokens(attempt.usage) for attempt in attempts)
    costs = [_usage_cost(attempt.usage) for attempt in attempts]
    cost_usd = (
        math.fsum(cast("list[float]", costs))
        if costs and all(cost is not None for cost in costs)
        else None
    )
    return tokens_in, tokens_out, tokens_cached, cost_usd


def _vote_id(task: VoteTask) -> Sha256Hex:
    payload = {
        "bundle_id": task.bundle_id,
        "effort": task.effort,
        "family_id": task.judge.family_id,
        "relation_id": task.relation_id,
        "repeat_index": task.repeat_index,
    }
    return sha256_bytes(canonical_json_bytes(payload))


def _request_vote(
    *,
    task: VoteTask,
    card: EvaluationCard,
    wikidata_cards: Mapping[Pid, CardRow],
    pack_hash: Sha256Hex,
    rubric_version: str,
    transport: CompletionTransport,
    timeout_ms: int,
) -> VoteRow:
    shell, framing = _bundle_parts(task.bundle_id)
    messages = builds_prompt(
        system_prompt=cast("Literal[1, 2, 3]", int(shell[1])),
        framing=cast("Literal[1, 2, 3]", int(framing[1])),
        wikidata_cards=wikidata_cards,
        request=card.card_text,
    )
    attempts = [
        transport.complete(
            messages=messages,
            judge=task.judge,
            effort=task.effort,
            timeout_ms=timeout_ms,
        )
    ]
    initial_raw_completion: str | None = None
    try:
        parsed: Response | None = parse_response(attempts[0].raw_completion)
    except MalformedResponseError:
        initial_raw_completion = attempts[0].raw_completion
        attempts.append(
            transport.complete(
                messages=build_retry_prompt(messages, initial_raw_completion),
                judge=task.judge,
                effort=task.effort,
                timeout_ms=timeout_ms,
            )
        )
        try:
            parsed = parse_response(attempts[1].raw_completion)
        except MalformedResponseError:
            parsed = None

    tokens_in, tokens_out, tokens_cached, cost_usd = _aggregate_usage(attempts)
    final = attempts[-1]
    return VoteRow(
        vote_id=_vote_id(task),
        relation_id=task.relation_id,
        card_hash=card.card_hash,
        family_id=task.judge.family_id,
        provider=final.provider,
        model_returned=final.model_returned,
        shell_id=shell,
        framing_id=framing,
        bundle_id=task.bundle_id,
        rubric_version=rubric_version,
        prompt_pack_hash=pack_hash,
        verdict=parsed.verdict if parsed is not None else "ABSTAIN",
        reason=parsed.reason if parsed is not None else "",
        raw_completion=final.raw_completion,
        parse_retries=1 if initial_raw_completion is not None else 0,
        abstained=parsed is None,
        initial_raw_completion=initial_raw_completion,
        attempt_models=[attempt.model_returned for attempt in attempts],
        attempt_providers=[attempt.provider for attempt in attempts],
        completion_ids=[attempt.completion_id for attempt in attempts],
        provider_usage=[attempt.usage for attempt in attempts],
        effort=task.effort,
        temperature=task.judge.temperature,
        seed=task.judge.seed,
        repeat_index=task.repeat_index,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        tokens_cached=tokens_cached,
        cost_usd=cost_usd,
        ts_request=attempts[0].ts_request,
        ts_response=final.ts_response,
    )


def _prepare_output(out_dir: Path) -> PilotPaths:
    paths = PilotPaths(
        votes_jsonl=out_dir / "votes.jsonl",
        slice_jsonl=out_dir / "slice.jsonl",
        manifest_json=out_dir / "manifest.json",
    )
    existing = [path.name for path in paths.__dict__.values() if path.exists()]
    if existing:
        raise ValueError(f"output directory already contains handoff files: {sorted(existing)}")
    out_dir.mkdir(parents=True, exist_ok=True)
    return paths


def _write_slice(path: Path, rows: Sequence[SliceRow]) -> None:
    with path.open("x", encoding="utf-8") as output:
        for row in rows:
            output.write(canonical_json_bytes(row).decode("utf-8") + "\n")


def run_pilot(
    *,
    cards_path: PathLike,
    slice_path: PathLike,
    out_dir: PathLike,
    config: PilotRunConfig,
    transport: CompletionTransport | None = None,
) -> PilotPaths:
    """Run every configured pilot arm and emit a strict analysis handoff."""
    resolved_cards_path = Path(cards_path)
    resolved_slice_path = Path(slice_path)
    cards, slice_rows = _load_inputs(resolved_cards_path, resolved_slice_path)
    pack_hash = prompt_pack_hash(cards)
    paths = _prepare_output(Path(out_dir))
    _write_slice(paths.slice_jsonl, slice_rows)

    completion_transport = transport or OpenRouterTransport.from_environment()
    tasks = _tasks(config, slice_rows)
    votes: list[VoteRow] = []
    known_cost = 0.0
    with paths.votes_jsonl.open("x", encoding="utf-8") as output:
        for task in tasks:
            if config.max_cost_usd is not None and known_cost >= config.max_cost_usd:
                raise ValueError(
                    f"pilot cost cap reached after {len(votes)} votes: ${known_cost:.6f}"
                )
            vote = _request_vote(
                task=task,
                card=cards[Pid(task.relation_id)],
                wikidata_cards=cards,
                pack_hash=pack_hash,
                rubric_version=config.rubric_version,
                transport=completion_transport,
                timeout_ms=config.timeout_ms,
            )
            output.write(canonical_json_bytes(vote).decode("utf-8") + "\n")
            output.flush()
            votes.append(vote)
            if vote.cost_usd is not None:
                known_cost += vote.cost_usd
            elif config.max_cost_usd is not None:
                raise ValueError(
                    "cannot enforce max_cost_usd because the provider omitted cost; "
                    "the completed vote was preserved"
                )

    started_at = min(vote.ts_request for vote in votes)
    completed_at = max(vote.ts_response for vote in votes)
    manifest = HandoffManifest(
        schema_version=1,
        expected_grid=ExpectedGrid(
            families=[judge.family_id for judge in config.judges],
            bundles=list(BUNDLES),
            relation_ids=[row.relation_id for row in slice_rows],
        ),
        run_dates=RunDates(started_at=started_at, completed_at=completed_at),
        judges=[JudgePin.model_validate(judge.model_dump(mode="json")) for judge in config.judges],
        prompt_pack_hash=pack_hash,
        rubric_version=config.rubric_version,
        baseline_effort=config.baseline_effort,
        full_grid_card_count=config.full_grid_card_count,
        source_hashes={
            "cards.jsonl": sha256_file(resolved_cards_path),
            "input-slice.jsonl": sha256_file(resolved_slice_path),
        },
        executor_config=_JSON_USAGE.validate_python(config.model_dump(mode="json")),
    )
    write_sidecar(paths.manifest_json, manifest.model_dump(mode="json"))
    return paths
