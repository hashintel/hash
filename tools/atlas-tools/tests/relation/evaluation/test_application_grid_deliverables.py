from pathlib import Path

import pytest

from atlas_tools.common import sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import (
    GridAnalysis,
    GridGatePolicy,
    HoldoutRule,
    vote_economics,
)
from atlas_tools.relation.evaluation.application.grid_deliverables import (
    GridGatesBlockedError,
    GridRunSummary,
    derive_grid_deliverables,
    load_grid_deliverables,
    publish_grid_deliverables,
)
from atlas_tools.relation.evaluation.application.pilot_reporting import (
    PilotDecisionArtifact,
)
from atlas_tools.relation.evaluation.domain.api import FamilyGridCounts, Vote
from tests.relation.evaluation.test_analysis_gates import _gate_analysis, _gate_canaries
from tests.relation.evaluation.test_analysis_grid import _analysis, _vote
from tests.relation.evaluation.test_analysis_pilot import (
    _analyze as _pilot_analysis,
)
from tests.relation.evaluation.test_analysis_pilot import _cohort, _policy

_SOURCE_NAMES = (
    "attempts.jsonl",
    "cards.jsonl",
    "cards.manifest.json",
    "corpus.jsonl",
    "grid-config.yaml",
    "grid-manifest.json",
    "imported-attempts.jsonl",
    "imported-votes.jsonl",
    "judges-panel",
    "pilot-decisions.json",
    "pilot-votes.jsonl",
    "votes.jsonl",
)


def _pilot_decisions() -> PilotDecisionArtifact:
    manifest, _, _, _, _ = _cohort()
    return PilotDecisionArtifact.from_analysis(
        input_hashes={
            **dict(manifest.source_hashes),
            "manifest.json": sha256_bytes(b"manifest"),
        },
        manifest=manifest,
        policy=_policy(),
        analysis=_pilot_analysis(),
    )


def _sources() -> dict[str, str]:
    return {name: sha256_bytes(name.encode()) for name in _SOURCE_NAMES}


def _canaries(analysis: GridAnalysis) -> tuple[Vote, ...]:
    return tuple(
        _vote(card.card, family.family_id, 3, family.baseline.vote.verdict)
        for card in analysis.cards
        for family in card.families
    )


def _summary(analysis: GridAnalysis, canaries: tuple[Vote, ...]) -> GridRunSummary:
    economics = vote_economics(analysis, canary_votes=canaries)
    family_counts = tuple(
        FamilyGridCounts(
            family_id=row.family_id,
            imported_votes=row.imported_votes,
            fresh_baseline_votes=row.fresh_baseline_votes,
            refinement_votes=row.refinement_votes,
            canary_votes=row.canary_votes,
            abstentions=row.abstentions,
            known_cost_usd=row.known_cost_usd,
            cost_complete=row.cost_complete,
        )
        for row in economics.by_family
    )
    return GridRunSummary(
        pool_cards=economics.pool_cards,
        holdout_cards=2,
        shot_excluded_cards=0,
        total_votes=economics.total_votes,
        refined_cards=economics.refined_cards,
        realized_trigger_rate=economics.realized_trigger_rate,
        family_counts=family_counts,
    )


def _passing_policy() -> GridGatePolicy:
    return GridGatePolicy(
        holdouts=(
            HoldoutRule(
                relation_id="test:A-stable",
                accepted_verdicts=frozenset({"proximal"}),
            ),
            HoldoutRule(
                relation_id="test:B-refined",
                accepted_verdicts=frozenset({"coincident", "proximal"}),
            ),
        ),
        holdout_minimum_correct=2,
        abstention_ceiling=0.05,
        cost_ceiling_usd=1.0,
    )


def test_grid_bundle_materializes_review_evidence_and_is_byte_deterministic(
    tmp_path: Path,
) -> None:
    analysis = _analysis()
    canaries = _canaries(analysis)
    gate_policy = _passing_policy()
    products = derive_grid_deliverables(
        analysis,
        canary_votes=canaries,
        pilot_decisions=_pilot_decisions(),
        gate_policy=gate_policy,
        routing_violations=0,
    )

    assert tuple(row.relation_id for row in products.posteriors) == (
        "test:A-stable",
        "test:B-refined",
    )
    assert tuple(row.relation_id for row in products.coincident) == ("test:B-refined",)
    assert tuple((row.rank, row.relation_id) for row in products.nominations) == (
        (1, "test:B-refined"),
    )
    assert tuple((row.family_id, row.relation_id) for row in products.dissent) == (
        ("model/a", "test:H3"),
        ("model/c", "test:H1"),
    )
    assert all(len(row.missed_bundles) == 9 for row in products.dissent)
    assert products.gates.all_passed

    run = publish_grid_deliverables(
        products,
        summary=_summary(analysis, canaries),
        gate_policy=gate_policy,
        source_hashes=_sources(),
        output_directory=tmp_path,
    )

    observed_hashes = {
        path.name: sha256_bytes(path.read_bytes())
        for path in (
            run.posteriors_path,
            run.coincident_queue_path,
            run.nomination_queue_path,
            run.dissent_ledger_path,
            run.gates_path,
            run.report_path,
        )
    }
    assert observed_hashes == {
        "coincident-queue.jsonl": (
            "23cc5062d82b600e5e15fbae24859bf11aed4ee551175e95f5c4f9f10e0b62a6"
        ),
        "dissent-ledger.jsonl": (
            "5445177986481b0dfe76022c7d6e985626ded89f0d0a94ac91ded7837672c198"
        ),
        "gates.json": "e204489ca538df0588c338664923061e9f05cf27703b5fcb2b15b1114b2153e5",
        "nomination-queue.jsonl": (
            "b6543554d82a3be19bda7b6489aa4c5599636729077f2ee57a9d34a48c8e30bd"
        ),
        "posteriors.jsonl": ("0794b440cc2c0233b9fc52c895689a3bc9c2f9dc31ce8276a7e67c2258478750"),
        "report.md": "825019d0e89a47e3031d42ab812d9ef97df268eca8d042e649592ff6fff70b1e",
    }
    assert all(path.read_bytes().isascii() for path in tmp_path.iterdir())
    assert load_grid_deliverables(tmp_path, expected_source_hashes=_sources()) == run

    run.posteriors_path.write_bytes(run.posteriors_path.read_bytes() + b"\n")
    with pytest.raises(ValueError, match="content hashes disagree"):
        load_grid_deliverables(tmp_path)


def test_failed_gates_commit_the_audit_and_block_downstream_work(tmp_path: Path) -> None:
    analysis = _gate_analysis()
    canaries = _gate_canaries()
    gate_policy = GridGatePolicy(
        holdouts=(
            HoldoutRule(
                relation_id="test:A-holdout",
                accepted_verdicts=frozenset({"proximal"}),
            ),
            HoldoutRule(
                relation_id="test:B-probe",
                accepted_verdicts=frozenset({"coincident"}),
                probe=True,
            ),
        ),
        holdout_minimum_correct=2,
        abstention_ceiling=0.25,
        cost_ceiling_usd=0.5,
    )
    products = derive_grid_deliverables(
        analysis,
        canary_votes=canaries,
        pilot_decisions=_pilot_decisions(),
        gate_policy=gate_policy,
        routing_violations=1,
    )

    with pytest.raises(GridGatesBlockedError) as raised:
        publish_grid_deliverables(
            products,
            summary=_summary(analysis, canaries),
            gate_policy=gate_policy,
            source_hashes=_sources(),
            output_directory=tmp_path,
        )

    run = raised.value.run
    assert tuple(gate.gate for gate in run.products.gates.gates if not gate.passed) == (
        "routing",
        "holdout-drift",
        "abstention",
        "cost-envelope",
    )
    assert not run.artifact.report.accepted
    assert run.gates_path.is_file()
    assert b"- Acceptance: BLOCKED." in run.report_path.read_bytes()
    assert load_grid_deliverables(tmp_path) == run
