"""Build run-state and completed manifests from already-proved evidence.

These constructors contain no filesystem or provider work. Callers supply
artifact hashes only after durable validation, which makes publication the
last state transition of a run rather than part of execution.
"""

from collections.abc import Mapping, Sequence

from pydantic import JsonValue, TypeAdapter

from atlas_tools.relation.evaluation.analysis.api import (
    GridAnalysis,
    VoteEconomics,
    vote_economics,
)
from atlas_tools.relation.evaluation.application.identity import judge_pin, plan_hash
from atlas_tools.relation.evaluation.application.preparation import (
    PreparedGrid,
    PreparedPilot,
)
from atlas_tools.relation.evaluation.domain.api import (
    BUNDLES,
    ExpectedEffortArm,
    ExpectedGrid,
    ExpectedRepeatArm,
    FamilyGridCounts,
    FrozenMapping,
    GridManifest,
    GridRunState,
    HandoffManifest,
    HistoricalCompletionRequestPolicyId,
    JudgeFamilyId,
    PilotRunState,
    ReasoningEffort,
    RunDates,
    Sha256Hex,
    Vote,
)
from atlas_tools.relation.evaluation.modes.api import FEW_SHOTS, HOLDOUTS
from atlas_tools.relation.evaluation.storage.api import jsonl_hash

_JSON_OBJECT_ADAPTER = TypeAdapter(dict[str, JsonValue])
_MANIFEST_OPERATIONAL_FIELDS = {"max_cost_usd", "concurrency"}


def _run_dates(votes: Sequence[Vote]) -> RunDates:
    if not votes:
        raise ValueError("cannot finalize a manifest without logical votes")
    return RunDates(
        started_at=min(vote.request_at for vote in votes),
        completed_at=max(vote.response_at for vote in votes),
    )


def _executor_config(prepared: PreparedPilot | PreparedGrid) -> FrozenMapping[str, JsonValue]:
    payload = prepared.config.model_dump(
        mode="json",
        exclude=_MANIFEST_OPERATIONAL_FIELDS,
    )
    return _JSON_OBJECT_ADAPTER.validate_python(payload, strict=True)


def _pilot_source_hashes(prepared: PreparedPilot) -> dict[str, Sha256Hex]:
    return dict(prepared.deck.source_hashes)


def _grid_source_hashes(prepared: PreparedGrid) -> dict[str, Sha256Hex]:
    return {
        **prepared.deck.source_hashes,
        "judges-panel": prepared.panel_hash,
        "pilot-attempts.jsonl": prepared.pilot_import.attempts_hash,
        "pilot-manifest.json": prepared.pilot_import.manifest_hash,
        "pilot-votes.jsonl": prepared.pilot_import.votes_hash,
    }


def build_pilot_state(
    prepared: PreparedPilot,
    *,
    request_contract_hash: Sha256Hex,
    openrouter_sdk_version: str,
    openrouter_openapi_version: str,
    historical_request_policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...] = (),
) -> PilotRunState:
    """Bind a pilot's replayable task stream before any journal is created."""
    return PilotRunState(
        plan_hash=plan_hash(prepared.plan, request_contract=request_contract_hash),
        request_contract_hash=request_contract_hash,
        source_hashes=_pilot_source_hashes(prepared),
        prompt_pack_hash=prepared.prompt_pack.content_hash,
        slice_hash=jsonl_hash(prepared.slice_records),
        expected_votes=prepared.plan.expected_votes,
        historical_request_policy_ids=historical_request_policy_ids,
        openrouter_sdk_version=openrouter_sdk_version,
        openrouter_openapi_version=openrouter_openapi_version,
    )


def build_grid_state(
    prepared: PreparedGrid,
    *,
    request_contract_hash: Sha256Hex,
    openrouter_sdk_version: str,
    openrouter_openapi_version: str,
    historical_request_policy_ids: tuple[HistoricalCompletionRequestPolicyId, ...] = (),
) -> GridRunState:
    """Bind the immutable inputs of a two-phase grid before Phase A."""
    return GridRunState(
        request_contract_hash=request_contract_hash,
        source_hashes=_grid_source_hashes(prepared),
        prompt_pack_hash=prepared.prompt_pack.content_hash,
        rubric_version=prepared.config.rubric_version,
        panel_version=prepared.config.panel.version,
        panel_frozen=prepared.config.panel.frozen,
        pool_cards=len(prepared.pool),
        corpus_hash=jsonl_hash(prepared.corpus),
        imported_votes_hash=jsonl_hash(prepared.pilot_import.votes),
        imported_attempts_hash=jsonl_hash(prepared.pilot_import.attempts),
        historical_request_policy_ids=historical_request_policy_ids,
        pilot_historical_request_policy_ids=(prepared.pilot_import.historical_request_policy_ids),
        openrouter_sdk_version=openrouter_sdk_version,
        openrouter_openapi_version=openrouter_openapi_version,
    )


def _effort_arm(prepared: PreparedPilot) -> ExpectedEffortArm | None:
    efforts: dict[JudgeFamilyId, ReasoningEffort] = {}
    for judge in prepared.config.judges:
        if judge.higher_effort is not None:
            efforts[judge.family_id] = judge.higher_effort
    if not efforts:
        return None
    return ExpectedEffortArm(
        family_efforts=efforts,
        relation_ids=tuple(row.relation_id for row in prepared.slice_records),
    )


def build_pilot_manifest(
    prepared: PreparedPilot,
    *,
    state: PilotRunState,
    votes: Sequence[Vote],
    artifact_hashes: Mapping[str, Sha256Hex],
) -> HandoffManifest:
    """Describe a completely validated pilot without reading its files again."""
    required = {"attempts.jsonl", "slice.jsonl", "votes.jsonl"}
    if set(artifact_hashes) != required:
        raise ValueError(f"pilot finalization requires artifact hashes {sorted(required)}")
    families = tuple(judge.family_id for judge in prepared.config.judges)
    relation_ids = tuple(row.relation_id for row in prepared.slice_records)
    non_holdouts = tuple(row.relation_id for row in prepared.slice_records if not row.is_holdout)
    return HandoffManifest(
        historical_request_policy_ids=state.historical_request_policy_ids,
        expected_grid=ExpectedGrid(
            families=families,
            bundles=BUNDLES,
            relation_ids=relation_ids,
            effort=prepared.config.baseline_effort,
        ),
        expected_repeat_arm=ExpectedRepeatArm(
            families=families,
            relation_ids=non_holdouts,
            effort=prepared.config.baseline_effort,
            repeat_indices=tuple(range(1, prepared.config.repeat_count + 1)),
        ),
        expected_effort_arm=_effort_arm(prepared),
        slice_derivation=prepared.slice_derivation,
        run_dates=_run_dates(votes),
        judges=tuple(judge_pin(judge) for judge in prepared.config.judges),
        prompt_pack_hash=prepared.prompt_pack.content_hash,
        rubric_version=prepared.config.rubric_version,
        full_grid_card_count=prepared.full_grid_card_count,
        source_hashes={**_pilot_source_hashes(prepared), **artifact_hashes},
        openrouter_sdk_version=state.openrouter_sdk_version,
        openrouter_openapi_version=state.openrouter_openapi_version,
        executor_config=_executor_config(prepared),
    )


def _fresh_votes(analysis: GridAnalysis) -> tuple[Vote, ...]:
    return tuple(
        observed.vote
        for card in analysis.cards
        for observed in card.votes()
        if observed.source == "fresh"
    )


def _all_votes(analysis: GridAnalysis) -> tuple[Vote, ...]:
    return tuple(observed.vote for card in analysis.cards for observed in card.votes())


def _family_counts(
    prepared: PreparedGrid,
    economics: VoteEconomics,
) -> tuple[FamilyGridCounts, ...]:
    by_family = {family.family_id: family for family in economics.by_family}
    rows: list[FamilyGridCounts] = []
    for judge in prepared.config.judges:
        family = by_family[judge.family_id]
        rows.append(
            FamilyGridCounts(
                family_id=family.family_id,
                imported_votes=family.imported_votes,
                fresh_baseline_votes=family.fresh_baseline_votes,
                refinement_votes=family.refinement_votes,
                canary_votes=family.canary_votes,
                abstentions=family.abstentions,
                known_cost_usd=family.known_cost_usd,
                cost_complete=family.cost_complete,
            )
        )
    return tuple(rows)


def build_grid_manifest(
    prepared: PreparedGrid,
    *,
    state: GridRunState,
    analysis: GridAnalysis,
    canary_votes: Sequence[Vote],
    artifact_hashes: Mapping[str, Sha256Hex],
    executor_policy: Mapping[str, JsonValue],
    request_policy: Mapping[str, JsonValue],
) -> GridManifest:
    """Describe a complete grid after cell reconciliation and source recheck."""
    required = {
        "attempts.jsonl",
        "corpus.jsonl",
        "imported-attempts.jsonl",
        "imported-votes.jsonl",
        "votes.jsonl",
    }
    if set(artifact_hashes) != required:
        raise ValueError(f"grid finalization requires artifact hashes {sorted(required)}")
    economics = vote_economics(analysis, canary_votes=canary_votes)
    fresh = (*_fresh_votes(analysis), *canary_votes)
    dates = _run_dates(fresh or _all_votes(analysis))
    counts = _family_counts(prepared, economics)
    return GridManifest(
        historical_request_policy_ids=state.historical_request_policy_ids,
        panel_version=prepared.config.panel.version,
        panel_frozen=prepared.config.panel.frozen,
        judges=tuple(judge_pin(judge) for judge in prepared.config.judges),
        pilot_config=prepared.pilot_import.config,
        pilot_historical_request_policy_ids=(prepared.pilot_import.historical_request_policy_ids),
        manual_prunes={
            prune.family_id: prune.reason for prune in prepared.config.panel.manual_prunes
        },
        reserve_topology=prepared.config.panel.reserve_topology,
        run_dates=dates,
        prompt_pack_hash=prepared.prompt_pack.content_hash,
        rubric_version=prepared.config.rubric_version,
        source_hashes={**_grid_source_hashes(prepared), **artifact_hashes},
        request_contract_hash=state.request_contract_hash,
        pool_cards=len(prepared.pool),
        shot_excluded_cards=len(FEW_SHOTS),
        holdout_cards=len(HOLDOUTS),
        refined_cards=economics.refined_cards,
        realized_trigger_rate=economics.realized_trigger_rate,
        family_counts=counts,
        total_votes=economics.total_votes,
        openrouter_sdk_version=state.openrouter_sdk_version,
        openrouter_openapi_version=state.openrouter_openapi_version,
        executor_config=_executor_config(prepared),
        executor_policy=executor_policy,
        request_policy=request_policy,
    )
