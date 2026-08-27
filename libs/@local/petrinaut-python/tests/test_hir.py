"""Tests for the serialized-HIR evaluator against fixtures lowered by the
real TypeScript frontend (`hir_fixtures.json`, generated from
`lowerOptimizationConstraint` in `@hashintel/petrinaut-core`)."""

import json
from pathlib import Path

import pytest

from petrinaut import Constraint, HirEvaluationError, evaluate_hir

FIXTURES = json.loads(
    (Path(__file__).parent / "hir_fixtures.json").read_text(encoding="utf-8")
)


def constraint(name: str) -> Constraint:
    fixture = FIXTURES[name]
    return Constraint({"id": name, "code": fixture["code"], "hir": fixture["hir"]})


class TestParameterSpace:
    def test_ordering(self) -> None:
        ordering = constraint("ordering")
        assert ordering(scenario={"min_load": 2, "max_load": 8}) is True
        assert ordering(scenario={"min_load": 8, "max_load": 2}) is False

    def test_compound_short_circuit_and_boolean(self) -> None:
        compound = constraint("compound")
        assert (
            compound(
                scenario={"min_load": 1, "max_load": 4, "turbo": False},
                parameters={"rate": 1.5},
            )
            is True
        )
        assert (
            compound(
                scenario={"min_load": 1, "max_load": 4, "turbo": False},
                parameters={"rate": 0.0},
            )
            is False
        )
        # turbo rescues a non-positive rate through the `||`.
        assert (
            compound(
                scenario={"min_load": 1, "max_load": 4, "turbo": True},
                parameters={"rate": 0.0},
            )
            is True
        )

    def test_math_matches_ecmascript_rounding(self) -> None:
        math_case = constraint("math")
        # |2 - 4.5| = 2.5 → Math.round gives 3 in JS (half away from
        # negative), so the constraint holds; Python's round(2.5) is 2.
        assert math_case(scenario={"min_load": 2, "max_load": 4.5}) is True
        assert math_case(scenario={"min_load": 2, "max_load": 3.4}) is False

    def test_ternary(self) -> None:
        ternary = constraint("ternary")
        assert ternary(scenario={"turbo": True, "max_load": 9}) is True
        assert ternary(scenario={"turbo": False, "max_load": 9}) is False

    def test_strict_equality_keeps_booleans_apart(self) -> None:
        strict = constraint("strictEquality")
        assert strict(scenario={"min_load": 1}) is True
        # JS: `true === 1` is false; Python's `True == 1` must not leak in.
        assert strict(scenario={"min_load": True}) is False

    def test_unknown_scenario_parameter_raises(self) -> None:
        ordering = constraint("ordering")
        with pytest.raises(HirEvaluationError, match="min_load"):
            ordering(scenario={"max_load": 8})


class TestStateSpace:
    def test_state_bound(self) -> None:
        bound = constraint("stateBound")
        assert bound(state={"places": {"Queue": {"count": 7}}}) is True
        assert bound(state={"places": {"Queue": {"count": 11}}}) is False

    def test_state_block_with_reduce(self) -> None:
        block = constraint("stateBlock")
        state = {
            "places": {"Queue": {"count": 3, "tokens": [{}, {}, {}]}},
        }
        assert block(state=state) is True
        state_over = {
            "places": {
                "Queue": {"count": 6, "tokens": [{}, {}, {}, {}, {}, {}]},
            },
        }
        assert block(state=state_over) is False


class TestMargin:
    def test_comparison_slack(self) -> None:
        ordering = constraint("ordering")
        assert ordering.margin(scenario={"min_load": 2, "max_load": 8}) == 6.0
        assert ordering.margin(scenario={"min_load": 8, "max_load": 2}) == -6.0

    def test_and_takes_the_minimum(self) -> None:
        compound = constraint("compound")
        margin = compound.margin(
            scenario={"min_load": 1, "max_load": 4, "turbo": False},
            parameters={"rate": 0.5},
        )
        # min(4 - 1, max(0.5 - 0, -inf)) = 0.5
        assert margin == 0.5

    def test_boolean_leaf_is_infinite(self) -> None:
        compound = constraint("compound")
        margin = compound.margin(
            scenario={"min_load": 1, "max_load": 9, "turbo": True},
            parameters={"rate": -1.0},
        )
        # The `|| turbo` arm is +inf, so the && is bounded by 9 - 1.
        assert margin == 8.0

    def test_sign_agrees_with_the_boolean(self) -> None:
        for name in ("ordering", "ternary", "strictEquality"):
            case = constraint(name)
            for scenario in (
                {"min_load": 2, "max_load": 8, "turbo": True},
                {"min_load": 8, "max_load": 2, "turbo": False},
                {"min_load": 1, "max_load": 6, "turbo": False},
            ):
                satisfied = case(scenario=scenario)
                margin = case.margin(scenario=scenario)
                assert (margin >= 0) == satisfied, (name, scenario)


class TestRejections:
    def test_unknown_node_kind_raises(self) -> None:
        with pytest.raises(HirEvaluationError, match="mystery"):
            evaluate_hir(
                {
                    "hirVersion": 1,
                    "surface": "scenario-expression",
                    "params": [],
                    "body": {"kind": "mystery"},
                }
            )

    def test_distribution_rejected(self) -> None:
        with pytest.raises(HirEvaluationError, match="distribution"):
            evaluate_hir(
                {
                    "hirVersion": 1,
                    "surface": "scenario-expression",
                    "params": [],
                    "body": {"kind": "distribution", "dist": "Gaussian", "args": []},
                }
            )

    def test_wrong_version_rejected(self) -> None:
        with pytest.raises(HirEvaluationError, match="version"):
            evaluate_hir({"hirVersion": 2, "params": [], "body": {"kind": "boolLit"}})

    def test_non_boolean_constraint_result_raises(self) -> None:
        fixture = FIXTURES["ordering"]
        # Evaluate the raw comparison fine, but a Constraint demanding a
        # boolean rejects a numeric body.
        numeric = Constraint(
            {
                "id": "numeric",
                "code": "1 + 1",
                "hir": {
                    "hirVersion": 1,
                    "surface": "scenario-expression",
                    "params": fixture["hir"]["params"],
                    "body": {
                        "kind": "numberLit",
                        "id": 0,
                        "span": {"start": 0, "length": 1},
                        "value": 2,
                        "raw": "2",
                    },
                },
            }
        )
        with pytest.raises(HirEvaluationError, match="boolean"):
            numeric(scenario={})
