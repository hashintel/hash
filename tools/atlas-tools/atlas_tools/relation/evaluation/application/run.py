"""Compose verified inputs, durable execution, and final publication.

One async entry point owns the run lock and provider lifetime. A credential is
loaded only when validated journals prove that paid work remains. Completed
runs therefore revalidate and return without constructing a network client.
"""

from collections.abc import AsyncGenerator, Callable, Iterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from functools import partial
from itertools import islice
from pathlib import Path
from typing import Literal, assert_never

import trio

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.evaluation.analysis.grid_finalization import analyze_grid
from atlas_tools.relation.evaluation.application._lifetime import close_owned_transport
from atlas_tools.relation.evaluation.application.grid_plan import (
    derive_grid_plan,
    split_grid_votes,
)
from atlas_tools.relation.evaluation.application.identity import request_contract_hash
from atlas_tools.relation.evaluation.application.manifest import (
    build_grid_manifest,
    build_grid_state,
    build_pilot_manifest,
    build_pilot_state,
)
from atlas_tools.relation.evaluation.application.preparation import (
    PreparedGrid,
    PreparedPilot,
    prepare_evaluation_inputs_async,
)
from atlas_tools.relation.evaluation.application.prompt import RubricVotePrompt
from atlas_tools.relation.evaluation.application.settings import OpenRouterSettings
from atlas_tools.relation.evaluation.application.source import (
    hash_paths,
    verify_deck_sources,
)
from atlas_tools.relation.evaluation.domain.api import (
    BaseRunConfig,
    GridRunState,
    HistoricalRequestEvidence,
    JudgeFamilyId,
    PhysicalAttempt,
    PilotRunState,
    Sha256Hex,
    Vote,
    VotePlan,
    VoteTask,
)
from atlas_tools.relation.evaluation.execution.api import (
    GridGuardPolicy,
    LogicalVoteRunner,
    build_resume_index,
    execute_votes,
    executor_policy_payload,
    grid_guard_family_seeds,
    reconstruct_vote_or_required_stage,
)
from atlas_tools.relation.evaluation.modes.api import GridPlan
from atlas_tools.relation.evaluation.storage.api import (
    GridPaths,
    JournalSnapshot,
    PilotPaths,
    ResumeIndex,
    RunJournal,
    exclusive_run,
    load_json_async,
    prepare_grid_async,
    prepare_pilot_async,
    write_grid_manifest_async,
    write_pilot_manifest_async,
)
from atlas_tools.relation.evaluation.transport.api import (
    AsyncCompletionTransport,
    OpenRouterTransport,
    TransportVersions,
    request_policy_payload,
    transport_versions,
)

type EvaluationPaths = PilotPaths | GridPaths
type _GridPhaseName = Literal[
    "evaluating grid baseline",
    "evaluating grid refinement",
    "evaluating grid holdout canaries",
]


def _advance_progress(progress: ProgressReporter) -> Callable[[Vote], None]:
    def advance(_vote: Vote) -> None:
        progress.advance()

    return advance


def _request_contract(config: BaseRunConfig, versions: TransportVersions) -> Sha256Hex:
    return request_contract_hash(
        config,
        executor_policy=executor_policy_payload(),
        request_policy=request_policy_payload(),
        openrouter_sdk_version=versions.openrouter_sdk_version,
        openrouter_openapi_version=versions.openrouter_openapi_version,
    )


@asynccontextmanager
async def _transport(
    injected: AsyncCompletionTransport | None,
) -> AsyncGenerator[AsyncCompletionTransport]:
    """Yield a caller-owned transport or own one environment-backed client."""
    if injected is not None:
        yield injected
        return
    settings = OpenRouterSettings()
    owned = OpenRouterTransport(settings.api_key.get_secret_value())
    try:
        yield owned
    finally:
        await close_owned_transport(owned)


async def _is_file(path: Path) -> bool:
    return await trio.to_thread.run_sync(path.is_file, abandon_on_cancel=False)


async def _pilot_run_state(path: Path) -> PilotRunState | None:
    if not await _is_file(path):
        return None
    return await load_json_async(path, PilotRunState)


async def _grid_run_state(path: Path) -> GridRunState | None:
    if not await _is_file(path):
        return None
    return await load_json_async(path, GridRunState)


def _pinned_transport_versions(state: PilotRunState | GridRunState) -> TransportVersions:
    return TransportVersions(
        openrouter_sdk_version=state.openrouter_sdk_version,
        openrouter_openapi_version=state.openrouter_openapi_version,
    )


def _verify_transport_versions(expected: TransportVersions) -> None:
    observed = transport_versions()
    if observed != expected:
        raise ValueError(
            "installed OpenRouter transport versions differ from the durable run state"
        )


def _remaining(plan: VotePlan, start_index: int) -> Iterator[VoteTask]:
    return islice(plan.tasks(), start_index, None)


def _plan_range(plan: VotePlan, start_index: int, stop_index: int) -> Iterator[VoteTask]:
    return islice(plan.tasks(), start_index, stop_index)


async def _recover_accepted_prefix(
    plan: VotePlan,
    resume: ResumeIndex,
    *,
    stop_index: int,
    prompt: RubricVotePrompt,
    journal: RunJournal,
    after_commit: Callable[[Vote], None],
) -> int:
    """Commit the maximal contiguous prefix requiring no provider response."""
    if not resume.next_plan_index <= stop_index <= plan.expected_votes:
        raise ValueError(
            f"recovery range [{resume.next_plan_index}, {stop_index}) exceeds the plan"
        )

    cursor = resume.next_plan_index
    for task in _plan_range(plan, cursor, stop_index):
        decision = reconstruct_vote_or_required_stage(
            task,
            resume.attempts_by_vote.get(task.vote_id, ()),
            prompt=prompt,
        )
        if isinstance(decision, str):
            break
        await journal.append_vote(decision)
        after_commit(decision)
        cursor += 1
    return cursor


async def _final_snapshot(
    journal: RunJournal,
    plan: VotePlan,
    *,
    prompt: RubricVotePrompt,
    config: BaseRunConfig,
    historical_request_evidence: HistoricalRequestEvidence | None,
) -> tuple[JournalSnapshot, ResumeIndex]:
    snapshot = await journal.snapshot()
    resume = build_resume_index(
        plan,
        votes=snapshot.votes,
        attempts=snapshot.attempts,
        prompt=prompt,
        config=config,
        historical_request_evidence=historical_request_evidence,
    )
    if resume.next_plan_index != plan.expected_votes:
        raise ValueError(
            f"execution committed {resume.next_plan_index} of {plan.expected_votes} votes"
        )
    return snapshot, resume


async def _run_pilot(
    prepared: PreparedPilot,
    *,
    output_directory: Path,
    injected_transport: AsyncCompletionTransport | None,
    progress: ProgressReporter,
) -> PilotPaths:
    paths = PilotPaths.under(output_directory)
    with exclusive_run(paths.journal):
        existing_state = await _pilot_run_state(paths.state)
        versions = (
            transport_versions()
            if existing_state is None
            else _pinned_transport_versions(existing_state)
        )
        contract = _request_contract(prepared.config, versions)
        state = build_pilot_state(
            prepared,
            request_contract_hash=contract,
            openrouter_sdk_version=versions.openrouter_sdk_version,
            openrouter_openapi_version=versions.openrouter_openapi_version,
            historical_request_evidence=(
                None if existing_state is None else existing_state.historical_request_evidence
            ),
        )
        await prepare_pilot_async(
            paths,
            state=state,
            slice_records=prepared.slice_records,
        )
        journal = RunJournal(paths=paths.journal)
        await journal.recover()
        snapshot = await journal.snapshot()
        prompt = RubricVotePrompt(
            pack=prepared.prompt_pack,
            cards=prepared.deck.by_relation_id,
        )
        resume = build_resume_index(
            prepared.plan,
            votes=snapshot.votes,
            attempts=snapshot.attempts,
            prompt=prompt,
            config=prepared.config,
            historical_request_evidence=state.historical_request_evidence,
        )
        manifest_exists = await _is_file(paths.manifest)
        if resume.next_plan_index < prepared.plan.expected_votes:
            if manifest_exists:
                raise ValueError("completed pilot manifest has an incomplete vote journal")
            progress.phase(
                "evaluating pilot",
                total=prepared.plan.expected_votes - resume.next_plan_index,
            )
            recovered_cursor = await _recover_accepted_prefix(
                prepared.plan,
                resume,
                stop_index=prepared.plan.expected_votes,
                prompt=prompt,
                journal=journal,
                after_commit=_advance_progress(progress),
            )
            if recovered_cursor != resume.next_plan_index:
                snapshot = await journal.snapshot()
                resume = build_resume_index(
                    prepared.plan,
                    votes=snapshot.votes,
                    attempts=snapshot.attempts,
                    prompt=prompt,
                    config=prepared.config,
                    historical_request_evidence=state.historical_request_evidence,
                )
            if resume.next_plan_index < prepared.plan.expected_votes:
                _verify_transport_versions(versions)
                async with _transport(injected_transport) as completion:
                    runner = LogicalVoteRunner(
                        config=prepared.config,
                        prompt=prompt,
                        journal=journal,
                        transport=completion,
                        resume=resume,
                    )
                    await execute_votes(
                        _remaining(prepared.plan, resume.next_plan_index),
                        runner=runner,
                        config=prepared.config,
                        journal=journal,
                        start_index=resume.next_plan_index,
                        after_commit=_advance_progress(progress),
                    )
        snapshot, _ = await _final_snapshot(
            journal,
            prepared.plan,
            prompt=prompt,
            config=prepared.config,
            historical_request_evidence=state.historical_request_evidence,
        )
        await verify_deck_sources(prepared)
        artifact_hashes = await hash_paths(
            {
                "attempts.jsonl": paths.journal.attempts,
                "slice.jsonl": paths.slice,
                "votes.jsonl": paths.journal.votes,
            }
        )
        manifest = build_pilot_manifest(
            prepared,
            state=state,
            votes=snapshot.votes,
            artifact_hashes=artifact_hashes,
        )
        await write_pilot_manifest_async(paths.manifest, manifest)
    return paths


def _grid_guard(
    prepared: PreparedGrid,
    *,
    prompt: RubricVotePrompt,
    attempts: tuple[PhysicalAttempt, ...],
) -> GridGuardPolicy:
    pilot_costs: dict[JudgeFamilyId, int | float] = {
        JudgeFamilyId(judge.model): judge.pilot_cost_per_vote_usd
        for judge in prepared.config.judges
    }
    return GridGuardPolicy(
        config=prepared.config.guards,
        retry_policy=prepared.config.transient_retries,
        pilot_cost_per_vote_usd=pilot_costs,
        parse_verdict=prompt.parse,
        family_seeds=grid_guard_family_seeds(
            attempts,
            cost_window=prepared.config.guards.cost_window,
        ),
    )


@dataclass(frozen=True, slots=True, kw_only=True)
class _GridRecovery:
    snapshot: JournalSnapshot
    plan: GridPlan
    resume: ResumeIndex
    started_phases: frozenset[_GridPhaseName]


def _grid_resume(
    prepared: PreparedGrid,
    snapshot: JournalSnapshot,
    *,
    prompt: RubricVotePrompt,
    historical_request_evidence: HistoricalRequestEvidence | None,
) -> tuple[GridPlan, ResumeIndex]:
    plan = derive_grid_plan(prepared, snapshot.votes)
    resume = build_resume_index(
        plan,
        votes=snapshot.votes,
        attempts=snapshot.attempts,
        prompt=prompt,
        config=prepared.config,
        historical_request_evidence=historical_request_evidence,
    )
    return plan, resume


async def _recover_grid_range(
    prepared: PreparedGrid,
    snapshot: JournalSnapshot,
    plan: GridPlan,
    resume: ResumeIndex,
    *,
    stop_index: int,
    prompt: RubricVotePrompt,
    journal: RunJournal,
    progress: ProgressReporter,
    historical_request_evidence: HistoricalRequestEvidence | None,
) -> tuple[JournalSnapshot, ResumeIndex]:
    recovered_cursor = await _recover_accepted_prefix(
        plan,
        resume,
        stop_index=stop_index,
        prompt=prompt,
        journal=journal,
        after_commit=_advance_progress(progress),
    )
    if recovered_cursor == resume.next_plan_index:
        return snapshot, resume
    recovered = await journal.snapshot()
    recovered_resume = build_resume_index(
        plan,
        votes=recovered.votes,
        attempts=recovered.attempts,
        prompt=prompt,
        config=prepared.config,
        historical_request_evidence=historical_request_evidence,
    )
    return recovered, recovered_resume


async def _recover_grid_without_transport(
    prepared: PreparedGrid,
    *,
    journal: RunJournal,
    snapshot: JournalSnapshot,
    plan: GridPlan,
    resume: ResumeIndex,
    prompt: RubricVotePrompt,
    progress: ProgressReporter,
    historical_request_evidence: HistoricalRequestEvidence | None,
) -> _GridRecovery:
    started: set[_GridPhaseName] = set()
    if resume.next_plan_index < prepared.phase_a.expected_votes:
        phase: _GridPhaseName = "evaluating grid baseline"
        started.add(phase)
        progress.phase(phase, total=prepared.phase_a.expected_votes - resume.next_plan_index)
        snapshot, resume = await _recover_grid_range(
            prepared,
            snapshot,
            plan,
            resume,
            stop_index=prepared.phase_a.expected_votes,
            prompt=prompt,
            journal=journal,
            progress=progress,
            historical_request_evidence=historical_request_evidence,
        )
        if resume.next_plan_index < prepared.phase_a.expected_votes:
            return _GridRecovery(
                snapshot=snapshot,
                plan=plan,
                resume=resume,
                started_phases=frozenset(started),
            )
        plan, resume = _grid_resume(
            prepared,
            snapshot,
            prompt=prompt,
            historical_request_evidence=historical_request_evidence,
        )

    if resume.next_plan_index < plan.analysis_votes:
        phase = "evaluating grid refinement"
        started.add(phase)
        progress.phase(phase, total=plan.analysis_votes - resume.next_plan_index)
        snapshot, resume = await _recover_grid_range(
            prepared,
            snapshot,
            plan,
            resume,
            stop_index=plan.analysis_votes,
            prompt=prompt,
            journal=journal,
            progress=progress,
            historical_request_evidence=historical_request_evidence,
        )
    if (
        resume.next_plan_index >= plan.analysis_votes
        and resume.next_plan_index < plan.expected_votes
    ):
        phase = "evaluating grid holdout canaries"
        started.add(phase)
        progress.phase(phase, total=plan.expected_votes - resume.next_plan_index)
        snapshot, resume = await _recover_grid_range(
            prepared,
            snapshot,
            plan,
            resume,
            stop_index=plan.expected_votes,
            prompt=prompt,
            journal=journal,
            progress=progress,
            historical_request_evidence=historical_request_evidence,
        )
    return _GridRecovery(
        snapshot=snapshot,
        plan=plan,
        resume=resume,
        started_phases=frozenset(started),
    )


def _start_grid_phase(
    progress: ProgressReporter,
    started: frozenset[_GridPhaseName],
    phase: _GridPhaseName,
    *,
    total: int,
) -> None:
    if phase not in started:
        progress.phase(phase, total=total)


async def _execute_grid_online(
    prepared: PreparedGrid,
    recovery: _GridRecovery,
    *,
    journal: RunJournal,
    injected_transport: AsyncCompletionTransport | None,
    prompt: RubricVotePrompt,
    progress: ProgressReporter,
    historical_request_evidence: HistoricalRequestEvidence | None,
) -> tuple[JournalSnapshot, GridPlan]:
    snapshot = recovery.snapshot
    resume = recovery.resume
    after_commit = _advance_progress(progress)
    async with _transport(injected_transport) as completion:
        runner = LogicalVoteRunner(
            config=prepared.config,
            prompt=prompt,
            journal=journal,
            transport=completion,
            guard=_grid_guard(prepared, prompt=prompt, attempts=snapshot.attempts),
            resume=resume,
        )
        if resume.next_plan_index < prepared.phase_a.expected_votes:
            phase: _GridPhaseName = "evaluating grid baseline"
            _start_grid_phase(
                progress,
                recovery.started_phases,
                phase,
                total=prepared.phase_a.expected_votes - resume.next_plan_index,
            )
            await execute_votes(
                _remaining(prepared.phase_a, resume.next_plan_index),
                runner=runner,
                config=prepared.config,
                journal=journal,
                start_index=resume.next_plan_index,
                after_commit=after_commit,
            )
            snapshot = await journal.snapshot()

        plan, resume = _grid_resume(
            prepared,
            snapshot,
            prompt=prompt,
            historical_request_evidence=historical_request_evidence,
        )
        if resume.next_plan_index < plan.analysis_votes:
            phase = "evaluating grid refinement"
            _start_grid_phase(
                progress,
                recovery.started_phases,
                phase,
                total=plan.analysis_votes - resume.next_plan_index,
            )
            await execute_votes(
                _plan_range(plan, resume.next_plan_index, plan.analysis_votes),
                runner=runner,
                config=prepared.config,
                journal=journal,
                start_index=resume.next_plan_index,
                after_commit=after_commit,
            )
            snapshot = await journal.snapshot()
            _, resume = _grid_resume(
                prepared,
                snapshot,
                prompt=prompt,
                historical_request_evidence=historical_request_evidence,
            )
        if resume.next_plan_index < plan.expected_votes:
            phase = "evaluating grid holdout canaries"
            _start_grid_phase(
                progress,
                recovery.started_phases,
                phase,
                total=plan.expected_votes - resume.next_plan_index,
            )
            await execute_votes(
                _remaining(plan, resume.next_plan_index),
                runner=runner,
                config=prepared.config,
                journal=journal,
                start_index=resume.next_plan_index,
                after_commit=after_commit,
            )
    return await journal.snapshot(), plan


async def _execute_grid(
    prepared: PreparedGrid,
    *,
    journal: RunJournal,
    snapshot: JournalSnapshot,
    manifest_exists: bool,
    injected_transport: AsyncCompletionTransport | None,
    progress: ProgressReporter,
    historical_request_evidence: HistoricalRequestEvidence | None,
    expected_transport_versions: TransportVersions,
) -> tuple[JournalSnapshot, GridPlan]:
    prompt = RubricVotePrompt(
        pack=prepared.prompt_pack,
        cards=prepared.deck.by_relation_id,
    )
    plan, resume = _grid_resume(
        prepared,
        snapshot,
        prompt=prompt,
        historical_request_evidence=historical_request_evidence,
    )
    if resume.next_plan_index == plan.expected_votes:
        return snapshot, plan
    if manifest_exists:
        raise ValueError("completed grid manifest has an incomplete vote journal")
    recovery = await _recover_grid_without_transport(
        prepared,
        journal=journal,
        snapshot=snapshot,
        plan=plan,
        resume=resume,
        prompt=prompt,
        progress=progress,
        historical_request_evidence=historical_request_evidence,
    )
    if recovery.resume.next_plan_index == recovery.plan.expected_votes:
        return recovery.snapshot, recovery.plan
    _verify_transport_versions(expected_transport_versions)
    return await _execute_grid_online(
        prepared,
        recovery,
        journal=journal,
        injected_transport=injected_transport,
        prompt=prompt,
        progress=progress,
        historical_request_evidence=historical_request_evidence,
    )


async def _run_grid(
    prepared: PreparedGrid,
    *,
    output_directory: Path,
    injected_transport: AsyncCompletionTransport | None,
    progress: ProgressReporter,
) -> GridPaths:
    paths = GridPaths.under(output_directory)
    with exclusive_run(paths.journal):
        existing_state = await _grid_run_state(paths.state)
        versions = (
            transport_versions()
            if existing_state is None
            else _pinned_transport_versions(existing_state)
        )
        contract = _request_contract(prepared.config, versions)
        state = build_grid_state(
            prepared,
            request_contract_hash=contract,
            openrouter_sdk_version=versions.openrouter_sdk_version,
            openrouter_openapi_version=versions.openrouter_openapi_version,
            historical_request_evidence=(
                None if existing_state is None else existing_state.historical_request_evidence
            ),
        )
        await prepare_grid_async(
            paths,
            state=state,
            corpus=prepared.corpus,
            imported_votes=prepared.pilot_import.votes,
            imported_attempts=prepared.pilot_import.attempts,
        )
        journal = RunJournal(paths=paths.journal)
        await journal.recover()
        snapshot = await journal.snapshot()
        snapshot, plan = await _execute_grid(
            prepared,
            journal=journal,
            snapshot=snapshot,
            manifest_exists=await _is_file(paths.manifest),
            injected_transport=injected_transport,
            progress=progress,
            historical_request_evidence=state.historical_request_evidence,
            expected_transport_versions=versions,
        )
        prompt = RubricVotePrompt(
            pack=prepared.prompt_pack,
            cards=prepared.deck.by_relation_id,
        )
        snapshot, _ = await _final_snapshot(
            journal,
            plan,
            prompt=prompt,
            config=prepared.config,
            historical_request_evidence=state.historical_request_evidence,
        )
        grid_votes, canary_votes = split_grid_votes(plan, snapshot.votes)
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
        manifest = build_grid_manifest(
            prepared,
            state=state,
            analysis=analysis,
            canary_votes=canary_votes,
            artifact_hashes=artifact_hashes,
            executor_policy=executor_policy_payload(),
            request_policy=request_policy_payload(),
        )
        await write_grid_manifest_async(paths.manifest, manifest)
    return paths


async def run_evaluation_async(
    *,
    cards_directory: Path,
    config_path: Path,
    output_directory: Path,
    pilot_directory: Path | None = None,
    transport: AsyncCompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> EvaluationPaths:
    """Validate, resume, and finalize the mode selected by strict config."""
    prepared = await prepare_evaluation_inputs_async(
        config_path,
        cards_directory,
        pilot_directory=pilot_directory,
    )
    match prepared:
        case PreparedPilot():
            return await _run_pilot(
                prepared,
                output_directory=output_directory,
                injected_transport=transport,
                progress=progress,
            )
        case PreparedGrid():
            return await _run_grid(
                prepared,
                output_directory=output_directory,
                injected_transport=transport,
                progress=progress,
            )
        case unexpected:
            assert_never(unexpected)


def run_evaluation(
    *,
    cards_directory: Path,
    config_path: Path,
    output_directory: Path,
    pilot_directory: Path | None = None,
    transport: AsyncCompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> EvaluationPaths:
    """Run the async application from a synchronous process boundary."""
    run = partial(
        run_evaluation_async,
        cards_directory=cards_directory,
        config_path=config_path,
        output_directory=output_directory,
        pilot_directory=pilot_directory,
        transport=transport,
        progress=progress,
    )
    return trio.run(run)
