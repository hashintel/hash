"""Tests for the serialized-HIR evaluator against fixtures lowered by the
real TypeScript frontend (`hir_fixtures.json`, generated from
`lowerOptimizationConstraint` in `@hashintel/petrinaut-core`)."""

import json
import math
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

    def test_strict_boundary_is_violated(self) -> None:
        # `min_load < max_load` at equality is false, so the margin must go
        # negative there rather than reporting a satisfied-looking zero.
        ordering = constraint("ordering")
        boundary = ordering.margin(scenario={"min_load": 5, "max_load": 5})
        assert boundary < 0
        assert not ordering(scenario={"min_load": 5, "max_load": 5})

    def test_sign_agrees_with_the_boolean(self) -> None:
        for name in ("ordering", "ternary", "strictEquality"):
            case = constraint(name)
            for scenario in (
                {"min_load": 2, "max_load": 8, "turbo": True},
                {"min_load": 8, "max_load": 2, "turbo": False},
                {"min_load": 1, "max_load": 6, "turbo": False},
                {"min_load": 4, "max_load": 4, "turbo": False},
            ):
                satisfied = case(scenario=scenario)
                margin = case.margin(scenario=scenario)
                assert (margin >= 0) == satisfied, (name, scenario)


class TestStringNodes:
    @staticmethod
    def _node(kind: str, **fields: object) -> dict[str, object]:
        return {"kind": kind, "id": 0, "span": {"start": 0, "length": 1}, **fields}

    def _constraint(self, body: dict[str, object]) -> Constraint:
        return Constraint(
            {
                "id": "strings",
                "code": "<inline>",
                "hir": {
                    "hirVersion": 1,
                    "surface": "scenario-expression",
                    "params": [],
                    "body": body,
                },
            }
        )

    def test_string_methods_evaluate(self) -> None:
        def lit(value: str) -> dict[str, object]:
            return self._node("stringLit", value=value)

        for fn, target, argument, expected in (
            ("startsWith", "pump-3", "pump", True),
            ("endsWith", "pump-3", "-3", True),
            ("includes", "pump-3", "mp", True),
            ("includes", "pump-3", "xyz", False),
        ):
            case = self._constraint(
                self._node(
                    "stringCall", fn=fn, target=lit(target), argument=lit(argument)
                )
            )
            assert case(scenario={}) is expected, (fn, target, argument)

    def test_string_length(self) -> None:
        body = self._node(
            "binary",
            op=">",
            left=self._node("length", target=self._node("stringLit", value="abc")),
            right=self._node("numberLit", value=2, raw="2"),
        )
        assert self._constraint(body)(scenario={}) is True


class TestJsMathEdges:
    """The evaluator's arithmetic must match ECMAScript at the edges Python
    diverges: domain errors, overflow, and exponentiation."""

    @staticmethod
    def _num(value: float) -> dict[str, object]:
        return {
            "kind": "numberLit",
            "id": 0,
            "span": {"start": 0, "length": 1},
            "value": value,
            "raw": repr(value),
        }

    def _eval(self, body: dict[str, object]) -> object:
        return evaluate_hir(
            {
                "hirVersion": 1,
                "surface": "scenario-expression",
                "params": [],
                "body": body,
            }
        )

    def _math(self, fn: str, *args: float) -> object:
        return self._eval(
            {
                "kind": "mathCall",
                "id": 0,
                "span": {"start": 0, "length": 1},
                "fn": fn,
                "args": [self._num(argument) for argument in args],
            }
        )

    def _pow(self, base: float, exponent: float) -> object:
        return self._eval(
            {
                "kind": "binary",
                "id": 0,
                "span": {"start": 0, "length": 1},
                "op": "**",
                "left": self._num(base),
                "right": self._num(exponent),
            }
        )

    def test_log_family_matches_js(self) -> None:
        assert self._math("log", 0) == -math.inf
        assert math.isnan(self._math("log", -1))  # type: ignore[arg-type]
        assert self._math("log10", 0) == -math.inf
        assert self._math("log2", 0) == -math.inf

    def test_overflow_grows_to_infinity(self) -> None:
        assert self._math("exp", 1000) == math.inf
        assert self._math("cosh", 1000) == math.inf
        assert self._math("sinh", -1000) == -math.inf

    def test_pow_matches_js(self) -> None:
        # Python raises ZeroDivisionError / OverflowError or goes complex
        # for every one of these; JS defines them all.
        assert self._pow(0, -1) == math.inf
        assert self._pow(1e308, 2) == math.inf
        assert self._pow(-1e308, 3) == -math.inf
        assert math.isnan(self._pow(-8, 1 / 3))  # type: ignore[arg-type]
        assert math.isnan(self._pow(1, math.inf))  # type: ignore[arg-type]
        assert self._pow(-2, 3) == -8
        assert self._math("pow", 0, -1) == math.inf

    def test_integral_functions_pass_non_finite_through(self) -> None:
        assert self._math("ceil", math.inf) == math.inf
        assert self._math("floor", -math.inf) == -math.inf
        assert math.isnan(self._math("round", math.nan))  # type: ignore[arg-type]
        assert self._math("round", math.inf) == math.inf


class TestNanMargins:
    """A NaN slack resolves at the comparison leaf with the boolean's sign,
    so `min`/`max` in compounds can never drop it by argument order."""

    @staticmethod
    def _node(kind: str, **fields: object) -> dict[str, object]:
        return {"kind": kind, "id": 0, "span": {"start": 0, "length": 1}, **fields}

    def _constraint(self, body: dict[str, object]) -> Constraint:
        return Constraint(
            {
                "id": "nan-margins",
                "code": "<inline>",
                "hir": {
                    "hirVersion": 1,
                    "surface": "scenario-expression",
                    "params": [],
                    "body": body,
                },
            }
        )

    def _num(self, value: float) -> dict[str, object]:
        return self._node("numberLit", value=value, raw=repr(value))

    def _nan_leaf(self) -> dict[str, object]:
        # Math.sqrt(-1) > 2 — false in JS, its slack NaN in Python.
        return self._node(
            "binary",
            op=">",
            left=self._node("mathCall", fn="sqrt", args=[self._num(-1)]),
            right=self._num(2),
        )

    def _sat_leaf(self) -> dict[str, object]:
        return self._node("binary", op="<", left=self._num(5), right=self._num(9))

    def test_and_with_nan_slack_reads_unsatisfied(self) -> None:
        for left, right in (
            (self._nan_leaf(), self._sat_leaf()),
            (self._sat_leaf(), self._nan_leaf()),
        ):
            case = self._constraint(
                self._node("binary", op="&&", left=left, right=right)
            )
            assert case(scenario={}) is False
            assert case.margin(scenario={}) < 0

    def test_or_with_nan_slack_follows_the_boolean(self) -> None:
        rescued = self._constraint(
            self._node("binary", op="||", left=self._nan_leaf(), right=self._sat_leaf())
        )
        assert rescued(scenario={}) is True
        assert rescued.margin(scenario={}) >= 0

    def test_negated_nan_comparison_reads_satisfied(self) -> None:
        negated = self._constraint(
            self._node("unary", op="!", operand=self._nan_leaf())
        )
        assert negated(scenario={}) is True
        assert negated.margin(scenario={}) >= 0

    def test_nan_equality_margins(self) -> None:
        sqrt_neg = self._node("mathCall", fn="sqrt", args=[self._num(-1)])
        unequal = self._constraint(
            self._node("binary", op="!=", left=sqrt_neg, right=self._num(5))
        )
        assert unequal(scenario={}) is True
        assert unequal.margin(scenario={}) >= 0


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
