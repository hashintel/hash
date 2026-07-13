import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import pytest

from atlas_tools.common import canonical_json_bytes, sha256_bytes, write_sidecar
from atlas_tools.relation.eval.analysis import analyze_handoff, load_handoff
from atlas_tools.relation.eval.prompt import HOLDOUT
from atlas_tools.relation.eval.schema import (
    BUNDLES,
    AnalysisDecisions,
    BundleId,
    ExpectedGrid,
    FramingId,
    HandoffManifest,
    JudgePin,
    RunDates,
    ShellId,
    SliceRow,
    Verdict,
    VoteRow,
)

FAMILIES = ("family-a", "family-b")
MODELS = {"family-a": "model-a", "family-b": "model-b"}
PROMPT_HASH = "a" * 64
RUBRIC = "rubric-v1"
NON_HOLDOUTS = ("R1", "R2", "R3", "R4", "R5", "R6")
HOLDOUTS: dict[str, Verdict] = {str(provider_id): verdict for _, provider_id, verdict in HOLDOUT}
RELATIONS = (*sorted(HOLDOUTS), *NON_HOLDOUTS)
START = datetime(2026, 1, 1, tzinfo=UTC)


def _card_hash(relation_id: str) -> str:
    return sha256_bytes(relation_id.encode())


def _verdict(  # noqa: PLR0911
    family: str, bundle: BundleId, relation_id: str
) -> Verdict:
    if relation_id in HOLDOUTS:
        return HOLDOUTS[relation_id]
    shell, framing = bundle.split("x")
    if relation_id == "R1":
        return "proximal"
    if relation_id == "R2":
        return "overlay"
    if relation_id == "R3":
        return "coincident" if family == "family-a" else "overlay"
    if relation_id == "R4":
        choices: tuple[Verdict, ...] = ("coincident", "proximal", "overlay", "unclear")
        return choices[(int(shell[1]) + int(framing[1]) + (family == "family-b")) % 4]
    if relation_id == "R5":
        return "unclear" if family == "family-b" and bundle == "S3xF3" else "proximal"
    return "coincident" if framing == "F3" else "overlay"


def _vote(
    *,
    vote_id: str,
    family: str,
    bundle: BundleId,
    relation_id: str,
    effort: str = "minimal",
    repeat_index: int = 0,
    model_returned: str | None = None,
) -> VoteRow:
    shell_text, framing_text = bundle.split("x")
    shell = cast("ShellId", shell_text)
    framing = cast("FramingId", framing_text)
    verdict = _verdict(family, bundle, relation_id)
    reason = "P1-P3 hold" if verdict == "proximal" else "fails P2"
    return VoteRow(
        vote_id=vote_id,
        relation_id=relation_id,
        card_hash=_card_hash(relation_id),
        family_id=family,
        provider="test-provider",
        model_returned=model_returned or MODELS[family],
        shell_id=shell,
        framing_id=framing,
        bundle_id=bundle,
        rubric_version=RUBRIC,
        prompt_pack_hash=PROMPT_HASH,
        verdict=verdict,
        reason=reason,
        raw_completion=f'{{"reason":"{reason}","verdict":"{verdict}"}}',
        parse_retries=0,
        abstained=False,
        effort=effort,
        temperature=0.0,
        seed=7,
        repeat_index=repeat_index,
        tokens_in=7500,
        tokens_out=50,
        tokens_cached=7000,
        cost_usd=0.01 if family == "family-a" else 0.02,
        ts_request=START,
        ts_response=START + timedelta(seconds=2),
    )


def _write_handoff(directory: Path, *, bad_route: bool = False) -> Path:
    directory.mkdir()
    slice_rows = [
        SliceRow(
            relation_id=relation_id,
            card_hash=_card_hash(relation_id),
            prescreen_stratum="anchor" if relation_id in HOLDOUTS else f"s{index % 2}",
            token_count=100 + index,
            is_holdout=relation_id in HOLDOUTS,
            holdout_verdict=HOLDOUTS.get(relation_id),
            sampling_seed=42,
        )
        for index, relation_id in enumerate(RELATIONS)
    ]
    (directory / "slice.jsonl").write_text(
        "".join(
            canonical_json_bytes(row).decode() + "\n"
            for row in sorted(slice_rows, key=lambda row: row.relation_id)
        ),
        encoding="utf-8",
    )

    votes: list[VoteRow] = []
    vote_number = 0
    for family in FAMILIES:
        for bundle in BUNDLES:
            for relation_id in RELATIONS:
                vote_number += 1
                wrong_model = (
                    "wrong-model"
                    if bad_route
                    and family == "family-a"
                    and bundle == "S1xF1"
                    and relation_id == "R1"
                    else None
                )
                votes.append(
                    _vote(
                        vote_id=f"v{vote_number:04d}",
                        family=family,
                        bundle=bundle,
                        relation_id=relation_id,
                        model_returned=wrong_model,
                    )
                )

    for family in FAMILIES:
        for relation_id in NON_HOLDOUTS:
            vote_number += 1
            votes.append(
                _vote(
                    vote_id=f"v{vote_number:04d}",
                    family=family,
                    bundle="S1xF1",
                    relation_id=relation_id,
                    repeat_index=1,
                )
            )
        for relation_id in RELATIONS:
            vote_number += 1
            votes.append(
                _vote(
                    vote_id=f"v{vote_number:04d}",
                    family=family,
                    bundle="S1xF1",
                    relation_id=relation_id,
                    effort="high",
                )
            )

    (directory / "votes.jsonl").write_text(
        "".join(canonical_json_bytes(vote).decode() + "\n" for vote in votes),
        encoding="utf-8",
    )
    manifest = HandoffManifest(
        schema_version=1,
        expected_grid=ExpectedGrid(
            families=list(FAMILIES),
            bundles=list(BUNDLES),
            relation_ids=list(RELATIONS),
        ),
        run_dates=RunDates(started_at=START, completed_at=START + timedelta(hours=1)),
        judges=[
            JudgePin(family_id=family, provider="test-provider", model=MODELS[family])
            for family in FAMILIES
        ],
        prompt_pack_hash=PROMPT_HASH,
        rubric_version=RUBRIC,
        baseline_effort="minimal",
        full_grid_card_count=100,
    )
    write_sidecar(directory / "manifest.json", manifest.model_dump(mode="json"))
    return directory


def test_analysis_runs_end_to_end_and_is_byte_deterministic(tmp_path: Path) -> None:
    handoff = _write_handoff(tmp_path / "handoff")

    first = analyze_handoff(handoff, tmp_path / "first")
    second = analyze_handoff(handoff, tmp_path / "second")

    assert first.decisions_json.read_bytes() == second.decisions_json.read_bytes()
    assert first.report_md.read_bytes() == second.report_md.read_bytes()
    decisions = AnalysisDecisions.model_validate_json(first.decisions_json.read_text())
    assert decisions.pruned_families == []
    assert [result.correct_count for result in decisions.qualification] == [6, 6]
    assert len(decisions.per_card_posteriors) == len(RELATIONS)
    assert decisions.axis_statistics.noise_floor.est == 0.0
    assert decisions.projected_grid_cost_usd is not None
    assert decisions.projected_grid_cost.est == decisions.projected_grid_cost_usd
    assert decisions.projected_grid_cost.n > 0
    assert decisions.nomination_seeds
    report = first.report_md.read_text()
    assert "## Phase 0 — validation and data health" in report
    assert "## Phase 3 — decisions" in report
    assert "card-cluster bootstrap" in report


def test_handoff_rejects_missing_bound_vote_field(tmp_path: Path) -> None:
    handoff = _write_handoff(tmp_path / "handoff")
    votes_path = handoff / "votes.jsonl"
    first, *rest = votes_path.read_text().splitlines()
    payload = json.loads(first)
    del payload["reason"]
    malformed = json.dumps(payload)
    votes_path.write_text("\n".join([malformed, *rest]) + "\n")

    with pytest.raises(ValueError, match=r"votes\.jsonl record at line 1"):
        load_handoff(handoff)


def test_analysis_blocks_stream_with_routing_violation_above_threshold(tmp_path: Path) -> None:
    handoff = _write_handoff(tmp_path / "handoff", bad_route=True)

    with pytest.raises(ValueError, match="routing requires stream reruns"):
        analyze_handoff(handoff, tmp_path / "out")
