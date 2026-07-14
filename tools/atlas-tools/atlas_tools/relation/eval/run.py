"""Public composition facade for resumable relation-judge evaluations."""

from datetime import timedelta
from importlib.metadata import version
from os import PathLike
from pathlib import Path
from typing import assert_never

import openrouter
from openrouter.components import ChatMessages, ChatResult

from atlas_tools.common import sha256_bytes
from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.eval.artifacts import (
    GridPaths,
    GridRunState,
    PilotPaths,
    PilotRunState,
    finalize_grid_output,
    finalize_pilot_output,
    grid_corpus_rows,
    grid_input_hashes,
    grid_votes_by_id,
    pilot_slice_hash,
    prepare_grid_run_state,
    prepare_pilot_run_state,
    validate_completed_grid_output,
    validate_completed_pilot_output,
)
from atlas_tools.relation.eval.contract import (
    RUBRIC_VERSION,
    BaseRunConfig,
    ConcurrencyConfig,
    EvaluationCard,
    GridJudge,
    GridPreparedInputs,
    GridRunConfig,
    JudgeConfig,
    LoadedRunConfig,
    ManualPrune,
    MaxCompletionTokensLimit,
    MaxTokensLimit,
    OpenRouterRegion,
    OutputTokenLimit,
    PanelConfig,
    PilotRunConfig,
    PilotVotePlan,
    RunConfig,
    SliceSamplingConfig,
    TransientRetryConfig,
    VoteTask,
)
from atlas_tools.relation.eval.executor import execute_plan
from atlas_tools.relation.eval.failures import first_vote_pages
from atlas_tools.relation.eval.grid import (
    GridRoundsPlan,
    phase_a_tasks,
    phase_b_tasks,
    refined_cards,
)
from atlas_tools.relation.eval.inputs import (
    load_run_config,
    prepare_grid_inputs,
    prepare_pilot_inputs,
)
from atlas_tools.relation.eval.journal import (
    exclusive_run_lock,
    jsonl_bytes,
    load_jsonl,
)
from atlas_tools.relation.eval.prompt import parse_response
from atlas_tools.relation.eval.provenance import plan_hash, request_contract_hash
from atlas_tools.relation.eval.schema import PhysicalAttemptRow, ReasoningEffort, VoteRow
from atlas_tools.relation.eval.transport import (
    CompletionTransport,
    CompletionTransportFactory,
    FamilyStreamGuards,
    GuardedTransport,
    GuardedTransportFactory,
    OpenRouterTransport,
    OpenRouterTransportFactory,
)


def _sdk_version() -> str:
    return version("openrouter")


def _pilot_state(config: PilotRunConfig, plan: PilotVotePlan) -> PilotRunState:
    prepared = plan.prepared
    return PilotRunState(
        plan_hash=plan_hash(config, plan),
        request_contract_hash=request_contract_hash(config),
        source_hashes=prepared.source_hashes,
        prompt_pack_hash=prepared.pack_hash,
        slice_hash=pilot_slice_hash(prepared.slice_rows),
        expected_votes=plan.expected_votes,
        openrouter_sdk_version=_sdk_version(),
        openrouter_openapi_version=openrouter.OPENAPI_DOC_VERSION,
    )


def _grid_state(config: GridRunConfig, prepared: GridPreparedInputs) -> GridRunState:
    return GridRunState(
        request_contract_hash=request_contract_hash(config),
        source_hashes=grid_input_hashes(prepared),
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        panel_version=config.panel.version,
        panel_frozen=config.panel.frozen,
        pool_cards=len(prepared.pool),
        corpus_hash=sha256_bytes(jsonl_bytes(grid_corpus_rows(prepared))),
        imported_votes_hash=sha256_bytes(jsonl_bytes(prepared.imported.votes)),
        imported_attempts_hash=sha256_bytes(
            jsonl_bytes(
                [
                    attempt
                    for vote in prepared.imported.votes
                    for attempt in prepared.imported.attempts_by_vote[vote.vote_id]
                ]
            )
        ),
        openrouter_sdk_version=_sdk_version(),
        openrouter_openapi_version=openrouter.OPENAPI_DOC_VERSION,
    )


def run_pilot(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    config: PilotRunConfig,
    transport_factory: CompletionTransportFactory | None = None,
    transport: CompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> PilotPaths:
    """Derive and execute a pilot from an already validated pilot config."""
    prepared = prepare_pilot_inputs(cards_dir, config)
    plan = PilotVotePlan(config=config, prepared=prepared)
    state = _pilot_state(config, plan)
    output = Path(out_dir)

    with exclusive_run_lock(output / ".run.lock"):
        paths = prepare_pilot_run_state(output, state=state, slice_rows=prepared.slice_rows)
        if paths.manifest_json.exists():
            validate_completed_pilot_output(
                paths=paths,
                prepared=prepared,
                config=config,
                state=state,
                plan=plan,
            )
            return paths
        execute_plan(
            paths=paths,
            prepared=prepared,
            config=config,
            plan=plan,
            transport_factory=transport_factory,
            transport=transport,
            progress=progress,
        )
        finalize_pilot_output(
            paths=paths,
            prepared=prepared,
            config=config,
            state=state,
            plan=plan,
        )
        return paths


def _grid_guards(
    config: GridRunConfig,
    *,
    established_families: frozenset[str],
) -> FamilyStreamGuards:
    def pages(error: Exception) -> bool:
        return first_vote_pages(error, policy=config.transient_retries)

    return FamilyStreamGuards(
        cache_check_vote=config.guards.cache_check_vote,
        cost_window=config.guards.cost_window,
        cost_multiplier=config.guards.cost_multiplier,
        pilot_cost_per_vote_usd={
            judge.family_id: judge.pilot_cost_per_vote_usd for judge in config.judges
        },
        parse_verdict=parse_response,
        first_vote_pages=pages,
        established_families=established_families,
    )


def _established_families(paths: GridPaths) -> frozenset[str]:
    """Families whose route this run has proven with an accepted physical attempt.

    Attempts journal in completion order, so a family whose accepted work is
    not yet committed as a vote (votes commit strictly in plan order) still
    counts as proven. The first-vote roster check applies only to unproven
    streams: a resumed session's opening call on an established family is an
    ordinary request whose transient failures take the normal retry path.
    Imported pilot votes deliberately do not count — they proved the route at
    pilot time, not now.
    """
    if not paths.attempts_jsonl.is_file():
        return frozenset()
    return frozenset(
        attempt.family_id
        for attempt in load_jsonl(paths.attempts_jsonl, PhysicalAttemptRow)
        if attempt.result is not None and attempt.failure is None
    )


def _derive_grid_plan(
    config: GridRunConfig,
    *,
    prepared: GridPreparedInputs,
    paths: GridPaths,
    transport_factory: CompletionTransportFactory | None,
    transport: CompletionTransport | None,
    progress: ProgressReporter,
    execute: bool,
) -> GridRoundsPlan:
    """Run (or re-derive) both grid phases against the durable fresh journal.

    Phase B's task set is a pure function of the complete baseline row, so
    re-deriving after any interruption reproduces the identical cumulative
    task stream and the durable executor resumes its journal prefix instead
    of paying again.
    """
    imported_ids = frozenset(vote.vote_id for vote in prepared.imported.votes)
    phase_a = phase_a_tasks(
        config,
        pool=prepared.pool,
        pack_hash=prepared.pack_hash,
        imported_vote_ids=imported_ids,
    )
    phases: list[tuple[VoteTask, ...]] = [phase_a]
    votes_by_id = {vote.vote_id: vote for vote in load_jsonl(paths.votes_jsonl, VoteRow)}

    def execute_cumulative() -> None:
        nonlocal votes_by_id
        if not execute:
            raise ValueError("grid journal is incomplete but execution was not requested")
        votes = execute_plan(
            paths=paths,
            prepared=prepared,
            config=config,
            plan=GridRoundsPlan(phases=tuple(phases)),
            transport_factory=transport_factory,
            transport=transport,
            progress=progress,
        )
        votes_by_id = {vote.vote_id: vote for vote in votes}

    if any(task.vote_id not in votes_by_id for task in phase_a):
        execute_cumulative()

    refined = refined_cards(
        config,
        pool=prepared.pool,
        pack_hash=prepared.pack_hash,
        votes_by_id=grid_votes_by_id(prepared, list(votes_by_id.values())),
    )
    if refined:
        phase_b = phase_b_tasks(config, refined=refined, pack_hash=prepared.pack_hash)
        phases.append(phase_b)
        if any(task.vote_id not in votes_by_id for task in phase_b):
            execute_cumulative()

    complete = GridRoundsPlan(phases=tuple(phases))
    if complete.expected_votes != len(votes_by_id):
        raise ValueError(
            f"votes.jsonl contains {len(votes_by_id)} fresh votes but the derived grid "
            f"plan expects {complete.expected_votes}; the journal belongs to another run"
        )
    return complete


def run_grid(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    loaded_config: LoadedRunConfig,
    pilot_dir: PathLike,
    transport_factory: CompletionTransportFactory | None = None,
    transport: CompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> GridPaths:
    """Execute or resume the production grid over the full verified corpus.

    Both phases run through the pilot's durable executor with the grid's
    family-stream guards layered on the transport: per-family serialization
    (parallel across families, sequential within one), the first-vote check,
    the cache assertion, and the rolling cost tripwire. Guard breaches stop
    the run resumably; imported pilot votes never touch the network.
    """
    config = loaded_config.grid()
    if not config.panel.frozen:
        raise ValueError(
            "judges.yaml panel is not frozen; the production grid runs only the "
            "frozen roster (changes require re-qualification)"
        )
    prepared = prepare_grid_inputs(cards_dir, loaded_config, pilot_dir=pilot_dir)
    state = _grid_state(config, prepared)
    output = Path(out_dir)

    with exclusive_run_lock(output / ".run.lock"):
        paths = prepare_grid_run_state(output, state=state, prepared=prepared)
        guards = _grid_guards(config, established_families=_established_families(paths))
        if transport is not None:
            transport = GuardedTransport(inner=_closeable(transport), guards=guards)
        elif transport_factory is not None:
            transport_factory = GuardedTransportFactory(inner=transport_factory, guards=guards)
        else:
            transport_factory = GuardedTransportFactory(
                inner=OpenRouterTransportFactory.from_environment(),
                guards=guards,
            )
        if paths.manifest_json.exists():
            validate_completed_grid_output(
                paths=paths,
                prepared=prepared,
                config=config,
                state=state,
                plan=_derive_grid_plan(
                    config,
                    prepared=prepared,
                    paths=paths,
                    transport_factory=None,
                    transport=None,
                    progress=progress,
                    execute=False,
                ),
            )
            return paths
        plan = _derive_grid_plan(
            config,
            prepared=prepared,
            paths=paths,
            transport_factory=transport_factory,
            transport=transport,
            progress=progress,
            execute=True,
        )
        finalize_grid_output(
            paths=paths,
            prepared=prepared,
            config=config,
            state=state,
            plan=plan,
        )
        return paths


class _CloseableAdapter:
    """Give an injected plain transport the close() the guard wrapper expects."""

    def __init__(self, inner: CompletionTransport) -> None:
        self._inner = inner

    def complete(
        self,
        *,
        messages: list[ChatMessages],
        judge: JudgeConfig,
        effort: ReasoningEffort,
        session_id: str,
        timeout: timedelta,
    ) -> ChatResult:
        return self._inner.complete(
            messages=messages,
            judge=judge,
            effort=effort,
            session_id=session_id,
            timeout=timeout,
        )

    def close(self) -> None:
        closer = getattr(self._inner, "close", None)
        if callable(closer):
            closer()


def _closeable(transport: CompletionTransport) -> _CloseableAdapter:
    return _CloseableAdapter(transport)


def run_evaluation(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    loaded_config: LoadedRunConfig,
    pilot_dir: PathLike | None = None,
    transport_factory: CompletionTransportFactory | None = None,
    transport: CompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> PilotPaths | GridPaths:
    """Dispatch pilot or grid execution solely from the config's discriminated mode."""
    match loaded_config.config:
        case PilotRunConfig() as config:
            return run_pilot(
                cards_dir=cards_dir,
                out_dir=out_dir,
                config=config,
                transport_factory=transport_factory,
                transport=transport,
                progress=progress,
            )
        case GridRunConfig():
            if pilot_dir is None:
                raise ValueError("a grid run requires the pilot handoff directory")
            return run_grid(
                cards_dir=cards_dir,
                out_dir=out_dir,
                loaded_config=loaded_config,
                pilot_dir=pilot_dir,
                transport_factory=transport_factory,
                transport=transport,
                progress=progress,
            )
        case unexpected:
            assert_never(unexpected)


__all__ = [
    "RUBRIC_VERSION",
    "BaseRunConfig",
    "CompletionTransport",
    "CompletionTransportFactory",
    "ConcurrencyConfig",
    "EvaluationCard",
    "GridJudge",
    "GridPaths",
    "GridRunConfig",
    "JudgeConfig",
    "LoadedRunConfig",
    "ManualPrune",
    "MaxCompletionTokensLimit",
    "MaxTokensLimit",
    "OpenRouterRegion",
    "OpenRouterTransport",
    "OpenRouterTransportFactory",
    "OutputTokenLimit",
    "PanelConfig",
    "PilotPaths",
    "PilotRunConfig",
    "RunConfig",
    "SliceSamplingConfig",
    "TransientRetryConfig",
    "load_run_config",
    "run_evaluation",
    "run_grid",
    "run_pilot",
]
