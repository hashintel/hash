from pathlib import Path

import pytest
import trio

from atlas_tools.relation.evaluation.application.pilot_analysis import (
    analyze_handoff,
    load_pilot_handoff_async,
)
from atlas_tools.relation.evaluation.application.pilot_reporting import (
    PilotDecisionArtifact,
    write_pilot_artifacts,
)

_ROOT = Path(__file__).parents[3]
_PAID = _ROOT / "runs/evaluate"
_CARDS = _ROOT / "runs/cards"


def test_paid_handoff_writes_legacy_named_ascii_artifacts_with_typed_dissent_evidence(
    tmp_path: Path,
) -> None:
    result = analyze_handoff(_PAID, tmp_path)

    assert result.decisions_hash == (
        "a0dba9178ea0d31426a7bb5a8cfdee2b43cfb9caa0822272bad564386fc14669"
    )
    assert result.report_hash == (
        "2bc3cab2fa122545e388a38dd497cc8849fb0b5f5eee1550b06fc8fe98f6ec24"
    )
    assert result.decisions_json == tmp_path / "decisions.json"
    assert result.report_md == tmp_path / "report.md"
    assert result.decisions.pruned_families == (
        "inception/mercury-2",
        "nvidia/nemotron-3-ultra-550b-a55b",
        "openai/gpt-5.6-luna",
    )
    assert result.decisions.admitted_shells == ("S1",)
    assert result.decisions.admitted_framings == ("F1",)
    assert result.decisions.projected_grid_cost_usd == pytest.approx(209.36791926066667)
    assert len(result.decisions.holdout_correctness) == 486
    assert next(
        row
        for row in result.decisions.holdout_correctness
        if row.family_id == "anthropic/claude-opus-4.8"
        and row.bundle_id == "S3xF3"
        and row.relation_id == "wikidata:P3403"
    ).model_dump() == {
        "accepted_verdicts": ("coincident", "proximal"),
        "bundle_id": "S3xF3",
        "correct": True,
        "family_id": "anthropic/claude-opus-4.8",
        "mandatory_probe": False,
        "relation_id": "wikidata:P3403",
        "verdict": "proximal",
    }

    decision_bytes = result.decisions_json.read_bytes()
    report_bytes = result.report_md.read_bytes()
    assert decision_bytes.isascii()
    assert report_bytes.isascii()
    assert b"Admitted framings: F1" in report_bytes
    assert b"template" not in report_bytes.lower()
    assert (
        PilotDecisionArtifact.model_validate_json(decision_bytes, strict=True) == result.decisions
    )

    repeated = write_pilot_artifacts(tmp_path, result.decisions)
    assert (repeated.decisions_hash, repeated.report_hash) == (
        result.decisions_hash,
        result.report_hash,
    )


def test_handoff_loader_rejects_byte_drift_even_when_rows_still_parse(
    tmp_path: Path,
) -> None:
    handoff = tmp_path / "evaluate"
    handoff.mkdir()
    (handoff / "manifest.json").write_bytes((_PAID / "manifest.json").read_bytes())
    (handoff / "slice.jsonl").write_bytes((_PAID / "slice.jsonl").read_bytes() + b"\n")
    for name in ("attempts.jsonl", "votes.jsonl"):
        (handoff / name).symlink_to(_PAID / name)

    async def scenario() -> None:
        with pytest.raises(ValueError, match=r"source digests differ.*slice\.jsonl"):
            await load_pilot_handoff_async(handoff, _CARDS)

    trio.run(scenario)
