"""Load a completed grid once and prove every downstream input relation.

The loader rebuilds run state, the dynamic vote plan, analysis, and manifest
from strict source files. Downstream stages receive one immutable snapshot and
cannot accidentally apply weaker validation than the evaluator itself.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.analysis.api import GridAnalysis, analyze_grid
from atlas_tools.relation.evaluation.application.grid_plan import (
    derive_grid_plan,
    split_grid_votes,
)
from atlas_tools.relation.evaluation.application.identity import request_contract_hash
from atlas_tools.relation.evaluation.application.manifest import (
    build_grid_manifest,
    build_grid_state,
)
from atlas_tools.relation.evaluation.application.preparation import (
    PreparedGrid,
    _complete_grid,
    _prepare_grid_base,
)
from atlas_tools.relation.evaluation.application.prompt import RubricVotePrompt
from atlas_tools.relation.evaluation.application.source import (
    hash_paths,
    verify_deck_sources,
)
from atlas_tools.relation.evaluation.domain.api import (
    CorpusRecord,
    GridManifest,
    GridRunState,
    PhysicalAttempt,
    Vote,
)
from atlas_tools.relation.evaluation.execution.api import build_resume_index
from atlas_tools.relation.evaluation.modes.api import GridPlan
from atlas_tools.relation.evaluation.storage.api import (
    GridPaths,
    JournalSnapshot,
    LoadedConfig,
    PilotImport,
    RunJournal,
    VerifiedDeck,
    exclusive_run,
    load_config_async,
    load_deck_async,
    load_json_async,
    load_jsonl_async,
)
from atlas_tools.relation.evaluation.transport.api import matches_pinned_route


@dataclass(frozen=True, slots=True, kw_only=True)
class CompletedGrid:
    """Carry one fully reconciled, hash-bound production-grid snapshot."""

    prepared: PreparedGrid
    paths: GridPaths
    state: GridRunState
    manifest: GridManifest
    journal: JournalSnapshot
    plan: GridPlan
    analysis: GridAnalysis
    canary_votes: tuple[Vote, ...]
    routing_violations: int


@dataclass(frozen=True, slots=True, kw_only=True)
class _LoadedGridFiles:
    config: LoadedConfig
    deck: VerifiedDeck
    state: GridRunState
    manifest: GridManifest
    corpus: tuple[CorpusRecord, ...]
    imported_votes: tuple[Vote, ...]
    imported_attempts: tuple[PhysicalAttempt, ...]
    journal: JournalSnapshot
    inflight_markers: tuple[str, ...]


@dataclass(slots=True)
class _ResultSlot[ValueT]:
    values: list[ValueT] = field(default_factory=list)

    async def collect(self, operation: Callable[[], Awaitable[ValueT]]) -> None:
        self.values.append(await operation())

    def one(self) -> ValueT:
        if len(self.values) != 1:
            raise AssertionError("parallel loader did not return exactly once")
        return self.values[0]


def _inflight_markers(path: Path) -> tuple[str, ...]:
    if not path.is_dir():
        raise ValueError(f"completed grid lacks its in-flight directory: {path}")
    return tuple(item.name for item in sorted(path.glob("*.json")))


async def _load_inflight_markers(path: Path) -> tuple[str, ...]:
    return await trio.to_thread.run_sync(
        _inflight_markers,
        path,
        abandon_on_cancel=False,
    )


async def _load_files(
    paths: GridPaths,
    *,
    config_path: Path,
    cards_directory: Path,
) -> _LoadedGridFiles:
    config = _ResultSlot[LoadedConfig]()
    deck = _ResultSlot[VerifiedDeck]()
    state = _ResultSlot[GridRunState]()
    manifest = _ResultSlot[GridManifest]()
    corpus = _ResultSlot[tuple[CorpusRecord, ...]]()
    imported_votes = _ResultSlot[tuple[Vote, ...]]()
    imported_attempts = _ResultSlot[tuple[PhysicalAttempt, ...]]()
    snapshot = _ResultSlot[JournalSnapshot]()
    markers = _ResultSlot[tuple[str, ...]]()
    journal = RunJournal(paths=paths.journal)

    async with trio.open_nursery() as nursery:
        for slot, operation in (
            (config, partial(load_config_async, config_path)),
            (deck, partial(load_deck_async, cards_directory)),
            (state, partial(load_json_async, paths.state, GridRunState)),
            (manifest, partial(load_json_async, paths.manifest, GridManifest)),
            (corpus, partial(load_jsonl_async, paths.corpus, CorpusRecord)),
            (imported_votes, partial(load_jsonl_async, paths.imported_votes, Vote)),
            (
                imported_attempts,
                partial(load_jsonl_async, paths.imported_attempts, PhysicalAttempt),
            ),
            (snapshot, journal.snapshot),
            (markers, partial(_load_inflight_markers, paths.journal.inflight)),
        ):
            nursery.start_soon(slot.collect, operation)
    return _LoadedGridFiles(
        config=config.one(),
        deck=deck.one(),
        state=state.one(),
        manifest=manifest.one(),
        corpus=corpus.one(),
        imported_votes=imported_votes.one(),
        imported_attempts=imported_attempts.one(),
        journal=snapshot.one(),
        inflight_markers=markers.one(),
    )


def _route_violations(
    prepared: PreparedGrid,
    analysis: GridAnalysis,
    canary_votes: tuple[Vote, ...],
    attempts: tuple[PhysicalAttempt, ...],
) -> int:
    judges = {judge.family_id: judge for judge in prepared.config.judges}
    attempts_by_id = {attempt.attempt_id: attempt for attempt in attempts}
    violations = 0
    votes = (
        *(observed.vote for card in analysis.cards for observed in card.votes()),
        *canary_votes,
    )
    for vote in votes:
        judge = judges.get(vote.family_id)
        if judge is None:
            violations += 1
            continue
        accepted = tuple(attempts_by_id.get(attempt_id) for attempt_id in vote.accepted_attempt_ids)
        pinned = vote.provider == judge.provider_name and vote.model_returned == judge.model
        pinned = pinned and all(
            attempt is not None
            and attempt.result is not None
            and matches_pinned_route(attempt.result, judge)
            for attempt in accepted
        )
        violations += not pinned
    return violations


async def load_completed_grid_async(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
) -> CompletedGrid:
    """Validate and load a completed grid without mutating its artifacts.

    Independent files are read concurrently. The function rejects active or
    unresolved billing markers, incomplete dynamic plans, source drift,
    request-contract drift, and any manifest field not reproducible from the
    durable evidence.

    Raises:
        ValueError: The run is partial, inconsistent, corrupt, or belongs to
            different config or card inputs.

    """
    paths = GridPaths.under(run_directory)
    with exclusive_run(paths.journal):
        loaded = await _load_files(
            paths,
            config_path=config_path,
            cards_directory=cards_directory,
        )
        if loaded.inflight_markers:
            raise ValueError(
                f"completed grid retains in-flight markers: {loaded.inflight_markers[:5]}"
            )

        base = _prepare_grid_base(loaded.config, loaded.deck)
        pilot_import = PilotImport(
            config=loaded.manifest.pilot_config,
            manifest_hash=loaded.manifest.source_hashes["pilot-manifest.json"],
            votes_hash=loaded.manifest.source_hashes["pilot-votes.jsonl"],
            attempts_hash=loaded.manifest.source_hashes["pilot-attempts.jsonl"],
            historical_request_subset=(loaded.manifest.pilot_historical_request_subset),
            votes=loaded.imported_votes,
            attempts=loaded.imported_attempts,
        )
        prepared = _complete_grid(base, pilot_import)
        if loaded.corpus != prepared.corpus:
            raise ValueError("completed corpus differs from the verified deck projection")

        contract = request_contract_hash(
            prepared.config,
            executor_policy=loaded.manifest.executor_policy,
            request_policy=loaded.manifest.request_policy,
            openrouter_sdk_version=loaded.state.openrouter_sdk_version,
            openrouter_openapi_version=loaded.state.openrouter_openapi_version,
        )
        expected_state = build_grid_state(
            prepared,
            request_contract_hash=contract,
            openrouter_sdk_version=loaded.state.openrouter_sdk_version,
            openrouter_openapi_version=loaded.state.openrouter_openapi_version,
            historical_request_evidence=loaded.state.historical_request_evidence,
        )

        if loaded.state != expected_state:
            raise ValueError("grid run state is not reproducible from the requested inputs")

        plan = derive_grid_plan(prepared, loaded.journal.votes)
        prompt = RubricVotePrompt(
            pack=prepared.prompt_pack,
            cards=prepared.deck.by_relation_id,
        )
        resume = build_resume_index(
            plan,
            votes=loaded.journal.votes,
            attempts=loaded.journal.attempts,
            prompt=prompt,
            config=prepared.config,
            historical_request_evidence=loaded.state.historical_request_evidence,
        )
        if resume.next_plan_index != plan.expected_votes:
            raise ValueError(
                f"grid committed {resume.next_plan_index} of {plan.expected_votes} fresh votes"
            )
        grid_votes, canary_votes = split_grid_votes(plan, loaded.journal.votes)
        analysis = analyze_grid(
            cards=prepared.pool,
            family_ids=tuple(judge.family_id for judge in prepared.config.judges),
            imported_votes=prepared.pilot_import.votes,
            fresh_votes=grid_votes,
        )
        await verify_deck_sources(prepared)
        artifact_hashes = await hash_paths(
            {
                "attempts.jsonl": paths.journal.attempts,
                "corpus.jsonl": paths.corpus,
                "imported-attempts.jsonl": paths.imported_attempts,
                "imported-votes.jsonl": paths.imported_votes,
                "votes.jsonl": paths.journal.votes,
            }
        )
        expected_manifest = build_grid_manifest(
            prepared,
            state=loaded.state,
            analysis=analysis,
            canary_votes=canary_votes,
            artifact_hashes=artifact_hashes,
            executor_policy=loaded.manifest.executor_policy,
            request_policy=loaded.manifest.request_policy,
        )
        if loaded.manifest != expected_manifest:
            raise ValueError("grid manifest is not reproducible from its durable evidence")
        return CompletedGrid(
            prepared=prepared,
            paths=paths,
            state=loaded.state,
            manifest=loaded.manifest,
            journal=loaded.journal,
            plan=plan,
            analysis=analysis,
            canary_votes=canary_votes,
            routing_violations=_route_violations(
                prepared,
                analysis,
                canary_votes,
                (*loaded.imported_attempts, *loaded.journal.attempts),
            ),
        )


def load_completed_grid(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
) -> CompletedGrid:
    """Run completed-grid validation from a synchronous process boundary."""
    load = partial(
        load_completed_grid_async,
        run_directory=run_directory,
        cards_directory=cards_directory,
        config_path=config_path,
    )
    return trio.run(load)
