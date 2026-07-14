"""Production-grid execution, pilot-vote import, guard, resume, and deliverables tests."""

import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from atlas_tools.common import sha256_bytes, sha256_file
from atlas_tools.relation.eval.contract import (
    GridJudge,
    GridRunConfig,
    GuardConfig,
    LoadedRunConfig,
    ManualPrune,
    PanelConfig,
)
from atlas_tools.relation.eval.grid import refinement_trigger
from atlas_tools.relation.eval.grid_report import write_grid_deliverables
from atlas_tools.relation.eval.inputs import prepare_grid_review_inputs
from atlas_tools.relation.eval.journal import load_jsonl
from atlas_tools.relation.eval.prompt import FEW_SHOT, HOLDOUT
from atlas_tools.relation.eval.run import (
    load_run_config,
    run_evaluation,
    run_grid,
)
from atlas_tools.relation.eval.schema import GridManifest, PhysicalAttemptRow, VoteRow
from atlas_tools.relation.eval.transport import GridGuardError
from tests.relation.grid_fixtures import (
    ABSTAIN_JUDGE,
    CARD_A,
    CARD_C,
    CARD_D,
    CARD_E,
    COINCIDENT_JUDGE,
    DISSENT_BUNDLE_COUNT,
    DISSENT_BUNDLES,
    DISSENT_FAMILY,
    DISSENT_RELATION,
    DRIFTED_JUDGE,
    EXPECTED_BASELINE_VOTES,
    EXPECTED_FRESH_CALLS,
    EXPECTED_IMPORT_RUN_CALLS,
    EXPECTED_REFINED_CARDS,
    EXPECTED_REFINEMENT_VOTES,
    EXPECTED_TOTAL_VOTES,
    JUDGE_MODELS,
    POOL_SIZE,
    MappingTransport,
    analysis_decisions,
    drifted_answer,
    gates_clean_answer,
    grid_config,
    grid_judge,
    live_relation_id,
    write_decisions,
    write_empty_pilot,
    write_grid_concat,
    write_grid_config,
)
from tests.relation.test_eval_run import _read_attempts, _read_votes

PACKAGE_ROOT = Path(__file__).resolve().parents[2]

_WALL_CLOCK_FIELDS = frozenset({"ts_request", "ts_response", "latency"})
_COST_EVIDENCE_FIELDS = frozenset({"known_cost_usd", "cost_complete", "cost_usd"})
_REFINEMENT_VOTES_PER_FAMILY = EXPECTED_REFINED_CARDS * 2


def _grid_setup(
    tmp_path: Path,
    config: GridRunConfig | None = None,
) -> tuple[Path, LoadedRunConfig, Path]:
    """Write a verified deck, a frozen grid config, and an empty pilot handoff."""
    cards_dir = write_grid_concat(tmp_path / "concat")
    loaded = load_run_config(write_grid_config(tmp_path / "judges.yaml", config or grid_config()))
    pack_hash = prepare_grid_review_inputs(cards_dir, loaded).pack_hash
    pilot_dir = write_empty_pilot(tmp_path / "pilot", pack_hash=pack_hash)
    return cards_dir, loaded, pilot_dir


def _manifest(run_dir: Path) -> GridManifest:
    return GridManifest.model_validate_json((run_dir / "manifest.json").read_bytes())


def _stable(vote: VoteRow, *, drop_cost: bool = False) -> dict[str, object]:
    """Project a vote for cross-run comparison, dropping run-local evidence."""
    exclude = set(_WALL_CLOCK_FIELDS)
    if drop_cost:
        exclude |= _COST_EVIDENCE_FIELDS
    return vote.model_dump(mode="json", exclude=exclude)


def _guard_cause(error: BaseException) -> GridGuardError:
    """Find the guard breach behind the executor's resumable stop."""
    cause: BaseException | None = error
    while cause is not None:
        if isinstance(cause, GridGuardError):
            return cause
        cause = cause.__cause__
    raise AssertionError(f"no GridGuardError behind {error!r}")


# --- Config contract ----------------------------------------------------------------


def test_grid_config_yaml_round_trips_strictly(tmp_path: Path) -> None:
    config = grid_config()
    path = write_grid_config(tmp_path / "judges.yaml", config)
    loaded = load_run_config(path)
    assert loaded.grid() == config
    assert loaded.content_hash == sha256_file(path)
    assert loaded.grid().request_timeout == timedelta(seconds=5)
    assert loaded.grid().schema_version == 4
    assert loaded.grid().mode == "grid"

    payload = config.model_dump(mode="json")
    payload["escalation"] = "dynamic"
    drifted = tmp_path / "judges-extra.yaml"
    drifted.write_text(yaml.safe_dump(payload), encoding="utf-8")
    with pytest.raises(ValueError, match="invalid run config"):
        load_run_config(drifted)


def test_grid_judges_require_a_positive_pilot_cost_and_pinned_effort() -> None:
    with pytest.raises(ValidationError, match="greater than 0"):
        GridJudge(
            provider_slug="test-provider/j1",
            provider_name="Provider j1",
            model="test/j1",
            pilot_cost_per_vote_usd=0.0,
        )
    with pytest.raises(ValidationError, match="grid judges pin effort directly"):
        GridJudge(
            provider_slug="test-provider/j1",
            provider_name="Provider j1",
            model="test/j1",
            higher_effort="high",
            pilot_cost_per_vote_usd=0.01,
        )


def test_frozen_panel_documents_its_pruning_floor_and_stays_dormant() -> None:
    with pytest.raises(ValidationError, match="pruning floor"):
        PanelConfig(version=1, frozen=True)
    with pytest.raises(ValidationError, match="dormant"):
        PanelConfig.model_validate(
            {"version": 1, "frozen": False, "reserve_topology": "escalating"}
        )


def test_manually_pruned_families_cannot_hold_seats() -> None:
    with pytest.raises(ValidationError, match="cannot hold seats"):
        GridRunConfig(
            panel=PanelConfig(
                version=1,
                frozen=True,
                pruning_floor="fixture floor",
                manual_prunes=(ManualPrune(model=JUDGE_MODELS[0], reason="operator prune"),),
            ),
            judges=[grid_judge(model) for model in JUDGE_MODELS],
        )


@pytest.mark.parametrize(
    ("verdicts", "refined"),
    [
        pytest.param(["proximal"] * 5, False, id="unanimous-proximal"),
        pytest.param(["overlay"] * 5, False, id="unanimous-overlay"),
        pytest.param(["unclear"] * 5, False, id="unanimous-unclear"),
        pytest.param(["coincident"] * 5, True, id="unanimous-coincident-still-refines"),
        pytest.param(["proximal"] * 4 + ["overlay"], True, id="split"),
        pytest.param(["proximal"] * 4 + ["ABSTAIN"], True, id="abstention"),
        pytest.param(["proximal"] * 4 + ["coincident"], True, id="coincident-dissent"),
    ],
)
def test_refinement_trigger_matches_the_grid_contract(
    verdicts: list[str],
    refined: bool,  # noqa: FBT001 — parametrized expectation
) -> None:
    assert refinement_trigger(verdicts) is refined


# --- Startup refusals ---------------------------------------------------------------


def test_run_grid_refuses_an_unfrozen_panel(tmp_path: Path) -> None:
    config_path = write_grid_config(tmp_path / "judges.yaml", grid_config(frozen=False))
    with pytest.raises(ValueError, match="not frozen"):
        run_grid(
            cards_dir=tmp_path,
            out_dir=tmp_path / "run",
            loaded_config=load_run_config(config_path),
            pilot_dir=tmp_path,
            transport=MappingTransport(),
        )


def test_run_evaluation_grid_requires_the_pilot_handoff(tmp_path: Path) -> None:
    config_path = write_grid_config(tmp_path / "judges.yaml", grid_config())
    with pytest.raises(ValueError, match="requires the pilot handoff"):
        run_evaluation(
            cards_dir=tmp_path,
            out_dir=tmp_path / "run",
            loaded_config=load_run_config(config_path),
            transport=MappingTransport(),
        )


def test_pilot_prompt_pack_mismatch_voids_the_qualification(tmp_path: Path) -> None:
    cards_dir = write_grid_concat(tmp_path / "concat")
    loaded = load_run_config(write_grid_config(tmp_path / "judges.yaml", grid_config()))
    pilot_dir = write_empty_pilot(
        tmp_path / "pilot",
        pack_hash=sha256_bytes(b"drifted prompt pack"),
    )
    with pytest.raises(ValueError, match="voids the qualification"):
        run_grid(
            cards_dir=cards_dir,
            out_dir=tmp_path / "run",
            loaded_config=loaded,
            pilot_dir=pilot_dir,
            transport=MappingTransport(),
        )


# --- Empty-pilot run, idempotence, and the pilot-vote import ------------------------


@dataclass(frozen=True)
class GridWorkspace:
    """One completed empty-pilot grid run shared by the read-only tests."""

    cards_dir: Path
    loaded: LoadedRunConfig
    pilot_dir: Path
    run_dir: Path
    first_run_calls: int


@pytest.fixture(scope="module")
def workspace(tmp_path_factory: pytest.TempPathFactory) -> GridWorkspace:
    root = tmp_path_factory.mktemp("grid")
    cards_dir, loaded, pilot_dir = _grid_setup(root)
    run_dir = root / "run"
    transport = MappingTransport()
    run_grid(
        cards_dir=cards_dir,
        out_dir=run_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=transport,
    )
    return GridWorkspace(
        cards_dir=cards_dir,
        loaded=loaded,
        pilot_dir=pilot_dir,
        run_dir=run_dir,
        first_run_calls=transport.calls,
    )


def test_empty_pilot_run_buys_every_vote_fresh(workspace: GridWorkspace) -> None:
    assert workspace.first_run_calls == EXPECTED_FRESH_CALLS
    assert (workspace.run_dir / "imported-votes.jsonl").read_bytes() == b""

    manifest = _manifest(workspace.run_dir)
    assert manifest.bundle_id == "S1xF1"
    assert manifest.total_votes == EXPECTED_TOTAL_VOTES
    assert manifest.refined_cards == EXPECTED_REFINED_CARDS
    assert manifest.realized_trigger_rate == pytest.approx(EXPECTED_REFINED_CARDS / POOL_SIZE)
    assert manifest.pool_cards == POOL_SIZE
    assert manifest.holdout_cards == len(HOLDOUT)
    assert manifest.shot_excluded_cards == len(FEW_SHOT)
    for row in manifest.family_counts:
        assert row.imported_votes == 0
        assert row.fresh_baseline_votes == POOL_SIZE
        assert row.refinement_votes == _REFINEMENT_VOTES_PER_FAMILY
    abstentions = {row.family_id: row.abstentions for row in manifest.family_counts}
    assert abstentions == {model: (3 if model == ABSTAIN_JUDGE else 0) for model in JUDGE_MODELS}


def test_journal_carries_hand_computed_vote_shapes(workspace: GridWorkspace) -> None:
    votes = _read_votes(workspace.run_dir / "votes.jsonl")
    assert len(votes) == EXPECTED_TOTAL_VOTES
    assert len({vote.vote_id for vote in votes}) == EXPECTED_TOTAL_VOTES
    assert all(vote.bundle_id == "S1xF1" and vote.effort == "minimal" for vote in votes)
    assert all(vote.repeat_index in (0, 1, 2) for vote in votes)

    abstains = [vote for vote in votes if vote.abstained]
    assert len(abstains) == 3
    assert {(vote.family_id, vote.relation_id) for vote in abstains} == {
        (ABSTAIN_JUDGE, live_relation_id(CARD_E))
    }
    # The repair path was taken twice per abstained vote: malformed, then
    # the retry instruction, then malformed again.
    assert all(vote.parse_retries == 1 for vote in abstains)
    assert all(vote.initial_raw_completion is not None for vote in abstains)

    coincident = [vote for vote in votes if vote.verdict == "coincident"]
    coincident_live = [vote for vote in coincident if vote.relation_id == live_relation_id(CARD_C)]
    assert len(coincident_live) == 3
    assert all(vote.family_id == COINCIDENT_JUDGE for vote in coincident_live)


def test_completed_run_reinvocation_makes_zero_transport_calls(
    workspace: GridWorkspace,
) -> None:
    transport = MappingTransport()
    paths = run_grid(
        cards_dir=workspace.cards_dir,
        out_dir=workspace.run_dir,
        loaded_config=workspace.loaded,
        pilot_dir=workspace.pilot_dir,
        transport=transport,
    )
    assert transport.calls == 0
    assert paths.manifest_json.is_file()


def test_second_run_imports_every_baseline_vote_from_the_first(
    workspace: GridWorkspace,
    tmp_path: Path,
) -> None:
    transport = MappingTransport()
    paths = run_grid(
        cards_dir=workspace.cards_dir,
        out_dir=tmp_path / "run2",
        loaded_config=workspace.loaded,
        pilot_dir=workspace.run_dir,
        transport=transport,
    )
    # Zero fresh baseline calls: only refinement votes (plus the abstaining
    # family's two repair calls) touch the transport.
    assert transport.calls == EXPECTED_IMPORT_RUN_CALLS

    imported = _read_votes(paths.imported_votes_jsonl)
    assert len(imported) == EXPECTED_BASELINE_VOTES
    assert all(vote.repeat_index == 0 for vote in imported)
    fresh = _read_votes(paths.votes_jsonl)
    assert len(fresh) == EXPECTED_REFINEMENT_VOTES
    assert {vote.repeat_index for vote in fresh} == {1, 2}

    manifest = _manifest(tmp_path / "run2")
    assert manifest.total_votes == EXPECTED_TOTAL_VOTES
    for row in manifest.family_counts:
        assert row.imported_votes == POOL_SIZE
        assert row.fresh_baseline_votes == 0
        assert row.refinement_votes == _REFINEMENT_VOTES_PER_FAMILY


# --- Family stream guards -----------------------------------------------------------


def test_first_vote_check_pages_only_on_roster_shaped_failures(tmp_path: Path) -> None:
    """An auth failure on an unproven stream's opener pages; weather retries.

    The PRD's "a 429 or auth failure on vote 1 is a roster problem" is
    deliberately narrowed on the 429 side: production showed embedded 429s
    are provider weather, and the retry machinery already prices them.
    """
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path)
    out_dir = tmp_path / "run"
    with pytest.raises(RuntimeError) as raised:
        run_grid(
            cards_dir=cards_dir,
            out_dir=out_dir,
            loaded_config=loaded,
            pilot_dir=pilot_dir,
            transport=MappingTransport(fail_after=0, fail_status=401),
        )
    guard = _guard_cause(raised.value)
    assert "first-vote check" in str(guard)
    assert "roster-shaped" in str(guard)
    assert _read_votes(out_dir / "votes.jsonl") == []

    recovered = run_grid(
        cards_dir=cards_dir,
        out_dir=out_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=MappingTransport(),
    )
    assert len(_read_votes(recovered.votes_jsonl)) == EXPECTED_TOTAL_VOTES


def test_transient_429_on_an_unproven_opener_retries_instead_of_paging(
    tmp_path: Path,
) -> None:
    """Provider weather on the very first call takes the retry path.

    Regression for the production halts: Azure served embedded 429/502
    envelopes on opening calls and the guard paged instead of deferring to
    backoff and Retry-After.
    """
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path)
    transport = MappingTransport(fail_after=0, fail_count=2, fail_status=429)
    completed = run_grid(
        cards_dir=cards_dir,
        out_dir=tmp_path / "run",
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=transport,
    )
    assert len(_read_votes(completed.votes_jsonl)) == EXPECTED_TOTAL_VOTES


def test_established_family_retries_a_transient_failure_on_resume(tmp_path: Path) -> None:
    """The first-vote check is scoped to the stream, not the session.

    Regression for the production halt: a family whose accepted work was
    already journaled hit provider weather on a resumed session's opening
    call and the guard paged instead of letting the retry path run. Route
    proof is read from accepted attempts (completion order), not committed
    votes (plan order), so accepted-but-uncommitted work counts.
    """
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path)
    out_dir = tmp_path / "run"
    # Session 1: every family banks durable accepted work, then a persistent
    # transport fault stops the run resumably.
    with pytest.raises(RuntimeError, match="remain failed after re-passes"):
        run_grid(
            cards_dir=cards_dir,
            out_dir=out_dir,
            loaded_config=loaded,
            pilot_dir=pilot_dir,
            transport=MappingTransport(fail_after=len(JUDGE_MODELS) * 2),
        )
    committed = _read_votes(out_dir / "votes.jsonl")
    assert committed

    # Session 2: the opening call fails with a bounded transport blip. Every
    # family already proved its route, so the guard must not page; the
    # executor's retry machinery clears the blip and the run completes.
    recovered = run_grid(
        cards_dir=cards_dir,
        out_dir=out_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=MappingTransport(fail_after=0, fail_count=1),
    )
    assert len(_read_votes(recovered.votes_jsonl)) == EXPECTED_TOTAL_VOTES


def test_cache_assertion_fires_from_the_configured_call(tmp_path: Path) -> None:
    config = grid_config(guards=GuardConfig(cache_check_vote=2))
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path, config)
    out_dir = tmp_path / "run"
    with pytest.raises(RuntimeError) as raised:
        run_grid(
            cards_dir=cards_dir,
            out_dir=out_dir,
            loaded_config=loaded,
            pilot_dir=pilot_dir,
            transport=MappingTransport(cached_tokens=0),
        )
    assert "cache assertion" in str(_guard_cause(raised.value))
    # Each family's opening vote is exempt and stays durable.
    assert len(_read_votes(out_dir / "votes.jsonl")) == len(JUDGE_MODELS)


def test_guard_breach_journals_the_billed_completion(tmp_path: Path) -> None:
    """The provider bills the completion the guard inspected; never discard it."""
    config = grid_config(guards=GuardConfig(cache_check_vote=2))
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path, config)
    out_dir = tmp_path / "run"
    with pytest.raises(RuntimeError):
        run_grid(
            cards_dir=cards_dir,
            out_dir=out_dir,
            loaded_config=loaded,
            pilot_dir=pilot_dir,
            transport=MappingTransport(cached_tokens=0),
        )
    attempts = load_jsonl(out_dir / "attempts.jsonl", PhysicalAttemptRow)
    breached = [
        attempt
        for attempt in attempts
        if attempt.failure is not None and attempt.failure.exception_type.endswith("GridGuardError")
    ]
    assert breached
    for attempt in breached:
        assert attempt.result is not None
        assert attempt.result.usage is not None
        assert attempt.result.usage.cost == pytest.approx(0.01)


def test_single_cache_miss_among_hits_does_not_halt(tmp_path: Path) -> None:
    """Best-effort caches (Azure) miss single calls; only a never-warm stream halts.

    Regression for the production halt: Sol served warm completions with one
    interleaved miss and the per-call form of the assertion killed the run.
    The PRD's guard is cumulative: cached tokens must be rising by the check
    depth, not present on every individual call.
    """
    config = grid_config(guards=GuardConfig(cache_check_vote=2))
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path, config)
    completed = run_grid(
        cards_dir=cards_dir,
        out_dir=tmp_path / "run",
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        # Misses sprinkled beyond each stream's first call: cumulative cache
        # evidence exists by the check depth, so no guard may fire.
        transport=MappingTransport(cache_miss_calls=frozenset({7, 12, 23})),
    )
    assert len(_read_votes(completed.votes_jsonl)) == EXPECTED_TOTAL_VOTES


def test_cost_tripwire_fires_against_the_pilot_measured_cost(tmp_path: Path) -> None:
    config = grid_config(
        guards=GuardConfig(cost_window=2, cost_multiplier=1.5),
        pilot_cost_per_vote_usd=0.001,
    )
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path, config)
    with pytest.raises(RuntimeError) as raised:
        run_grid(
            cards_dir=cards_dir,
            out_dir=tmp_path / "run",
            loaded_config=loaded,
            pilot_dir=pilot_dir,
            transport=MappingTransport(),
        )
    guard = _guard_cause(raised.value)
    assert "cost tripwire" in str(guard)
    assert "1.5x" in str(guard)


# --- Resume and idempotence ---------------------------------------------------------


def test_interrupted_run_resumes_the_journal_prefix_without_rebuying(
    tmp_path: Path,
) -> None:
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path)
    baseline_dir = tmp_path / "baseline"
    run_grid(
        cards_dir=cards_dir,
        out_dir=baseline_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=MappingTransport(),
    )
    baseline_votes = _read_votes(baseline_dir / "votes.jsonl")

    out_dir = tmp_path / "interrupted"
    with pytest.raises(RuntimeError, match="remain failed after re-passes"):
        run_grid(
            cards_dir=cards_dir,
            out_dir=out_dir,
            loaded_config=loaded,
            pilot_dir=pilot_dir,
            transport=MappingTransport(fail_after=12),
        )
    partial = (out_dir / "votes.jsonl").read_bytes()
    assert 0 < partial.count(b"\n") < EXPECTED_TOTAL_VOTES

    paths = run_grid(
        cards_dir=cards_dir,
        out_dir=out_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=MappingTransport(),
    )
    assert paths.votes_jsonl.read_bytes().startswith(partial)

    votes = _read_votes(paths.votes_jsonl)
    assert len(votes) == EXPECTED_TOTAL_VOTES
    assert len({vote.vote_id for vote in votes}) == EXPECTED_TOTAL_VOTES

    failed_vote_ids = {
        attempt.vote_id
        for attempt in _read_attempts(paths.attempts_jsonl)
        if attempt.failure is not None
    }
    assert failed_vote_ids
    votes_by_id = {vote.vote_id: vote for vote in votes}
    # A vote whose journal carries a failed attempt has unverifiable billing:
    # its cost evidence legitimately differs from the uninterrupted run.
    assert all(not votes_by_id[vote_id].cost_complete for vote_id in failed_vote_ids)
    assert [_stable(vote, drop_cost=vote.vote_id in failed_vote_ids) for vote in votes] == [
        _stable(vote, drop_cost=vote.vote_id in failed_vote_ids) for vote in baseline_votes
    ]


_RUNNER_SOURCE = '''"""Run one grid session with the deterministic mapping transport."""

import sys
from datetime import timedelta
from pathlib import Path

from atlas_tools.relation.eval.run import load_run_config, run_grid
from tests.relation.grid_fixtures import MappingTransport

cards, config, pilot, out = sys.argv[1:5]
run_grid(
    cards_dir=Path(cards),
    out_dir=Path(out),
    loaded_config=load_run_config(Path(config)),
    pilot_dir=Path(pilot),
    transport=MappingTransport(call_delay=timedelta(milliseconds=50)),
)
'''


def _spawn_and_sigkill(args: list[str], votes_path: Path) -> bool:
    """Start the runner and SIGKILL it once a few votes are durable."""
    environment = dict(os.environ) | {"PYTHONPATH": str(PACKAGE_ROOT)}
    process = subprocess.Popen(
        args,
        cwd=PACKAGE_ROOT,
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + 120.0
    killed = False
    try:
        while time.monotonic() < deadline:
            if process.poll() is not None:
                break
            if votes_path.exists() and votes_path.read_bytes().count(b"\n") >= 3:
                os.kill(process.pid, signal.SIGKILL)
                process.wait(timeout=30)
                killed = process.returncode == -signal.SIGKILL
                break
            time.sleep(0.005)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=30)
    return killed


def test_kill9_and_resume_matches_uninterrupted_run(tmp_path: Path) -> None:
    """SIGKILL the grid mid-run; resume must replay to the identical journal.

    A kill can land between a durable in-flight marker and its journaled
    outcome; that billing state is unknown by design and blocks automatic
    retry. The mocked judge bills nothing, so the test performs the operator
    reconciliation step (clearing the orphaned markers) before resuming.
    """
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path)
    out_dir = tmp_path / "killed"
    script = tmp_path / "runner.py"
    script.write_text(_RUNNER_SOURCE, encoding="utf-8")
    args = [
        sys.executable,
        str(script),
        str(cards_dir),
        str(loaded.path),
        str(pilot_dir),
        str(out_dir),
    ]
    killed = _spawn_and_sigkill(args, out_dir / "votes.jsonl")
    assert killed, "could not SIGKILL the grid mid-run"

    interrupted = (out_dir / "votes.jsonl").read_bytes()
    assert 0 < interrupted.count(b"\n") < EXPECTED_TOTAL_VOTES
    assert not (out_dir / "manifest.json").exists()

    recorded = {attempt.attempt_id for attempt in _read_attempts(out_dir / "attempts.jsonl")}
    orphaned = [
        marker
        for marker in sorted((out_dir / "inflight").glob("*.json"))
        if marker.stem not in recorded
    ]
    if orphaned:
        # Unknown billing state fails closed until the operator reconciles.
        with pytest.raises(ValueError, match="durably marked in flight"):
            run_grid(
                cards_dir=cards_dir,
                out_dir=out_dir,
                loaded_config=loaded,
                pilot_dir=pilot_dir,
                transport=MappingTransport(),
            )
        for marker in orphaned:
            marker.unlink()

    paths = run_grid(
        cards_dir=cards_dir,
        out_dir=out_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=MappingTransport(),
    )
    assert paths.votes_jsonl.read_bytes().startswith(interrupted)

    baseline_dir = tmp_path / "baseline"
    run_grid(
        cards_dir=cards_dir,
        out_dir=baseline_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=MappingTransport(),
    )
    resumed = _read_votes(paths.votes_jsonl)
    baseline = _read_votes(baseline_dir / "votes.jsonl")
    assert len(resumed) == EXPECTED_TOTAL_VOTES
    assert len({vote.vote_id for vote in resumed}) == EXPECTED_TOTAL_VOTES
    assert all(attempt.failure is None for attempt in _read_attempts(paths.attempts_jsonl))
    assert [_stable(vote) for vote in resumed] == [_stable(vote) for vote in baseline]


# --- Deliverables and gates ---------------------------------------------------------


def test_grid_deliverables_pass_every_gate_on_the_clean_deck(tmp_path: Path) -> None:
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path)
    run_dir = tmp_path / "run"
    run_grid(
        cards_dir=cards_dir,
        out_dir=run_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=MappingTransport(script=gates_clean_answer),
    )
    pack_hash = prepare_grid_review_inputs(cards_dir, loaded).pack_hash
    decisions_path = write_decisions(
        tmp_path / "decisions.json",
        analysis_decisions(cards_dir, pack_hash=pack_hash),
    )
    result = write_grid_deliverables(
        run_dir=run_dir,
        cards_dir=cards_dir,
        loaded_config=loaded,
        decisions_path=decisions_path,
        out_dir=tmp_path / "deliverables",
    )

    assert result.gates.all_passed
    assert [gate.gate for gate in result.gates.gates] == [
        "coverage",
        "routing",
        "holdout-drift",
        "abstention",
        "cost-envelope",
    ]
    assert all(entry.correct == len(HOLDOUT) for entry in result.gates.holdout_drift)
    assert all(entry.abstentions == 0 for entry in result.gates.abstention)

    posteriors = {row.relation_id: row for row in result.posteriors}
    assert len(posteriors) == POOL_SIZE
    card_a = posteriors[live_relation_id(CARD_A)]
    assert card_a.counts == {"coincident": 0, "proximal": 5, "overlay": 0, "unclear": 0}
    assert card_a.n_votes == 5
    assert card_a.probabilities == pytest.approx(
        {"coincident": 1 / 9, "proximal": 6 / 9, "overlay": 1 / 9, "unclear": 1 / 9}
    )
    card_c = posteriors[live_relation_id(CARD_C)]
    assert card_c.counts == {"coincident": 3, "proximal": 12, "overlay": 0, "unclear": 0}
    assert card_c.n_votes == 15
    assert card_c.probabilities == pytest.approx(
        {"coincident": 4 / 19, "proximal": 13 / 19, "overlay": 1 / 19, "unclear": 1 / 19}
    )

    # Top posterior-entropy decile: max(1, int(11 * 0.1)) == 1 card, and the
    # 3-2 split card carries the most ambiguity.
    assert [seed.relation_id for seed in result.nominations] == [live_relation_id(CARD_D)]
    assert result.nominations[0].n_votes == 15

    [queue_row] = result.coincident
    assert queue_row.relation_id == live_relation_id(CARD_C)
    assert queue_row.coincident_families == [COINCIDENT_JUDGE]
    assert len(queue_row.votes) == 15
    assert queue_row.verdict_counts == {
        "coincident": 3,
        "proximal": 12,
        "overlay": 0,
        "unclear": 0,
    }

    [dissent_row] = result.dissent
    assert dissent_row.family_id == DISSENT_FAMILY
    assert dissent_row.relation_id == DISSENT_RELATION
    assert dissent_row.missed_bundles == list(DISSENT_BUNDLES)
    assert dissent_row.bundle_count == DISSENT_BUNDLE_COUNT

    assert result.gates_json.is_file()
    report = result.report_md.read_text(encoding="utf-8")
    assert "Dissent ledger: 1 rows" in report
    assert "HALT" not in report


def test_holdout_drift_gate_halts_on_a_drifted_family(tmp_path: Path) -> None:
    cards_dir, loaded, pilot_dir = _grid_setup(tmp_path)
    run_dir = tmp_path / "run"
    run_grid(
        cards_dir=cards_dir,
        out_dir=run_dir,
        loaded_config=loaded,
        pilot_dir=pilot_dir,
        transport=MappingTransport(script=drifted_answer),
    )
    pack_hash = prepare_grid_review_inputs(cards_dir, loaded).pack_hash
    decisions_path = write_decisions(
        tmp_path / "decisions.json",
        analysis_decisions(cards_dir, pack_hash=pack_hash),
    )
    result = write_grid_deliverables(
        run_dir=run_dir,
        cards_dir=cards_dir,
        loaded_config=loaded,
        decisions_path=decisions_path,
        out_dir=tmp_path / "deliverables",
    )

    assert not result.gates.all_passed
    failed = [gate.gate for gate in result.gates.gates if not gate.passed]
    assert failed == ["holdout-drift"]
    drift = {entry.family_id: entry for entry in result.gates.holdout_drift}
    assert drift[DRIFTED_JUDGE].correct == len(HOLDOUT) - 2
    assert not drift[DRIFTED_JUDGE].passed
    assert all(entry.passed for family, entry in drift.items() if family != DRIFTED_JUDGE)
    assert "HALT: investigate the pinned route" in result.report_md.read_text(encoding="utf-8")
