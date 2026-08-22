import pytest

from atlas_tools.relation.evaluation.analysis.api import (
    GridAnalysis,
    GridGateEvidence,
    GridGatePolicy,
    HoldoutRule,
    analyze_grid,
    grid_acceptance_gates,
)
from atlas_tools.relation.evaluation.domain.api import Vote, VoteVerdict
from tests.relation.evaluation.test_analysis_grid import (
    _FAMILIES,
    _FAMILY_A,
    _FAMILY_B,
    _card,
    _vote,
)


def _gate_analysis(*, incomplete_fresh_cost: bool = False) -> GridAnalysis:
    stable = _card("test:A-holdout")
    probe = _card("test:B-probe")
    votes = (
        _vote(stable, _FAMILY_A, 0, "proximal"),
        _vote(stable, _FAMILY_B, 0, "proximal"),
        _vote(probe, _FAMILY_A, 0, "coincident"),
        _vote(probe, _FAMILY_B, 0, "proximal"),
        _vote(probe, _FAMILY_A, 1, "coincident"),
        _vote(probe, _FAMILY_A, 2, "coincident"),
        _vote(probe, _FAMILY_B, 1, "proximal"),
        _vote(
            probe,
            _FAMILY_B,
            2,
            "ABSTAIN",
            cost_complete=not incomplete_fresh_cost,
        ),
    )
    return analyze_grid(
        cards=(probe, stable),
        family_ids=_FAMILIES,
        imported_votes=(),
        fresh_votes=reversed(votes),
    )


def _gate_canaries(*, family_b_probe: VoteVerdict = "ABSTAIN") -> tuple[Vote, ...]:
    stable = _card("test:A-holdout")
    probe = _card("test:B-probe")
    return (
        _vote(stable, _FAMILY_A, 3, "proximal"),
        _vote(stable, _FAMILY_B, 3, "proximal"),
        _vote(probe, _FAMILY_A, 3, "coincident"),
        _vote(probe, _FAMILY_B, 3, family_b_probe),
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
        canary_votes=_gate_canaries(),
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
        ("judge/b", 2, 1 / 3),
    )
    assert result.total_known_cost_usd == pytest.approx(1.2)
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
        cost_ceiling_usd=1.2,
    )

    result = grid_acceptance_gates(
        analysis,
        canary_votes=_gate_canaries(family_b_probe="proximal"),
        policy=policy,
    )

    assert tuple(gate.passed for gate in result.gates) == (True, True, True, True, True)
    assert result.all_passed


def test_cost_gate_fails_closed_when_fresh_billing_is_incomplete() -> None:
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
        cost_ceiling_usd=1.0,
    )

    result = grid_acceptance_gates(
        _gate_analysis(incomplete_fresh_cost=True),
        canary_votes=_gate_canaries(family_b_probe="proximal"),
        policy=policy,
    )

    cost_gate = result.gates[-1]
    assert not result.cost_complete
    assert result.total_known_cost_usd == pytest.approx(1.2)
    assert (cost_gate.gate, cost_gate.passed) == ("cost-envelope", False)
    assert cost_gate.detail == "incomplete fresh billing; known cost $1.20 vs ceiling $1.00"
    assert not result.all_passed


def test_holdout_gate_rejects_missing_fresh_canary_cells() -> None:
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
    )

    with pytest.raises(ValueError, match="holdout canary lacks"):
        grid_acceptance_gates(
            _gate_analysis(),
            canary_votes=_gate_canaries(family_b_probe="proximal")[:-1],
            policy=policy,
        )
