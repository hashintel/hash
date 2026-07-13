import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Literal, cast

import pytest
from openrouter.components import ChatResult

from atlas_tools.common import canonical_json_bytes, sha256_bytes, sha256_file, write_sidecar
from atlas_tools.relation.eval.analysis import (
    _card_axis_disagreement,
    _entropy_strata,
    _qualify,
    analyze_handoff,
    load_handoff,
)
from atlas_tools.relation.eval.prompt import HOLDOUT
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    AnalysisDecisions,
    AnalysisPolicy,
    BundleId,
    ExpectedEffortArm,
    ExpectedGrid,
    ExpectedRepeatArm,
    FramingId,
    HandoffManifest,
    JudgePin,
    PhysicalAttemptRow,
    ReasoningEffort,
    RunDates,
    ShellId,
    SliceDerivation,
    SliceRow,
    Verdict,
    VoteRow,
    VoteVerdict,
)

FAMILIES = ("family-a", "family-b")
PROMPT_HASH = "a" * 64
RUBRIC = "rubric-v1"
BASELINE_EFFORT: ReasoningEffort = "minimal"
HIGH_EFFORT: ReasoningEffort = "high"
NON_HOLDOUTS = tuple(f"test:R{index}" for index in range(1, 7))
HOLDOUTS: dict[str, Verdict] = dict(HOLDOUT)
RELATIONS = tuple(sorted((*HOLDOUTS, *NON_HOLDOUTS)))
START = datetime(2026, 1, 1, tzinfo=UTC)

type LogicalCell = tuple[str, str, BundleId, ReasoningEffort, int]


@dataclass(frozen=True)
class RouteMutation:
    physical_model: str | None = None
    physical_provider: str | None = None


def _model(family: str) -> str:
    return f"model-{family}"


def _endpoint(family: str) -> str:
    return f"provider-{family}"


def _card_hash(relation_id: str) -> str:
    return sha256_bytes(relation_id.encode())


def _base_verdict(family: str, bundle: BundleId, relation_id: str) -> Verdict:
    shell, framing = bundle.split("x")
    if relation_id in HOLDOUTS:
        verdict = HOLDOUTS[relation_id]
    elif relation_id == "test:R1":
        verdict = "proximal"
    elif relation_id == "test:R2":
        verdict = "overlay"
    elif relation_id == "test:R3":
        verdict = "coincident" if family == "family-a" else "overlay"
    elif relation_id == "test:R4":
        choices: tuple[Verdict, ...] = ("coincident", "proximal", "overlay", "unclear")
        verdict = choices[(int(shell[1]) + int(framing[1]) + (family != "family-a")) % 4]
    elif relation_id == "test:R5":
        verdict = "unclear" if family != "family-a" and bundle == "S3xF3" else "proximal"
    else:
        verdict = "coincident" if framing == "F3" else "overlay"
    return verdict


def _chat_result(
    *,
    vote_id: str,
    raw_completion: str,
    model: str,
    endpoint: str,
    route_mutation: RouteMutation | None,
    cost_usd: float | None,
) -> ChatResult:
    route_model = route_mutation.physical_model if route_mutation else None
    route_provider = route_mutation.physical_provider if route_mutation else None
    attempts = [
        {
            "model": route_model or model,
            "provider": route_provider or endpoint,
            "status": 200,
        }
    ]
    if route_model is not None or route_provider is not None:
        attempts.append({"model": model, "provider": endpoint, "status": 200})
    return ChatResult.model_validate(
        {
            "choices": [
                {
                    "finish_reason": "stop",
                    "index": 0,
                    "message": {"role": "assistant", "content": raw_completion},
                }
            ],
            "created": int(START.timestamp()),
            "id": f"result-{vote_id}",
            "model": model,
            "object": "chat.completion",
            "system_fingerprint": None,
            "openrouter_metadata": {
                "attempt": 0,
                "endpoints": {"available": [], "total": 1},
                "is_byok": False,
                "region": None,
                "requested": model,
                "strategy": "direct",
                "summary": "deterministic test route",
                "attempts": attempts,
            },
            "usage": {
                "completion_tokens": 50,
                "prompt_tokens": 7500,
                "total_tokens": 7550,
                "cost": cost_usd,
                "prompt_tokens_details": {
                    "cache_write_tokens": 0,
                    "cached_tokens": 7000,
                },
                "completion_tokens_details": {"reasoning_tokens": 0},
            },
        }
    )


def _vote_and_attempt(
    *,
    cell: LogicalCell,
    verdict: VoteVerdict,
    family_cost: float,
    route_mutation: RouteMutation | None,
    cost_missing: bool,
) -> tuple[VoteRow, PhysicalAttemptRow]:
    relation_id, family, bundle, effort, repeat_index = cell
    shell_text, framing_text = bundle.split("x")
    shell = cast("ShellId", shell_text)
    framing = cast("FramingId", framing_text)
    vote_id = sha256_bytes(
        canonical_json_bytes(
            {
                "bundle": bundle,
                "effort": effort,
                "family": family,
                "relation": relation_id,
                "repeat": repeat_index,
            }
        )
    )
    abstained = verdict == "ABSTAIN"
    reason = "" if abstained else "P1-P3 fixture judgement"
    raw_completion = (
        "malformed fixture completion"
        if abstained
        else json.dumps({"reason": reason, "verdict": verdict}, sort_keys=True)
    )
    cost_usd = None if cost_missing else family_cost
    result = _chat_result(
        vote_id=vote_id,
        raw_completion=raw_completion,
        model=_model(family),
        endpoint=_endpoint(family),
        route_mutation=route_mutation,
        cost_usd=cost_usd,
    )
    vote = VoteRow(
        vote_id=vote_id,
        relation_id=relation_id,
        card_hash=_card_hash(relation_id),
        family_id=family,
        provider=_endpoint(family),
        model_returned=_model(family),
        shell_id=shell,
        framing_id=framing,
        bundle_id=bundle,
        rubric_version=RUBRIC,
        prompt_pack_hash=PROMPT_HASH,
        verdict=verdict,
        reason=reason,
        raw_completion=raw_completion,
        parse_retries=0,
        abstained=abstained,
        attempt_results=[result],
        effort=effort,
        temperature=0.0,
        seed=7,
        repeat_index=repeat_index,
        tokens_in=7500,
        tokens_out=50,
        tokens_cached=7000,
        tokens_cache_write=0,
        tokens_reasoning=0,
        known_cost_usd=cost_usd or 0.0,
        cost_complete=cost_usd is not None,
        cost_usd=cost_usd,
        ts_request=START,
        ts_response=START + timedelta(seconds=2),
        latency_seconds=2.0,
    )
    attempt = PhysicalAttemptRow(
        attempt_id=sha256_bytes(f"{vote_id}:attempt".encode()),
        vote_id=vote_id,
        request_stage="initial",
        stage_attempt=0,
        request_hash=sha256_bytes(f"{vote_id}:request".encode()),
        family_id=family,
        endpoint_slug=_endpoint(family),
        model_requested=_model(family),
        result=result,
        failure=None,
        ts_request=START,
        ts_response=START + timedelta(seconds=2),
        latency_seconds=2.0,
    )
    return vote, attempt


def _write_jsonl(path: Path, rows: Sequence[object]) -> None:
    path.write_bytes(b"".join(canonical_json_bytes(row) + b"\n" for row in rows))


def _write_handoff(
    directory: Path,
    *,
    families: tuple[str, ...] = FAMILIES,
    verdict_overrides: Mapping[LogicalCell, VoteVerdict] | None = None,
    route_mutations: Mapping[LogicalCell, RouteMutation] | None = None,
    missing_cost_families: frozenset[str] = frozenset(),
) -> Path:
    directory.mkdir()
    overrides = verdict_overrides or {}
    mutations = route_mutations or {}
    slice_rows = [
        SliceRow(
            relation_id=relation_id,
            card_hash=_card_hash(relation_id),
            prescreen_stratum="anchor" if relation_id in HOLDOUTS else f"s{index % 2}",
            sampling_stratum="holdout" if relation_id in HOLDOUTS else f"sample-{index % 2}",
            length_quartile=cast("Literal[1, 2, 3, 4]", index % 4 + 1),
            pilot_strata=["fixture"],
            token_count=100 + index,
            is_holdout=relation_id in HOLDOUTS,
            holdout_verdict=HOLDOUTS.get(relation_id),
            sampling_seed=42,
            selection_key=sha256_bytes(f"selection:{relation_id}".encode()),
        )
        for index, relation_id in enumerate(RELATIONS)
    ]
    slice_path = directory / "slice.jsonl"
    _write_jsonl(slice_path, slice_rows)

    cells: list[LogicalCell] = [
        (relation_id, family, bundle, BASELINE_EFFORT, 0)
        for family in families
        for bundle in BUNDLES
        for relation_id in RELATIONS
    ]
    cells.extend(
        (relation_id, family, "S1xF1", BASELINE_EFFORT, 1)
        for family in families
        for relation_id in NON_HOLDOUTS
    )
    cells.extend(
        (relation_id, family, "S1xF1", HIGH_EFFORT, 0)
        for family in families
        for relation_id in RELATIONS
    )
    votes: list[VoteRow] = []
    attempts: list[PhysicalAttemptRow] = []
    for cell in cells:
        relation_id, family, bundle, _, _ = cell
        verdict = overrides.get(cell, _base_verdict(family, bundle, relation_id))
        vote, attempt = _vote_and_attempt(
            cell=cell,
            verdict=verdict,
            family_cost=0.01 * (families.index(family) + 1),
            route_mutation=mutations.get(cell),
            cost_missing=family in missing_cost_families,
        )
        votes.append(vote)
        attempts.append(attempt)
    votes_path = directory / "votes.jsonl"
    attempts_path = directory / "attempts.jsonl"
    _write_jsonl(votes_path, votes)
    _write_jsonl(attempts_path, attempts)

    selection_hash = sha256_bytes(
        canonical_json_bytes([row.model_dump(mode="json") for row in slice_rows])
    )
    manifest = HandoffManifest(
        schema_version=2,
        expected_grid=ExpectedGrid(
            families=list(families),
            bundles=list(BUNDLES),
            relation_ids=list(RELATIONS),
            effort=BASELINE_EFFORT,
        ),
        expected_repeat_arm=ExpectedRepeatArm(
            families=list(families),
            relation_ids=list(NON_HOLDOUTS),
            effort=BASELINE_EFFORT,
            repeat_indices=[1],
        ),
        expected_effort_arm=ExpectedEffortArm(
            family_efforts=dict.fromkeys(families, HIGH_EFFORT),
            relation_ids=list(RELATIONS),
        ),
        slice_derivation=SliceDerivation(
            algorithm="stratified-hash-v1",
            sampling_seed=42,
            requested_non_holdouts=len(NON_HOLDOUTS),
            eligible_non_holdouts=len(NON_HOLDOUTS),
            selected_non_holdouts=len(NON_HOLDOUTS),
            cards_hash=sha256_bytes(b"fixture cards"),
            sampling_config_hash=sha256_bytes(b"fixture sampling config"),
            selection_hash=selection_hash,
        ),
        run_dates=RunDates(started_at=START, completed_at=START + timedelta(hours=1)),
        judges=[
            JudgePin(
                family_id=family,
                endpoint_slug=_endpoint(family),
                model=_model(family),
            )
            for family in families
        ],
        prompt_pack_hash=PROMPT_HASH,
        rubric_version=RUBRIC,
        full_grid_card_count=100,
        source_hashes={
            "attempts.jsonl": sha256_file(attempts_path),
            "slice.jsonl": sha256_file(slice_path),
            "votes.jsonl": sha256_file(votes_path),
        },
        openrouter_sdk_version="0.10.8-test",
        openrouter_openapi_version="fixture-v1",
        executor_config={"fixture": True},
    )
    write_sidecar(directory / "manifest.json", manifest.model_dump(mode="json"))
    return directory


def _refresh_manifest_hashes(directory: Path, *filenames: str) -> None:
    manifest_path = directory / "manifest.json"
    manifest = HandoffManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    source_hashes = manifest.source_hashes | {
        filename: sha256_file(directory / filename) for filename in filenames
    }
    write_sidecar(
        manifest_path,
        manifest.model_copy(update={"source_hashes": source_hashes}).model_dump(mode="json"),
    )


def _append_duplicate_cell(directory: Path, *, arm: str) -> None:
    votes_path = directory / "votes.jsonl"
    votes = [VoteRow.model_validate_json(line) for line in votes_path.read_text().splitlines()]
    if arm == "repeat":
        source = next(vote for vote in votes if vote.repeat_index == 1)
    else:
        source = next(vote for vote in votes if vote.effort == HIGH_EFFORT)
    duplicate_id = sha256_bytes(f"duplicate:{arm}".encode())
    votes.append(source.model_copy(update={"vote_id": duplicate_id}))
    _write_jsonl(votes_path, votes)

    attempts_path = directory / "attempts.jsonl"
    attempts = [
        PhysicalAttemptRow.model_validate_json(line)
        for line in attempts_path.read_text().splitlines()
    ]
    source_attempt = next(attempt for attempt in attempts if attempt.vote_id == source.vote_id)
    attempts.append(
        source_attempt.model_copy(
            update={
                "attempt_id": sha256_bytes(f"{duplicate_id}:attempt".encode()),
                "vote_id": duplicate_id,
                "request_hash": sha256_bytes(f"{duplicate_id}:request".encode()),
            }
        )
    )
    _write_jsonl(attempts_path, attempts)
    _refresh_manifest_hashes(directory, "votes.jsonl", "attempts.jsonl")


def _all_grid_overrides(family: str, verdict: Verdict) -> dict[LogicalCell, VoteVerdict]:
    return {
        (relation_id, family, bundle, BASELINE_EFFORT, 0): verdict
        for bundle in BUNDLES
        for relation_id in NON_HOLDOUTS
    }


def test_analysis_runs_end_to_end_and_is_byte_deterministic(tmp_path: Path) -> None:
    handoff = _write_handoff(tmp_path / "handoff")

    first = analyze_handoff(handoff, tmp_path / "first")
    second = analyze_handoff(handoff, tmp_path / "second")

    assert first.decisions_json.read_bytes() == second.decisions_json.read_bytes()
    assert first.report_md.read_bytes() == second.report_md.read_bytes()
    decisions = AnalysisDecisions.model_validate_json(first.decisions_json.read_text())
    assert decisions.schema_version == 2
    assert decisions.input_hashes == {
        "attempts.jsonl": sha256_file(handoff / "attempts.jsonl"),
        "manifest.json": sha256_file(handoff / "manifest.json"),
        "slice.jsonl": sha256_file(handoff / "slice.jsonl"),
        "votes.jsonl": sha256_file(handoff / "votes.jsonl"),
    }
    assert decisions.pruned_families == []
    assert [result.correct_count for result in decisions.qualification] == [6, 6]
    assert [posterior.relation_id for posterior in decisions.per_card_posteriors] == list(
        NON_HOLDOUTS
    )
    assert decisions.axis_statistics.noise_floor.est == 0.0
    assert decisions.axis_statistics.noise_floor.bootstrap_resamples == 1000
    assert decisions.axis_statistics.noise_floor.bootstrap_defined == 1000
    assert decisions.projected_grid_cost_usd is not None
    assert decisions.projected_grid_cost.est == decisions.projected_grid_cost_usd
    assert decisions.projected_grid_cost.n > 0
    assert decisions.nomination_seeds
    attempts = [
        PhysicalAttemptRow.model_validate_json(line)
        for line in (handoff / "attempts.jsonl").read_text().splitlines()
    ]
    assert attempts
    assert all(attempt.result is not None and attempt.failure is None for attempt in attempts)
    report = first.report_md.read_text()
    assert "## Phase 0 — validation and data health" in report
    assert "## Phase 3 — decisions" in report
    assert "card-cluster bootstrap" in report
    assert "bootstrap=1000/1000 defined" in report


def test_handoff_rejects_missing_bound_vote_field(tmp_path: Path) -> None:
    handoff = _write_handoff(tmp_path / "handoff")
    votes_path = handoff / "votes.jsonl"
    first, *rest = votes_path.read_text().splitlines()
    payload = VoteRow.model_validate_json(first).model_dump(mode="json")
    del payload["reason"]
    votes_path.write_bytes(
        b"\n".join([canonical_json_bytes(payload), *(line.encode() for line in rest)]) + b"\n"
    )
    _refresh_manifest_hashes(handoff, "votes.jsonl")

    with pytest.raises(ValueError, match=r"votes\.jsonl record at line 1"):
        load_handoff(handoff)


@pytest.mark.parametrize(
    "mutation",
    [
        RouteMutation(physical_model="wrong-model"),
        RouteMutation(physical_provider="wrong-provider"),
    ],
    ids=["model", "provider"],
)
def test_routing_rejects_mismatch_in_any_physical_attempt(
    tmp_path: Path,
    mutation: RouteMutation,
) -> None:
    cell: LogicalCell = ("test:R1", "family-a", "S2xF1", BASELINE_EFFORT, 0)
    handoff = _write_handoff(
        tmp_path / "handoff",
        route_mutations={cell: mutation},
    )

    policy = AnalysisPolicy(stream_missing_rerun_rate=0.1)
    with pytest.raises(ValueError, match="routing requires stream reruns"):
        analyze_handoff(handoff, tmp_path / "out", policy=policy)


@pytest.mark.parametrize("arm", ["repeat", "effort"])
def test_handoff_rejects_duplicate_repeat_or_effort_logical_cell(
    tmp_path: Path,
    arm: str,
) -> None:
    handoff = _write_handoff(tmp_path / "handoff")
    _append_duplicate_cell(handoff, arm=arm)

    with pytest.raises(ValueError, match="duplicate logical cells across pilot arms"):
        load_handoff(handoff)


def test_effective_coverage_and_matched_pair_attrition_include_routing_drops(
    tmp_path: Path,
) -> None:
    cell: LogicalCell = ("test:R1", "family-a", "S2xF1", BASELINE_EFFORT, 0)
    handoff = _write_handoff(
        tmp_path / "handoff",
        route_mutations={cell: RouteMutation(physical_provider="wrong-provider")},
    )
    policy = AnalysisPolicy(stream_missing_rerun_rate=0.1, routing_rerun_rate=0.1)

    decisions = analyze_handoff(handoff, tmp_path / "out", policy=policy).decisions

    coverage = next(
        row
        for row in decisions.data_health.coverage
        if row.family_id == "family-a" and row.bundle_id == "S2xF1"
    )
    assert coverage.raw_observed == len(RELATIONS)
    assert coverage.routing_dropped == 1
    assert coverage.observed == len(RELATIONS) - 1
    assert coverage.missing == 1
    assert coverage.missing_rate == pytest.approx(1 / len(RELATIONS))
    assert not coverage.rerun_required
    routing = next(
        row
        for row in decisions.data_health.routing
        if row.family_id == "family-a" and row.bundle_id == "S2xF1"
    )
    assert routing.observed == len(RELATIONS)
    assert routing.violations == 1
    assert not routing.rerun_required
    flip = next(
        row
        for row in decisions.axis_statistics.flips
        if row.axis == "shell"
        and row.level_pair == "S1-S2"
        and row.contest_stratum == "all"
        and row.prescreen_stratum is None
    )
    expected_pairs = len(NON_HOLDOUTS) * len(FAMILIES) * 3
    assert flip.expected_pairs == expected_pairs
    assert flip.matched_pairs == expected_pairs - 1
    assert flip.missing_pairs == 1
    assert flip.rate.n == expected_pairs - 1


def test_qualification_reports_counts_and_both_mandatory_probes(tmp_path: Path) -> None:
    families = ("family-a", "family-b", "family-c", "family-d")
    overrides: dict[LogicalCell, VoteVerdict] = {
        ("wikidata:P6", "family-b", "S1xF1", BASELINE_EFFORT, 0): "proximal",
        ("wikidata:P1382", "family-c", "S1xF1", BASELINE_EFFORT, 0): "overlay",
        ("wikidata:P2634", "family-d", "S1xF1", BASELINE_EFFORT, 0): "proximal",
    }
    handoff = load_handoff(
        _write_handoff(
            tmp_path / "handoff",
            families=families,
            verdict_overrides=overrides,
        )
    )

    qualification = {row.family_id: row for row in _qualify(handoff, handoff.votes)}

    assert qualification["family-a"].correct_count == 6
    assert qualification["family-a"].passed
    assert qualification["family-b"].correct_count == 5
    assert qualification["family-b"].p1382_correct
    assert qualification["family-b"].p2634_correct
    assert qualification["family-b"].passed
    assert qualification["family-c"].correct_count == 5
    assert not qualification["family-c"].p1382_correct
    assert qualification["family-c"].p2634_correct
    assert not qualification["family-c"].passed
    assert qualification["family-d"].correct_count == 5
    assert qualification["family-d"].p1382_correct
    assert not qualification["family-d"].p2634_correct
    assert not qualification["family-d"].passed


def test_pruned_family_cannot_change_entropy_or_nominations(tmp_path: Path) -> None:
    families = (*FAMILIES, "family-c")
    prune_override: dict[LogicalCell, VoteVerdict] = {
        ("wikidata:P1382", "family-c", "S1xF1", BASELINE_EFFORT, 0): "overlay"
    }
    calm_overrides = prune_override | _all_grid_overrides("family-c", "coincident")
    noisy_overrides = dict(prune_override)
    noisy_verdicts: tuple[Verdict, ...] = ("unclear", "proximal")
    for bundle_index, bundle in enumerate(BUNDLES):
        for relation_index, relation_id in enumerate(NON_HOLDOUTS):
            cell: LogicalCell = (relation_id, "family-c", bundle, BASELINE_EFFORT, 0)
            verdict_index = bundle_index * len(NON_HOLDOUTS) + relation_index
            noisy_overrides[cell] = noisy_verdicts[verdict_index % len(noisy_verdicts)]
    calm = analyze_handoff(
        _write_handoff(
            tmp_path / "calm-handoff",
            families=families,
            verdict_overrides=calm_overrides,
        ),
        tmp_path / "calm-out",
    ).decisions
    noisy = analyze_handoff(
        _write_handoff(
            tmp_path / "noisy-handoff",
            families=families,
            verdict_overrides=noisy_overrides,
        ),
        tmp_path / "noisy-out",
    ).decisions

    assert calm.pruned_families == noisy.pruned_families == ["family-c"]
    assert calm.axis_statistics.entropy_tercile_cuts == noisy.axis_statistics.entropy_tercile_cuts
    assert calm.nomination_seeds == noisy.nomination_seeds


def test_entropy_rejects_a_non_holdout_with_no_eligible_votes(tmp_path: Path) -> None:
    handoff = load_handoff(_write_handoff(tmp_path / "handoff"))
    eligible = [
        vote
        for vote in handoff.votes
        if vote.family_id in FAMILIES
        and vote.effort == BASELINE_EFFORT
        and vote.repeat_index == 0
        and vote.relation_id in NON_HOLDOUTS
        and vote.relation_id != "test:R1"
        and vote.verdict != "ABSTAIN"
    ]

    with pytest.raises(ValueError, match="eligible panel has no nominal votes for test:R1"):
        _entropy_strata(handoff, eligible)


def test_missing_costs_make_escalation_unrankable_and_projection_incomplete(
    tmp_path: Path,
) -> None:
    decisions = analyze_handoff(
        _write_handoff(
            tmp_path / "handoff",
            missing_cost_families=frozenset(FAMILIES),
        ),
        tmp_path / "out",
    ).decisions

    assert decisions.escalation_order == []
    assert all(not row.rankable for row in decisions.escalation)
    assert all(row.cost_reported_n == 0 for row in decisions.escalation)
    assert all(row.yield_per_dollar_estimate.est is None for row in decisions.escalation)
    assert decisions.projected_grid_cost_usd is None
    assert decisions.projected_grid_cost.est is None
    assert decisions.projected_grid_cost.n > 0
    assert all(audit.cost_reported_n == 0 for audit in decisions.cost_audit)
    assert all(audit.projected_cost.est is None for audit in decisions.cost_audit)


def test_card_axis_disagreement_uses_linear_pair_weighting() -> None:
    observations: list[tuple[str, str, Verdict]] = [
        ("family-a", "S1xF1", "coincident"),
        ("family-a", "S1xF1", "coincident"),
        ("family-a", "S1xF1", "proximal"),
        ("family-b", "S1xF1", "overlay"),
        ("family-b", "S1xF1", "unclear"),
    ]

    # The first condition contributes two disagreeing pairs out of three and the second one out
    # of one, so the pooled linear disagreement is (2 + 1) / (3 + 1).
    assert _card_axis_disagreement(observations) == 0.75
