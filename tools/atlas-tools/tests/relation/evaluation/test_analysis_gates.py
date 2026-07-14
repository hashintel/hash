import pytest

from atlas_tools.relation.evaluation.analysis.api import (
    GridAnalysis,
    GridGateEvidence,
    GridGatePolicy,
    HoldoutRule,
    analyze_grid,
    grid_acceptance_gates,
)
from tests.relation.evaluation.test_analysis_grid import _FAMILIES, _card, _vote


def _gate_analysis() -> GridAnalysis:
    stable = _card("test:A-holdout")
    probe = _card("test:B-probe")
    votes = (
        _vote(stable, "judge/a", 0, "proximal"),
        _vote(stable, "judge/b", 0, "proximal"),
        _vote(probe, "judge/a", 0, "coincident"),
        _vote(probe, "judge/b", 0, "proximal"),
        _vote(probe, "judge/a", 1, "coincident"),
        _vote(probe, "judge/a", 2, "coincident"),
        _vote(probe, "judge/b", 1, "proximal"),
        _vote(probe, "judge/b", 2, "ABSTAIN"),
    )
    return analyze_grid(
        cards=(probe, stable),
        family_ids=_FAMILIES,
        imported_votes=(),
        fresh_votes=reversed(votes),
    )


def test_acceptance_gates_report_independent_blocking_failures_in_order() -> None:
    analysis = _gate_analysis()
    policy = GridGatePolicy(
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

    result = grid_acceptance_gates(
        analysis,
        policy=policy,
        evidence=GridGateEvidence(routing_violations=1),
    )

    assert tuple(gate.gate for gate in result.gates) == (
        "coverage",
        "routing",
        "holdout-drift",
        "abstention",
        "cost-envelope",
    )
    assert tuple(gate.passed for gate in result.gates) == (True, False, False, False, False)
    family_a, family_b = result.holdout_drift
    assert (family_a.family_id, family_a.correct, family_a.probes_correct, family_a.passed) == (
        "judge/a",
        2,
        True,
        True,
    )
    assert (family_b.family_id, family_b.correct, family_b.probes_correct, family_b.passed) == (
        "judge/b",
        1,
        False,
        False,
    )
    assert tuple((row.family_id, row.abstentions, row.rate) for row in result.abstention) == (
        ("judge/a", 0, 0.0),
        ("judge/b", 1, 0.25),
    )
    assert result.total_known_cost_usd == pytest.approx(0.8)
    assert not result.all_passed


def test_acceptance_thresholds_are_strict_for_abstention_and_inclusive_for_cost() -> None:
    analysis = _gate_analysis()
    policy = GridGatePolicy(
        holdouts=(
            HoldoutRule(
                relation_id="test:A-holdout",
                accepted_verdicts=frozenset({"proximal"}),
            ),
            HoldoutRule(
                relation_id="test:B-probe",
                accepted_verdicts=frozenset({"coincident", "proximal"}),
                probe=True,
            ),
        ),
        holdout_minimum_correct=2,
        abstention_ceiling=0.251,
        cost_ceiling_usd=0.8,
    )

    result = grid_acceptance_gates(analysis, policy=policy)

    assert tuple(gate.passed for gate in result.gates) == (True, True, True, True, True)
    assert result.all_passed
