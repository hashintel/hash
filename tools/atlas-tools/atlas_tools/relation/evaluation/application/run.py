"""Compose verified inputs, durable execution, and final publication.

One async entry point owns the run lock and provider lifetime. A credential is
loaded only when validated journals prove that paid work remains. Completed
runs therefore revalidate and return without constructing a network client.
"""

from collections import deque
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import asynccontextmanager
from functools import partial
from itertools import islice
from pathlib import Path
from typing import assert_never

import trio

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.evaluation.analysis.api import analyze_grid
from atlas_tools.relation.evaluation.application._lifetime import close_owned_transport
from atlas_tools.relation.evaluation.application.grid_plan import derive_grid_plan
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
    JudgeFamilyId,
    PhysicalAttempt,
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
)
from atlas_tools.relation.evaluation.modes.api import GridPlan
from atlas_tools.relation.evaluation.storage.api import (
    GridPaths,
    JournalSnapshot,
    PilotPaths,
    ResumeIndex,
    RunJournal,
    exclusive_run,
    prepare_grid_async,
    prepare_pilot_async,
    write_grid_manifest_async,
    write_pilot_manifest_async,
)
from atlas_tools.relation.evaluation.transport.api import (
    AsyncCompletionTransport,
    OpenRouterTransport,
    request_policy_payload,
    transport_versions,
)

type EvaluationPaths = PilotPaths | GridPaths


def _advance_progress(progress: ProgressReporter) -> Callable[[Vote], None]:
    def advance(_vote: Vote) -> None:
        progress.advance()

    return advance


def _request_contract(config: BaseRunConfig) -> Sha256Hex:
    versions = transport_versions()
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
) -> AsyncIterator[AsyncCompletionTransport]:
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


def _remaining(plan: VotePlan, start_index: int) -> Iterator[VoteTask]:
    return islice(plan.tasks(), start_index, None)


async def _final_snapshot(
    journal: RunJournal,
    plan: VotePlan,
    *,
    prompt: RubricVotePrompt,
    config: BaseRunConfig,
) -> tuple[JournalSnapshot, ResumeIndex]:
    snapshot = await journal.snapshot()
    resume = build_resume_index(
        plan,
        votes=snapshot.votes,
        attempts=snapshot.attempts,
        prompt=prompt,
        config=config,
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
    versions = transport_versions()
    contract = _request_contract(prepared.config)
    state = build_pilot_state(
        prepared,
        request_contract_hash=contract,
        openrouter_sdk_version=versions.openrouter_sdk_version,
        openrouter_openapi_version=versions.openrouter_openapi_version,
    )
    paths = PilotPaths.under(output_directory)
    with exclusive_run(paths.journal):
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
        )
        manifest_exists = await _is_file(paths.manifest)
        if resume.next_plan_index < prepared.plan.expected_votes:
            if manifest_exists:
                raise ValueError("completed pilot manifest has an incomplete vote journal")
            progress.phase(
                "evaluating pilot",
                total=prepared.plan.expected_votes - resume.next_plan_index,
            )
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
    established: frozenset[JudgeFamilyId] = frozenset(
        JudgeFamilyId(attempt.family_id)
        for attempt in attempts
        if attempt.result is not None and attempt.failure is None
    )
    pilot_costs: dict[JudgeFamilyId, int | float] = {
        JudgeFamilyId(judge.model): judge.pilot_cost_per_vote_usd
        for judge in prepared.config.judges
    }
    return GridGuardPolicy(
        config=prepared.config.guards,
        retry_policy=prepared.config.transient_retries,
        pilot_cost_per_vote_usd=pilot_costs,
        parse_verdict=prompt.parse,
        established_families=established,
        initial_billed_costs_usd=_resume_billed_costs(
            attempts,
            window=prepared.config.guards.cost_window,
        ),
    )


def _resume_billed_costs(
    attempts: tuple[PhysicalAttempt, ...],
    *,
    window: int,
) -> dict[JudgeFamilyId, tuple[float, ...]]:
    histories: dict[JudgeFamilyId, deque[float]] = {}
    for attempt in attempts:
        result = attempt.result
        usage = None if result is None else result.usage
        cost = None if usage is None else usage.cost_usd
        if cost is not None:
            family_id = JudgeFamilyId(attempt.family_id)
            histories.setdefault(family_id, deque(maxlen=window)).append(cost)
    return {family_id: tuple(costs) for family_id, costs in histories.items()}


async def _execute_grid(
    prepared: PreparedGrid,
    *,
    journal: RunJournal,
    snapshot: JournalSnapshot,
    manifest_exists: bool,
    injected_transport: AsyncCompletionTransport | None,
    progress: ProgressReporter,
) -> tuple[JournalSnapshot, GridPlan]:
    prompt = RubricVotePrompt(
        pack=prepared.prompt_pack,
        cards=prepared.deck.by_relation_id,
    )
    current_plan = derive_grid_plan(prepared, snapshot.votes)
    current_resume = build_resume_index(
        current_plan,
        votes=snapshot.votes,
        attempts=snapshot.attempts,
        prompt=prompt,
        config=prepared.config,
    )
    phase_a_incomplete = len(snapshot.votes) < prepared.phase_a.expected_votes
    current_incomplete = current_resume.next_plan_index < current_plan.expected_votes
    if not phase_a_incomplete and not current_incomplete:
        return snapshot, current_plan
    if manifest_exists:
        raise ValueError("completed grid manifest has an incomplete vote journal")

    async with _transport(injected_transport) as completion:
        runner = LogicalVoteRunner(
            config=prepared.config,
            prompt=prompt,
            journal=journal,
            transport=completion,
            guard=_grid_guard(prepared, prompt=prompt, attempts=snapshot.attempts),
            resume=current_resume,
        )
        if phase_a_incomplete:
            progress.phase(
                "evaluating grid baseline",
                total=prepared.phase_a.expected_votes - current_resume.next_plan_index,
            )
            await execute_votes(
                _remaining(prepared.phase_a, current_resume.next_plan_index),
                runner=runner,
                config=prepared.config,
                journal=journal,
                start_index=current_resume.next_plan_index,
                after_commit=_advance_progress(progress),
            )
            snapshot = await journal.snapshot()

        complete_plan = derive_grid_plan(prepared, snapshot.votes)
        complete_resume = build_resume_index(
            complete_plan,
            votes=snapshot.votes,
            attempts=snapshot.attempts,
            prompt=prompt,
            config=prepared.config,
        )
        if complete_resume.next_plan_index < complete_plan.expected_votes:
            progress.phase(
                "evaluating grid refinement",
                total=complete_plan.expected_votes - complete_resume.next_plan_index,
            )
            await execute_votes(
                _remaining(complete_plan, complete_resume.next_plan_index),
                runner=runner,
                config=prepared.config,
                journal=journal,
                start_index=complete_resume.next_plan_index,
                after_commit=_advance_progress(progress),
            )
    final_snapshot, _ = await _final_snapshot(
        journal,
        complete_plan,
        prompt=prompt,
        config=prepared.config,
    )
    return final_snapshot, complete_plan


async def _run_grid(
    prepared: PreparedGrid,
    *,
    output_directory: Path,
    injected_transport: AsyncCompletionTransport | None,
    progress: ProgressReporter,
) -> GridPaths:
    versions = transport_versions()
    contract = _request_contract(prepared.config)
    state = build_grid_state(
        prepared,
        request_contract_hash=contract,
        openrouter_sdk_version=versions.openrouter_sdk_version,
        openrouter_openapi_version=versions.openrouter_openapi_version,
    )
    paths = GridPaths.under(output_directory)
    with exclusive_run(paths.journal):
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
        )
        analysis = analyze_grid(
            cards=prepared.pool,
            family_ids=tuple(judge.family_id for judge in prepared.config.judges),
            imported_votes=prepared.pilot_import.votes,
            fresh_votes=snapshot.votes,
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
