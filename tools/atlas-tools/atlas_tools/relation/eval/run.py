"""Public composition facade for resumable relation-judge evaluations."""

from importlib.metadata import version
from os import PathLike
from pathlib import Path
from typing import assert_never

import openrouter

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.eval.artifacts import (
    LadderPaths,
    LadderRunState,
    PilotPaths,
    PilotRunState,
    finalize_ladder_output,
    finalize_pilot_output,
    ladder_input_hashes,
    pilot_slice_hash,
    prepare_ladder_run_state,
    prepare_pilot_run_state,
    validate_completed_ladder_output,
    validate_completed_pilot_output,
)
from atlas_tools.relation.eval.contract import (
    RUBRIC_VERSION,
    BaseRunConfig,
    ConcurrencyConfig,
    EvaluationCard,
    JudgeConfig,
    LadderJudge,
    LadderPreparedInputs,
    LadderRunConfig,
    LoadedRunConfig,
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
from atlas_tools.relation.eval.inputs import (
    load_run_config,
    prepare_ladder_inputs,
    prepare_pilot_inputs,
)
from atlas_tools.relation.eval.journal import exclusive_run_lock, load_jsonl
from atlas_tools.relation.eval.ladder import LadderRoundsPlan, derive_round
from atlas_tools.relation.eval.provenance import plan_hash, request_contract_hash
from atlas_tools.relation.eval.schema import VoteRow
from atlas_tools.relation.eval.transport import (
    CompletionTransport,
    CompletionTransportFactory,
    OpenRouterTransport,
    OpenRouterTransportFactory,
    provider_limited_factory,
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


def _ladder_state(config: LadderRunConfig, prepared: LadderPreparedInputs) -> LadderRunState:
    return LadderRunState(
        request_contract_hash=request_contract_hash(config),
        source_hashes=ladder_input_hashes(prepared),
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        shell=config.shell,
        panel_version=config.panel.version,
        panel_frozen=config.panel.frozen,
        eligible_cards=len(prepared.eligible),
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


def _derive_complete_plan(
    config: LadderRunConfig,
    *,
    prepared: LadderPreparedInputs,
    paths: LadderPaths,
    transport_factory: CompletionTransportFactory | None,
    transport: CompletionTransport | None,
    progress: ProgressReporter,
) -> LadderRoundsPlan:
    """Execute the ladder round by round until every card's path is complete.

    Each round is derived from the committed vote journal, so re-deriving
    after a kill produces the identical cumulative task stream; the durable
    executor then resumes its journal prefix instead of paying again.
    """
    votes_by_id = {vote.vote_id: vote for vote in load_jsonl(paths.votes_jsonl, VoteRow)}
    rounds: list[tuple[VoteTask, ...]] = []
    for rung_index in range(1, config.rung_count + 1):
        round_tasks = derive_round(
            config,
            rung_index=rung_index,
            prepared=prepared,
            votes_by_id=votes_by_id,
        )
        if not round_tasks:
            break
        rounds.append(round_tasks)
        if all(task.vote_id in votes_by_id for task in round_tasks):
            continue
        plan = LadderRoundsPlan(rounds=tuple(rounds))
        votes = execute_plan(
            paths=paths,
            prepared=prepared,
            config=config,
            plan=plan,
            transport_factory=transport_factory,
            transport=transport,
            progress=progress,
        )
        votes_by_id = {vote.vote_id: vote for vote in votes}
    complete = LadderRoundsPlan(rounds=tuple(rounds))
    if complete.expected_votes != len(votes_by_id):
        raise ValueError(
            f"votes.jsonl contains {len(votes_by_id)} votes but the derived ladder "
            f"plan expects {complete.expected_votes}; the journal belongs to another run"
        )
    return complete


def _journal_plan(
    config: LadderRunConfig,
    *,
    prepared: LadderPreparedInputs,
    paths: LadderPaths,
) -> LadderRoundsPlan:
    """Re-derive the complete round structure from an already-complete journal."""
    votes_by_id = {vote.vote_id: vote for vote in load_jsonl(paths.votes_jsonl, VoteRow)}
    rounds: list[tuple[VoteTask, ...]] = []
    for rung_index in range(1, config.rung_count + 1):
        round_tasks = derive_round(
            config,
            rung_index=rung_index,
            prepared=prepared,
            votes_by_id=votes_by_id,
        )
        if not round_tasks:
            break
        rounds.append(round_tasks)
    return LadderRoundsPlan(rounds=tuple(rounds))


def run_ladder(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    loaded_config: LoadedRunConfig,
    transport_factory: CompletionTransportFactory | None = None,
    transport: CompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
    allow_unfrozen_panel: bool = False,
) -> LadderPaths:
    """Execute or resume the vote ladder over the full verified corpus.

    A corpus run refuses an unfrozen panel; only the pilot qualification
    entry point passes ``allow_unfrozen_panel=True``.
    """
    config = loaded_config.ladder()
    if not config.panel.frozen and not allow_unfrozen_panel:
        raise ValueError(
            "judges.yaml panel is not frozen; freeze the panel (with its documented "
            "pruning floor) before running the corpus, or run pilot qualification"
        )
    prepared = prepare_ladder_inputs(cards_dir, loaded_config)
    state = _ladder_state(config, prepared)
    output = Path(out_dir)

    if transport_factory is None and transport is None:
        transport_factory = provider_limited_factory(
            OpenRouterTransportFactory.from_environment(),
            limit=config.per_provider_concurrency,
        )
    elif transport_factory is not None:
        transport_factory = provider_limited_factory(
            transport_factory,
            limit=config.per_provider_concurrency,
        )

    with exclusive_run_lock(output / ".run.lock"):
        paths = prepare_ladder_run_state(output, state=state)
        if paths.manifest_json.exists():
            validate_completed_ladder_output(
                paths=paths,
                prepared=prepared,
                config=config,
                state=state,
                plan=_journal_plan(config, prepared=prepared, paths=paths),
            )
            return paths
        plan = _derive_complete_plan(
            config,
            prepared=prepared,
            paths=paths,
            transport_factory=transport_factory,
            transport=transport,
            progress=progress,
        )
        finalize_ladder_output(
            paths=paths,
            prepared=prepared,
            config=config,
            state=state,
            plan=plan,
        )
        return paths


def run_evaluation(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    loaded_config: LoadedRunConfig,
    transport_factory: CompletionTransportFactory | None = None,
    transport: CompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> PilotPaths | LadderPaths:
    """Dispatch pilot or ladder execution solely from the config's discriminated mode."""
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
        case LadderRunConfig():
            return run_ladder(
                cards_dir=cards_dir,
                out_dir=out_dir,
                loaded_config=loaded_config,
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
    "JudgeConfig",
    "LadderJudge",
    "LadderPaths",
    "LadderRunConfig",
    "LoadedRunConfig",
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
    "run_ladder",
    "run_pilot",
]
