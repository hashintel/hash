"""Public composition facade for resumable relation-judge evaluations."""

from importlib.metadata import version
from os import PathLike
from pathlib import Path
from typing import assert_never

import openrouter

from atlas_tools.common.progress import NO_PROGRESS, ProgressReporter
from atlas_tools.relation.eval.artifacts import (
    FullGridPaths,
    FullGridRunState,
    PilotPaths,
    PilotRunState,
    finalize_full_grid_output,
    finalize_pilot_output,
    full_grid_input_hashes,
    pilot_slice_hash,
    prepare_full_grid_run_state,
    prepare_pilot_run_state,
    validate_completed_full_grid_output,
    validate_completed_pilot_output,
)
from atlas_tools.relation.eval.authorization import load_analysis_decisions
from atlas_tools.relation.eval.contract import (
    RUBRIC_VERSION,
    BaseRunConfig,
    ConcurrencyConfig,
    EvaluationCard,
    FullGridVotePlan,
    FullRunConfig,
    JudgeConfig,
    LoadedRunConfig,
    MaxCompletionTokensLimit,
    MaxTokensLimit,
    OpenRouterRegion,
    OutputTokenLimit,
    PilotRunConfig,
    PilotVotePlan,
    RunConfig,
    SliceSamplingConfig,
    TransientRetryConfig,
)
from atlas_tools.relation.eval.executor import execute_plan
from atlas_tools.relation.eval.inputs import (
    load_run_config,
    prepare_full_inputs,
    prepare_pilot_inputs,
)
from atlas_tools.relation.eval.journal import exclusive_run_lock
from atlas_tools.relation.eval.provenance import plan_hash, request_contract_hash
from atlas_tools.relation.eval.transport import (
    CompletionTransport,
    CompletionTransportFactory,
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


def _full_state(config: FullRunConfig, plan: FullGridVotePlan) -> FullGridRunState:
    prepared = plan.prepared
    return FullGridRunState(
        plan_hash=plan_hash(config, plan),
        request_contract_hash=request_contract_hash(config),
        source_hashes=full_grid_input_hashes(prepared),
        prompt_pack_hash=prepared.pack_hash,
        rubric_version=config.rubric_version,
        decisions_hash=prepared.decisions_hash,
        expected_votes=plan.expected_votes,
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


def run_full_grid(
    *,
    cards_dir: PathLike,
    out_dir: PathLike,
    loaded_config: LoadedRunConfig,
    transport_factory: CompletionTransportFactory | None = None,
    transport: CompletionTransport | None = None,
    progress: ProgressReporter = NO_PROGRESS,
) -> FullGridPaths:
    """Execute the full admitted grid from a config-bound decisions artifact."""
    config, _decisions_path = loaded_config.full()
    prepared = prepare_full_inputs(cards_dir, loaded_config)
    plan = FullGridVotePlan(config=config, prepared=prepared)
    state = _full_state(config, plan)
    output = Path(out_dir)

    with exclusive_run_lock(output / ".run.lock"):
        paths = prepare_full_grid_run_state(output, state=state)
        if paths.manifest_json.exists():
            validate_completed_full_grid_output(
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
        finalize_full_grid_output(
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
) -> PilotPaths | FullGridPaths:
    """Dispatch pilot or full execution solely from the config's discriminated mode."""
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
        case FullRunConfig():
            return run_full_grid(
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
    "FullGridPaths",
    "FullRunConfig",
    "JudgeConfig",
    "LoadedRunConfig",
    "MaxCompletionTokensLimit",
    "MaxTokensLimit",
    "OpenRouterRegion",
    "OpenRouterTransport",
    "OpenRouterTransportFactory",
    "OutputTokenLimit",
    "PilotPaths",
    "PilotRunConfig",
    "RunConfig",
    "SliceSamplingConfig",
    "TransientRetryConfig",
    "load_analysis_decisions",
    "load_run_config",
    "run_evaluation",
    "run_full_grid",
    "run_pilot",
]
