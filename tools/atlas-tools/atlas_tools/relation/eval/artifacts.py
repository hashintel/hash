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
    EvaluationCard,
    GridPreparedInputs,
    GridRunConfig,
    LoadedRunConfig,
    PilotRunConfig,
    PreparedCards,
    PreparedInputs,
    VotePlan,
)
from atlas_tools.relation.eval.grid import (
    BASELINE_REPEAT_INDEX,
    CardGridRecord,
    card_records,
    corpus_rows,
)
from atlas_tools.relation.eval.inputs import prepare_grid_review_inputs
from atlas_tools.relation.eval.journal import (
    atomic_replace,
    create_empty_jsonl,
    jsonl_bytes,
    load_jsonl,
    sync_directory,
    write_new_jsonl,
)
from atlas_tools.relation.eval.prompt import HOLDOUT
from atlas_tools.relation.eval.provenance import executor_policy_payload, judge_pin
from atlas_tools.relation.eval.resume import CompletedJournals, validate_completed_journals
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    CorpusRow,
    ExpectedEffortArm,
    ExpectedGrid,
    ExpectedRepeatArm,
    FamilyGridCounts,
    GridManifest,
    HandoffManifest,
    PhysicalAttemptRow,
    ReasoningEffort,
    RunDates,
    SliceRow,
    VoteRow,
)
from atlas_tools.relation.eval.transport import request_policy_payload

PILOT_RUN_STATE_SCHEMA_VERSION = 3
GRID_RUN_STATE_SCHEMA_VERSION = 1


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


class GridRunState(BaseModel):
    """Immutable grid checkpoint identity for the concurrent journal contract.

    A grid run has no precomputable plan hash: Phase B is derived from the
    committed baseline row. The request contract hash binds the frozen panel
    instead, and the fresh-vote journal prefix is revalidated against the
    re-derived cumulative plan on every resume. Imported pilot votes live
    outside the journal in ``imported-votes.jsonl``, bound here by hash.
    """

    schema_version: Literal[1] = GRID_RUN_STATE_SCHEMA_VERSION
    request_contract_hash: Sha256Hex
    source_hashes: dict[str, Sha256Hex]
    prompt_pack_hash: Sha256Hex
    rubric_version: Literal["rubric-v1"]
    panel_version: PositiveInt
    panel_frozen: bool
    pool_cards: PositiveInt
    corpus_hash: Sha256Hex
    imported_votes_hash: Sha256Hex
    imported_attempts_hash: Sha256Hex
    openrouter_sdk_version: str = Field(min_length=1)
    openrouter_openapi_version: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", frozen=True)

    def model_post_init(self, _context: object) -> None:
        required = {"cards.jsonl", "cards.manifest.json", "judges-panel", "pilot-votes.jsonl"}
        if set(self.source_hashes) != required:
            raise ValueError(
                "grid run state must bind concat cards, manifest, panel, and pilot votes"
            )


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
class GridPaths:
    votes_jsonl: Path
    attempts_jsonl: Path
    corpus_jsonl: Path
    imported_votes_jsonl: Path
    imported_attempts_jsonl: Path
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


def grid_paths(out_dir: Path) -> GridPaths:
    return GridPaths(
        votes_jsonl=out_dir / "votes.jsonl",
        attempts_jsonl=out_dir / "attempts.jsonl",
        corpus_jsonl=out_dir / "corpus.jsonl",
        imported_votes_jsonl=out_dir / "imported-votes.jsonl",
        imported_attempts_jsonl=out_dir / "imported-attempts.jsonl",
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


def prepare_grid_run_state(
    out_dir: Path,
    *,
    state: GridRunState,
    prepared: GridPreparedInputs,
) -> GridPaths:
    """Create or validate grid durable files, committing run state last.

    ``corpus.jsonl`` and the imported pilot material are deterministic
    projections of the inputs, so they are written once alongside the empty
    journals and bound by hash in the run state.
    """
    paths = grid_paths(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if paths.manifest_json.exists():
        existing = _load_state(paths.run_state_json, GridRunState)
        if existing != state:
            raise ValueError("completed output does not match the requested grid run")
        return paths

    if paths.run_state_json.exists():
        existing = _load_state(paths.run_state_json, GridRunState)
        if existing != state:
            raise ValueError("partial output does not match the requested grid run")
        missing = [
            path.name
            for path in (
                paths.votes_jsonl,
                paths.attempts_jsonl,
                paths.corpus_jsonl,
                paths.imported_votes_jsonl,
                paths.imported_attempts_jsonl,
            )
            if not path.is_file()
        ]
        if missing:
            raise ValueError(f"partial output is missing durable files: {sorted(missing)}")
        if sha256_file(paths.corpus_jsonl) != state.corpus_hash:
            raise ValueError("partial output corpus.jsonl does not match run-state.json")
        if sha256_file(paths.imported_votes_jsonl) != state.imported_votes_hash:
            raise ValueError("partial output imported-votes.jsonl does not match run-state.json")
        if sha256_file(paths.imported_attempts_jsonl) != state.imported_attempts_hash:
            raise ValueError("partial output imported-attempts.jsonl does not match run-state.json")
        _ensure_inflight_dir(paths.inflight_dir)
        return paths

    unexpected = [
        path.name
        for path in (
            paths.votes_jsonl,
            paths.attempts_jsonl,
            paths.corpus_jsonl,
            paths.imported_votes_jsonl,
            paths.imported_attempts_jsonl,
            paths.inflight_dir,
        )
        if path.exists()
    ]
    if unexpected:
        raise ValueError(f"output has files without run-state.json: {sorted(unexpected)}")

    write_new_jsonl(paths.corpus_jsonl, grid_corpus_rows(prepared))
    write_new_jsonl(paths.imported_votes_jsonl, prepared.imported.votes)
    write_new_jsonl(paths.imported_attempts_jsonl, _imported_attempt_rows(prepared))
    create_empty_jsonl(paths.votes_jsonl)
    create_empty_jsonl(paths.attempts_jsonl)
    _ensure_inflight_dir(paths.inflight_dir)
    _write_state(paths.run_state_json, state)
    return paths


def grid_corpus_rows(prepared: GridPreparedInputs) -> list[CorpusRow]:
    """Project the verified deck into corpus rows: pool plus shot-excluded cards."""
    pool_ids = {card.relation_id for card in prepared.pool}
    shot_cards = [
        card for relation_id, card in sorted(prepared.cards.items()) if relation_id not in pool_ids
    ]
    return corpus_rows(
        pool=prepared.pool,
        shot_cards=shot_cards,
        holdout_verdicts=dict(HOLDOUT),
    )


def _imported_attempt_rows(prepared: GridPreparedInputs) -> list[PhysicalAttemptRow]:
    return [
        attempt
        for vote in prepared.imported.votes
        for attempt in prepared.imported.attempts_by_vote[vote.vote_id]
    ]


def verify_sources_unchanged(prepared: PreparedCards) -> None:
    if sha256_file(prepared.cards_path) != prepared.source_hashes["cards.jsonl"]:
        raise ValueError("cards.jsonl changed during execution; manifest was not finalized")
    if sha256_file(prepared.manifest_path) != prepared.source_hashes["cards.manifest.json"]:
        raise ValueError("cards.manifest.json changed during execution")


def _family_grid_counts(
    config: GridRunConfig,
    *,
    prepared: GridPreparedInputs,
    records: Sequence[CardGridRecord],
) -> list[FamilyGridCounts]:
    imported_ids = {vote.vote_id for vote in prepared.imported.votes}
    counts: list[FamilyGridCounts] = []
    for judge in config.judges:
        imported = 0
        fresh_baseline = 0
        refinement = 0
        abstentions = 0
        known_cost = 0.0
        for record in records:
            for vote in record.votes:
                if vote.family_id != judge.family_id:
                    continue
                abstentions += vote.abstained
                if vote.vote_id in imported_ids:
                    imported += 1
                    continue
                known_cost += vote.known_cost_usd
                if vote.repeat_index == BASELINE_REPEAT_INDEX:
                    fresh_baseline += 1
                else:
                    refinement += 1
        counts.append(
            FamilyGridCounts(
                family_id=judge.family_id,
                imported_votes=imported,
                fresh_baseline_votes=fresh_baseline,
                refinement_votes=refinement,
                abstentions=abstentions,
                known_cost_usd=known_cost,
            )
        )
    return counts


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


def grid_input_hashes(prepared: GridPreparedInputs) -> dict[str, Sha256Hex]:
    return prepared.source_hashes | {
        "judges-panel": prepared.panel_hash,
        "pilot-votes.jsonl": prepared.imported.votes_hash,
    }


def _fresh_run_dates(
    records: Sequence[CardGridRecord],
    imported_ids: frozenset[Sha256Hex],
) -> RunDates:
    fresh = [
        vote for record in records for vote in record.votes if vote.vote_id not in imported_ids
    ]
    return _run_dates(fresh or [vote for record in records for vote in record.votes])


def build_grid_manifest(
    *,
    paths: GridPaths,
    prepared: GridPreparedInputs,
    config: GridRunConfig,
    state: GridRunState,
    records: Sequence[CardGridRecord],
) -> GridManifest:
    refined = sum(record.refined for record in records)
    family_counts = _family_grid_counts(config, prepared=prepared, records=records)
    return GridManifest(
        panel_version=config.panel.version,
        panel_frozen=config.panel.frozen,
        judges=[judge_pin(judge) for judge in config.judges],
        manual_prunes={prune.model: prune.reason for prune in config.panel.manual_prunes},
        run_dates=_fresh_run_dates(
            records, frozenset(vote.vote_id for vote in prepared.imported.votes)
        ),
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        source_hashes=grid_input_hashes(prepared)
        | {
            "attempts.jsonl": sha256_file(paths.attempts_jsonl),
            "corpus.jsonl": sha256_file(paths.corpus_jsonl),
            "imported-attempts.jsonl": sha256_file(paths.imported_attempts_jsonl),
            "imported-votes.jsonl": sha256_file(paths.imported_votes_jsonl),
            "votes.jsonl": sha256_file(paths.votes_jsonl),
        },
        request_contract_hash=state.request_contract_hash,
        pool_cards=len(prepared.pool),
        shot_excluded_cards=len(prepared.cards) - len(prepared.pool),
        holdout_cards=sum(1 for row in grid_corpus_rows(prepared) if row.is_holdout),
        refined_cards=refined,
        realized_trigger_rate=refined / len(prepared.pool),
        family_counts=family_counts,
        total_votes=sum(len(record.votes) for record in records),
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


def grid_votes_by_id(
    prepared: GridPreparedInputs,
    fresh_votes: Sequence[VoteRow],
) -> dict[Sha256Hex, VoteRow]:
    """Merge imported pilot votes with this run's fresh journal votes."""
    merged = {vote.vote_id: vote for vote in prepared.imported.votes}
    for vote in fresh_votes:
        if vote.vote_id in merged:
            raise ValueError(f"fresh vote {vote.vote_id} duplicates an imported pilot vote")
        merged[vote.vote_id] = vote
    return merged


def finalize_grid_output(
    *,
    paths: GridPaths,
    prepared: GridPreparedInputs,
    config: GridRunConfig,
    state: GridRunState,
    plan: VotePlan,
) -> GridManifest:
    """Validate all durable data and atomically publish the grid manifest."""
    journals = validate_completed_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=config.request_timeout,
    )
    verify_sources_unchanged(prepared)
    records = card_records(
        config,
        pool=prepared.pool,
        pack_hash=prepared.pack_hash,
        votes_by_id=grid_votes_by_id(prepared, journals.votes),
    )
    manifest = build_grid_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        records=records,
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


@dataclass(frozen=True)
class CompletedGridRun:
    """A hash-verified completed grid run, ready for downstream consumption.

    ``records`` merge imported pilot votes with the fresh journal; downstream
    stages never need the pilot handoff again because the imported material is
    bound into the run directory. ``pool`` preserves ascending relation_id
    order and carries the card annotations (producer, family_id, prescreen)
    that corpus rows deliberately omit.
    """

    paths: GridPaths
    manifest: GridManifest
    pool: tuple[EvaluationCard, ...]
    corpus: tuple[CorpusRow, ...]
    records: tuple[CardGridRecord, ...]
    panel_hash: Sha256Hex


def load_completed_grid(
    *,
    run_dir: Path,
    cards_dir: Path,
    loaded_config: LoadedRunConfig,
) -> CompletedGridRun:
    """Load and revalidate a finalized grid run against its manifest hashes.

    The deck, panel, journals, corpus, and imported material must all match
    the manifest exactly; any drift is a hard error, not a warning.
    """
    config = loaded_config.grid()
    paths = grid_paths(run_dir)
    if not paths.manifest_json.is_file():
        raise ValueError(f"{run_dir} is not a completed grid run: manifest.json is missing")
    manifest = _load_manifest(paths.manifest_json, GridManifest, "grid ")
    prepared = prepare_grid_review_inputs(cards_dir, loaded_config)
    checks = {
        "cards.jsonl": (
            manifest.source_hashes["cards.jsonl"],
            prepared.source_hashes["cards.jsonl"],
        ),
        "judges-panel": (manifest.source_hashes["judges-panel"], prepared.panel_hash),
        "prompt-pack": (manifest.prompt_pack_hash, prepared.pack_hash),
    }
    for name, (recorded, current) in checks.items():
        if recorded != current:
            raise ValueError(f"{name} differs from what the grid run was executed against")
    for name, path in (
        ("votes.jsonl", paths.votes_jsonl),
        ("attempts.jsonl", paths.attempts_jsonl),
        ("corpus.jsonl", paths.corpus_jsonl),
        ("imported-votes.jsonl", paths.imported_votes_jsonl),
        ("imported-attempts.jsonl", paths.imported_attempts_jsonl),
    ):
        if manifest.source_hashes[name] != sha256_file(path):
            raise ValueError(f"{name} does not match the hash recorded in manifest.json")

    fresh = load_jsonl(paths.votes_jsonl, VoteRow)
    imported = load_jsonl(paths.imported_votes_jsonl, VoteRow)
    merged: dict[Sha256Hex, VoteRow] = {vote.vote_id: vote for vote in imported}
    for vote in fresh:
        if vote.vote_id in merged:
            raise ValueError(f"fresh vote {vote.vote_id} duplicates an imported pilot vote")
        merged[vote.vote_id] = vote
    records = card_records(
        config,
        pool=prepared.pool,
        pack_hash=prepared.pack_hash,
        votes_by_id=merged,
    )
    return CompletedGridRun(
        paths=paths,
        manifest=manifest,
        pool=prepared.pool,
        corpus=tuple(load_jsonl(paths.corpus_jsonl, CorpusRow)),
        records=tuple(records),
        panel_hash=prepared.panel_hash,
    )


def validate_completed_grid_output(
    *,
    paths: GridPaths,
    prepared: GridPreparedInputs,
    config: GridRunConfig,
    state: GridRunState,
    plan: VotePlan,
) -> CompletedJournals:
    """Rebuild and compare an already-published grid manifest exactly."""
    manifest = _load_manifest(paths.manifest_json, GridManifest, "grid ")
    journals = validate_completed_journals(
        paths=paths,
        prepared=prepared,
        plan=plan,
        timeout=config.request_timeout,
    )
    if sha256_bytes(jsonl_bytes(grid_corpus_rows(prepared))) != sha256_file(paths.corpus_jsonl):
        raise ValueError("completed corpus.jsonl does not match the verified deck")
    records = card_records(
        config,
        pool=prepared.pool,
        pack_hash=prepared.pack_hash,
        votes_by_id=grid_votes_by_id(prepared, journals.votes),
    )
    expected = build_grid_manifest(
        paths=paths,
        prepared=prepared,
        config=config,
        state=state,
        records=records,
    )
    if manifest != expected:
        raise ValueError("completed grid manifest does not match the requested run")
    return journals


def pilot_slice_hash(slice_rows: Sequence[SliceRow]) -> Sha256Hex:
    """Hash the exact durable pilot-slice representation bound by run state."""
    return sha256_bytes(jsonl_bytes(slice_rows))
