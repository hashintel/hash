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
    FullGridPreparedInputs,
    FullRunConfig,
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
from atlas_tools.relation.eval.provenance import executor_policy_payload, judge_pin
from atlas_tools.relation.eval.resume import CompletedJournals, validate_completed_journals
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    ExpectedEffortArm,
    ExpectedGrid,
    ExpectedRepeatArm,
    FullGridManifest,
    HandoffManifest,
    ReasoningEffort,
    RunDates,
    SliceRow,
    VoteRow,
)
from atlas_tools.relation.eval.transport import request_policy_payload

PILOT_RUN_STATE_SCHEMA_VERSION = 3
FULL_GRID_RUN_STATE_SCHEMA_VERSION = 2


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


class FullGridRunState(BaseModel):
    """Immutable full-grid checkpoint identity for the concurrent journal contract."""

    schema_version: Literal[2] = FULL_GRID_RUN_STATE_SCHEMA_VERSION
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

    def model_post_init(self, _context: object) -> None:
        required = {"cards.jsonl", "cards.manifest.json", "decisions.json"}
        if set(self.source_hashes) != required:
            raise ValueError("full-grid run state must bind concat cards, manifest, and decisions")
        if self.source_hashes["decisions.json"] != self.decisions_hash:
            raise ValueError("full-grid run-state decisions hash is inconsistent")


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
class FullGridPaths:
    votes_jsonl: Path
    attempts_jsonl: Path
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


def full_grid_paths(out_dir: Path) -> FullGridPaths:
    return FullGridPaths(
        votes_jsonl=out_dir / "votes.jsonl",
        attempts_jsonl=out_dir / "attempts.jsonl",
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


def prepare_full_grid_run_state(
    out_dir: Path,
    *,
    state: FullGridRunState,
) -> FullGridPaths:
    """Create or validate full-grid durable files, committing run state last."""
    paths = full_grid_paths(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if paths.manifest_json.exists():
        existing = _load_state(paths.run_state_json, FullGridRunState)
        if existing != state:
            raise ValueError("completed output does not match the requested full-grid plan")
        return paths

    if paths.run_state_json.exists():
        existing = _load_state(paths.run_state_json, FullGridRunState)
        if existing != state:
            raise ValueError("partial output does not match the requested full-grid plan")
        missing = [
            path.name for path in (paths.votes_jsonl, paths.attempts_jsonl) if not path.is_file()
        ]
        if missing:
            raise ValueError(f"partial output is missing durable files: {sorted(missing)}")
        _ensure_inflight_dir(paths.inflight_dir)
        return paths

    unexpected = [
        path.name
        for path in (paths.votes_jsonl, paths.attempts_jsonl, paths.inflight_dir)
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


def verify_full_grid_sources_unchanged(prepared: FullGridPreparedInputs) -> None:
    verify_sources_unchanged(prepared)
    if sha256_file(prepared.decisions_path) != prepared.decisions_hash:
        raise ValueError("analysis decisions changed during execution")


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


def full_grid_input_hashes(
    prepared: FullGridPreparedInputs,
) -> dict[str, Sha256Hex]:
    return prepared.source_hashes | {"decisions.json": prepared.decisions_hash}


def build_full_grid_manifest(
    *,
    paths: FullGridPaths,
    prepared: FullGridPreparedInputs,
    config: FullRunConfig,
    state: FullGridRunState,
    votes: Sequence[VoteRow],
) -> FullGridManifest:
    return FullGridManifest(
        expectation=prepared.expectation,
        run_dates=_run_dates(votes),
        judges=[judge_pin(judge) for judge in prepared.judges],
        decisions_hash=prepared.decisions_hash,
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        source_hashes=full_grid_input_hashes(prepared)
        | {
            "attempts.jsonl": sha256_file(paths.attempts_jsonl),
            "votes.jsonl": sha256_file(paths.votes_jsonl),
        },
        plan_hash=state.plan_hash,
        request_contract_hash=state.request_contract_hash,
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


def finalize_full_grid_output(
    *,
    paths: FullGridPaths,
    prepared: FullGridPreparedInputs,
    config: FullRunConfig,
    state: FullGridRunState,
    plan: VotePlan,
) -> FullGridManifest:
    """Validate all durable data and atomically publish the full-grid manifest."""
    journals = validate_completed_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=config.request_timeout,
    )
    verify_full_grid_sources_unchanged(prepared)
    manifest = build_full_grid_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        votes=journals.votes,
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


def validate_completed_full_grid_output(
    *,
    paths: FullGridPaths,
    prepared: FullGridPreparedInputs,
    config: FullRunConfig,
    state: FullGridRunState,
    plan: VotePlan,
) -> CompletedJournals:
    """Rebuild and compare an already-published full-grid manifest exactly."""
    manifest = _load_manifest(paths.manifest_json, FullGridManifest, "full-grid ")
    journals = validate_completed_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=config.request_timeout,
    )
    expected = build_full_grid_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        votes=journals.votes,
    )
    if manifest != expected:
        raise ValueError("completed full-grid manifest does not match the requested plan")
    return journals


def pilot_slice_hash(slice_rows: Sequence[SliceRow]) -> Sha256Hex:
    """Hash the exact durable pilot-slice representation bound by run state."""
    return sha256_bytes(jsonl_bytes(slice_rows))
