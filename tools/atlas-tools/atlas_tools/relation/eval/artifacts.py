"""Evaluation output paths, run state, manifests, and final validation.

The concrete artifact layout lives here. Execution contracts come from
``eval.contract`` and request-policy details come from ``eval.transport``. This
keeps orchestration dependencies one-way and keeps
append/recovery mechanics in ``eval.journal``.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

from pydantic import BaseModel, ConfigDict, Field, JsonValue, PositiveInt, ValidationError

from atlas_tools.common import Sha256Hex, canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.eval.contract import (
    BaseRunConfig,
    LadderPreparedInputs,
    LadderRunConfig,
    PilotRunConfig,
    PreparedCards,
    PreparedInputs,
    VotePlan,
)
from atlas_tools.relation.eval.journal import (
    atomic_replace,
    create_empty_jsonl,
    jsonl_bytes,
    sync_directory,
    write_new_jsonl,
)
from atlas_tools.relation.eval.ladder import CardLadderOutcome, complete_card_outcomes
from atlas_tools.relation.eval.provenance import executor_policy_payload, judge_pin
from atlas_tools.relation.eval.resume import CompletedJournals, validate_completed_journals
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    ExpectedEffortArm,
    ExpectedGrid,
    ExpectedRepeatArm,
    HandoffManifest,
    LadderManifest,
    ReasoningEffort,
    ReviewQueueRow,
    RunDates,
    RungEconomics,
    SliceRow,
    VoteRow,
)
from atlas_tools.relation.eval.transport import request_policy_payload

PILOT_RUN_STATE_SCHEMA_VERSION = 3
LADDER_RUN_STATE_SCHEMA_VERSION = 1


class PilotRunState(BaseModel):
    """Immutable pilot checkpoint identity for the concurrent journal contract."""

    schema_version: Literal[3] = PILOT_RUN_STATE_SCHEMA_VERSION
    plan_hash: Sha256Hex
    request_contract_hash: Sha256Hex
    source_hashes: dict[str, Sha256Hex]
    prompt_pack_hash: Sha256Hex
    slice_hash: Sha256Hex
    expected_votes: PositiveInt
    openrouter_sdk_version: str = Field(min_length=1)
    openrouter_openapi_version: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", frozen=True)


class LadderRunState(BaseModel):
    """Immutable ladder checkpoint identity for the concurrent journal contract.

    A ladder run has no precomputable plan hash: rounds are derived from the
    committed journal. The request contract hash binds the panel (rungs,
    framings, shell, pins) instead, and the journal prefix is revalidated
    against the re-derived cumulative plan on every resume.
    """

    schema_version: Literal[1] = LADDER_RUN_STATE_SCHEMA_VERSION
    request_contract_hash: Sha256Hex
    source_hashes: dict[str, Sha256Hex]
    prompt_pack_hash: Sha256Hex
    rubric_version: Literal["rubric-v1"]
    shell: str = Field(min_length=1)
    panel_version: PositiveInt
    panel_frozen: bool
    eligible_cards: PositiveInt
    openrouter_sdk_version: str = Field(min_length=1)
    openrouter_openapi_version: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", frozen=True)

    def model_post_init(self, _context: object) -> None:
        required = {"cards.jsonl", "cards.manifest.json", "judges-panel"}
        if set(self.source_hashes) != required:
            raise ValueError("ladder run state must bind concat cards, manifest, and panel")


@dataclass(frozen=True)
class PilotPaths:
    votes_jsonl: Path
    attempts_jsonl: Path
    slice_jsonl: Path
    manifest_json: Path
    run_state_json: Path
    inflight_dir: Path
    lock_file: Path


@dataclass(frozen=True)
class LadderPaths:
    votes_jsonl: Path
    attempts_jsonl: Path
    review_queue_jsonl: Path
    manifest_json: Path
    run_state_json: Path
    inflight_dir: Path
    lock_file: Path


@dataclass(frozen=True)
class ExpectedArms:
    repeat: ExpectedRepeatArm
    effort: ExpectedEffortArm | None


def pilot_paths(out_dir: Path) -> PilotPaths:
    return PilotPaths(
        votes_jsonl=out_dir / "votes.jsonl",
        attempts_jsonl=out_dir / "attempts.jsonl",
        slice_jsonl=out_dir / "slice.jsonl",
        manifest_json=out_dir / "manifest.json",
        run_state_json=out_dir / "run-state.json",
        inflight_dir=out_dir / "inflight",
        lock_file=out_dir / ".run.lock",
    )


def ladder_paths(out_dir: Path) -> LadderPaths:
    return LadderPaths(
        votes_jsonl=out_dir / "votes.jsonl",
        attempts_jsonl=out_dir / "attempts.jsonl",
        review_queue_jsonl=out_dir / "review-queue.jsonl",
        manifest_json=out_dir / "manifest.json",
        run_state_json=out_dir / "run-state.json",
        inflight_dir=out_dir / "inflight",
        lock_file=out_dir / ".run.lock",
    )


def _load_state[State: BaseModel](path: Path, model: type[State]) -> State:
    try:
        return model.model_validate_json(path.read_bytes())
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid {path.name}: {error}") from error


def _ensure_inflight_dir(path: Path) -> None:
    if path.exists():
        if not path.is_dir():
            raise ValueError(f"in-flight path is not a directory: {path}")
        return
    path.mkdir()
    sync_directory(path.parent)


def _write_state(path: Path, state: BaseModel) -> None:
    atomic_replace(path, canonical_json_bytes(state.model_dump(mode="json")) + b"\n")


def prepare_pilot_run_state(
    out_dir: Path,
    *,
    state: PilotRunState,
    slice_rows: Sequence[SliceRow],
) -> PilotPaths:
    """Create or validate the pilot's durable files, committing run state last."""
    paths = pilot_paths(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if paths.manifest_json.exists():
        existing = _load_state(paths.run_state_json, PilotRunState)
        if existing != state:
            raise ValueError("completed output does not match the requested pilot plan")
        return paths

    if paths.run_state_json.exists():
        existing = _load_state(paths.run_state_json, PilotRunState)
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
        _ensure_inflight_dir(paths.inflight_dir)
        return paths

    unexpected = [
        path.name
        for path in (
            paths.votes_jsonl,
            paths.attempts_jsonl,
            paths.slice_jsonl,
            paths.inflight_dir,
        )
        if path.exists()
    ]
    if unexpected:
        raise ValueError(f"output has files without run-state.json: {sorted(unexpected)}")

    write_new_jsonl(paths.slice_jsonl, slice_rows)
    create_empty_jsonl(paths.votes_jsonl)
    create_empty_jsonl(paths.attempts_jsonl)
    _ensure_inflight_dir(paths.inflight_dir)
    _write_state(paths.run_state_json, state)
    return paths


def prepare_ladder_run_state(
    out_dir: Path,
    *,
    state: LadderRunState,
) -> LadderPaths:
    """Create or validate ladder durable files, committing run state last."""
    paths = ladder_paths(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if paths.manifest_json.exists():
        existing = _load_state(paths.run_state_json, LadderRunState)
        if existing != state:
            raise ValueError("completed output does not match the requested ladder run")
        return paths

    if paths.run_state_json.exists():
        existing = _load_state(paths.run_state_json, LadderRunState)
        if existing != state:
            raise ValueError("partial output does not match the requested ladder run")
        missing = [
            path.name for path in (paths.votes_jsonl, paths.attempts_jsonl) if not path.is_file()
        ]
        if missing:
            raise ValueError(f"partial output is missing durable files: {sorted(missing)}")
        _ensure_inflight_dir(paths.inflight_dir)
        return paths

    unexpected = [
        path.name
        for path in (
            paths.votes_jsonl,
            paths.attempts_jsonl,
            paths.review_queue_jsonl,
            paths.inflight_dir,
        )
        if path.exists()
    ]
    if unexpected:
        raise ValueError(f"output has files without run-state.json: {sorted(unexpected)}")

    create_empty_jsonl(paths.votes_jsonl)
    create_empty_jsonl(paths.attempts_jsonl)
    _ensure_inflight_dir(paths.inflight_dir)
    _write_state(paths.run_state_json, state)
    return paths


def verify_sources_unchanged(prepared: PreparedCards) -> None:
    if sha256_file(prepared.cards_path) != prepared.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed during execution; manifest was not finalized")
    if sha256_file(prepared.manifest_path) != prepared.source_hashes["cards.manifest.json"]:
        raise ValueError("cards.manifest.json changed during execution")


def review_queue_rows(outcomes: Sequence[CardLadderOutcome]) -> list[ReviewQueueRow]:
    """Project coincident-led cards into deterministic review-queue rows."""
    rows: list[ReviewQueueRow] = []
    for outcome in outcomes:
        if outcome.first_coincident_rung is None:
            continue
        if outcome.coincident_rung_counts is None or outcome.coincident_rung_abstentions is None:
            raise ValueError(f"card {outcome.card.relation_id} led coincident without rung counts")
        rows.append(
            ReviewQueueRow(
                relation_id=outcome.card.relation_id,
                card_hash=outcome.card.card_hash,
                first_coincident_rung=outcome.first_coincident_rung,
                verdict_counts=outcome.coincident_rung_counts,
                abstentions=outcome.coincident_rung_abstentions,
            )
        )
    return rows


def write_review_queue(paths: LadderPaths, rows: Sequence[ReviewQueueRow]) -> None:
    """Durably publish the derived review queue; identical reruns are no-ops."""
    atomic_replace(paths.review_queue_jsonl, jsonl_bytes(rows))


def _rung_economics(
    config: LadderRunConfig,
    outcomes: Sequence[CardLadderOutcome],
) -> list[RungEconomics]:
    family_rungs = {judge.family_id: judge.rung for judge in config.judges}
    economics: list[RungEconomics] = []
    for rung in range(1, config.rung_count + 1):
        cards = 0
        votes = 0
        abstentions = 0
        early_exits = 0
        known_cost = 0.0
        for outcome in outcomes:
            if outcome.rung_reached < rung:
                continue
            cards += 1
            if outcome.early_exit and outcome.rung_reached == rung:
                early_exits += 1
            for vote in outcome.votes:
                if family_rungs[vote.family_id] != rung:
                    continue
                votes += 1
                abstentions += vote.abstained
                known_cost += vote.known_cost_usd
        economics.append(
            RungEconomics(
                rung=rung,
                cards=cards,
                votes=votes,
                abstentions=abstentions,
                early_exits=early_exits,
                known_cost_usd=known_cost,
            )
        )
    return economics


def _expected_arms(config: PilotRunConfig, prepared: PreparedInputs) -> ExpectedArms:
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


def _run_dates(votes: Sequence[VoteRow]) -> RunDates:
    if not votes:
        raise ValueError("cannot finalize a manifest without votes")
    return RunDates(
        started_at=min(vote.ts_request for vote in votes),
        completed_at=max(vote.ts_response for vote in votes),
    )


def _executor_config(config: BaseRunConfig) -> dict[str, JsonValue]:
    """Project the request-contract config into the manifest.

    Operational knobs (cost cap, concurrency limits) are excluded: they cannot
    change any request's semantics and may be retuned between resumed sessions,
    so a completed manifest must not bind them.
    """
    return cast(
        "dict[str, JsonValue]",
        config.model_dump(mode="json", exclude={"max_cost_usd", "concurrency"}),
    )


def build_pilot_manifest(
    *,
    paths: PilotPaths,
    prepared: PreparedInputs,
    config: PilotRunConfig,
    state: PilotRunState,
    votes: Sequence[VoteRow],
) -> HandoffManifest:
    arms = _expected_arms(config, prepared)
    return HandoffManifest(
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
        run_dates=_run_dates(votes),
        judges=[judge_pin(judge) for judge in config.judges],
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        full_grid_card_count=prepared.full_grid_card_count,
        source_hashes=prepared.source_hashes
        | {
            "attempts.jsonl": sha256_file(paths.attempts_jsonl),
            "slice.jsonl": sha256_file(paths.slice_jsonl),
            "votes.jsonl": sha256_file(paths.votes_jsonl),
        },
        openrouter_sdk_version=state.openrouter_sdk_version,
        openrouter_openapi_version=state.openrouter_openapi_version,
        executor_config=_executor_config(config),
    )


def ladder_input_hashes(prepared: LadderPreparedInputs) -> dict[str, Sha256Hex]:
    return prepared.source_hashes | {"judges-panel": prepared.panel_hash}


def build_ladder_manifest(
    *,
    paths: LadderPaths,
    prepared: LadderPreparedInputs,
    config: LadderRunConfig,
    state: LadderRunState,
    outcomes: Sequence[CardLadderOutcome],
) -> LadderManifest:
    votes = [vote for outcome in outcomes for vote in outcome.votes]
    return LadderManifest(
        shell=config.shell,
        panel_version=config.panel.version,
        panel_frozen=config.panel.frozen,
        judges=[judge_pin(judge) for judge in config.judges],
        judge_rungs={judge.family_id: judge.rung for judge in config.judges},
        run_dates=_run_dates(votes),
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        source_hashes=ladder_input_hashes(prepared)
        | {
            "attempts.jsonl": sha256_file(paths.attempts_jsonl),
            "review-queue.jsonl": sha256_file(paths.review_queue_jsonl),
            "votes.jsonl": sha256_file(paths.votes_jsonl),
        },
        request_contract_hash=state.request_contract_hash,
        eligible_cards=len(prepared.eligible),
        total_votes=len(votes),
        early_exit_cards=sum(outcome.early_exit for outcome in outcomes),
        review_queue_cards=sum(outcome.first_coincident_rung is not None for outcome in outcomes),
        rung_economics=_rung_economics(config, outcomes),
        openrouter_sdk_version=state.openrouter_sdk_version,
        openrouter_openapi_version=state.openrouter_openapi_version,
        executor_config=_executor_config(config),
        executor_policy=executor_policy_payload(),
        request_policy=request_policy_payload(),
    )


def _write_manifest(path: Path, manifest: BaseModel) -> None:
    atomic_replace(
        path,
        canonical_json_bytes(manifest.model_dump(mode="json")) + b"\n",
    )


def finalize_pilot_output(
    *,
    paths: PilotPaths,
    prepared: PreparedInputs,
    config: PilotRunConfig,
    state: PilotRunState,
    plan: VotePlan,
) -> HandoffManifest:
    """Validate all durable data and atomically publish the pilot manifest."""
    journals = validate_completed_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=config.request_timeout,
    )
    verify_sources_unchanged(prepared)
    manifest = build_pilot_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        votes=journals.votes,
    )
    _write_manifest(paths.manifest_json, manifest)
    return manifest


def finalize_ladder_output(
    *,
    paths: LadderPaths,
    prepared: LadderPreparedInputs,
    config: LadderRunConfig,
    state: LadderRunState,
    plan: VotePlan,
) -> LadderManifest:
    """Validate all durable data and atomically publish the ladder manifest.

    The review queue is derived from the validated vote journal and published
    before the manifest binds its hash; re-deriving it from the same journal
    is byte-identical, so an interrupted finalize simply repeats.
    """
    journals = validate_completed_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=config.request_timeout,
    )
    verify_sources_unchanged(prepared)
    outcomes = complete_card_outcomes(
        config,
        prepared=prepared,
        votes_by_id={vote.vote_id: vote for vote in journals.votes},
    )
    write_review_queue(paths, review_queue_rows(outcomes))
    manifest = build_ladder_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        outcomes=outcomes,
    )
    _write_manifest(paths.manifest_json, manifest)
    return manifest


def _load_manifest[Manifest: BaseModel](
    path: Path,
    model: type[Manifest],
    label: str,
) -> Manifest:
    try:
        return model.model_validate_json(path.read_bytes())
    except (OSError, ValidationError) as error:
        raise ValueError(f"invalid completed {label}manifest.json: {error}") from error


def validate_completed_pilot_output(
    *,
    paths: PilotPaths,
    prepared: PreparedInputs,
    config: PilotRunConfig,
    state: PilotRunState,
    plan: VotePlan,
) -> CompletedJournals:
    """Revalidate an already-published pilot handoff against requested inputs."""
    manifest = _load_manifest(paths.manifest_json, HandoffManifest, "")
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
    if manifest.executor_config != _executor_config(config):
        raise ValueError("completed manifest executor config does not match the requested plan")
    return validate_completed_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=config.request_timeout,
    )


def validate_completed_ladder_output(
    *,
    paths: LadderPaths,
    prepared: LadderPreparedInputs,
    config: LadderRunConfig,
    state: LadderRunState,
    plan: VotePlan,
) -> CompletedJournals:
    """Rebuild and compare an already-published ladder manifest exactly."""
    manifest = _load_manifest(paths.manifest_json, LadderManifest, "ladder ")
    journals = validate_completed_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=config.request_timeout,
    )
    outcomes = complete_card_outcomes(
        config,
        prepared=prepared,
        votes_by_id={vote.vote_id: vote for vote in journals.votes},
    )
    if sha256_bytes(jsonl_bytes(review_queue_rows(outcomes))) != sha256_file(
        paths.review_queue_jsonl
    ):
        raise ValueError("completed review-queue.jsonl does not match the vote journal")
    expected = build_ladder_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        outcomes=outcomes,
    )
    if manifest != expected:
        raise ValueError("completed ladder manifest does not match the requested run")
    return journals


def pilot_slice_hash(slice_rows: Sequence[SliceRow]) -> Sha256Hex:
    """Hash the exact durable pilot-slice representation bound by run state."""
    return sha256_bytes(jsonl_bytes(slice_rows))
