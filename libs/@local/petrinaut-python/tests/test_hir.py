"""Test the serialized-HIR evaluator against lowered fixtures.

The real TypeScript frontend (`hir_fixtures.json`, generated from
`lowerConstraint` in `@hashintel/petrinaut-core`).
"""

import json
import math
from pathlib import Path

import pytest
from pydantic import ValidationError

from petrinaut import (
    HirEvaluationError,
    ParameterConstraint,
    StateConstraint,
    evaluate_hir,
)
from petrinaut.hir import Value

SPAN = {"start": 0, "length": 1}

FIXTURES = json.loads((Path(__file__).parent / "hir_fixtures.json").read_text(encoding="utf-8"))


def constraint(name: str) -> ParameterConstraint:
    fixture = FIXTURES[name]
    data = {
        "space": fixture["space"],
        "id": name,
        "code": fixture["code"],
        "hir": fixture["hir"],
    }
    return ParameterConstraint.model_validate(data)


def state_fixture(name: str) -> StateConstraint:
    fixture = FIXTURES[name]
    return StateConstraint.model_validate({
        "space": fixture["space"],
        "id": name,
        "code": fixture["code"],
        "hir": fixture["hir"],
    })


def parameter_constraint(
    id_: str, body: dict[str, object], code: str = "<inline>"
) -> ParameterConstraint:
    return ParameterConstraint.model_validate({
        "space": "parameters",
        "id": id_,
        "code": code,
        "hir": {
            "hirVersion": 1,
            "surface": "scenario-expression",
            "params": [],
            "span": SPAN,
            "body": body,
        },
    })


def state_constraint(id_: str, body: dict[str, object], param: str) -> StateConstraint:
    return StateConstraint.model_validate({
        "space": "state",
        "id": id_,
        "code": "<inline>",
        "hir": {
            "hirVersion": 1,
            "surface": "metric",
            "params": [{"name": param, "span": SPAN}],
            "span": SPAN,
            "body": body,
        },
    })


class TestParameterSpace:
    @staticmethod
    def test_ordering() -> None:
        ordering = constraint("ordering")
        assert ordering(scenario={"min_load": 2, "max_load": 8}) is True
        assert ordering(scenario={"min_load": 8, "max_load": 2}) is False

    @staticmethod
    def test_compound_short_circuit() -> None:
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

    @staticmethod
    def test_math_rounding() -> None:
        math_case = constraint("math")
        # |2 - 4.5| = 2.5 → Math.round gives 3 in JS (half away from
        # negative), so the constraint holds; Python's round(2.5) is 2.
        assert math_case(scenario={"min_load": 2, "max_load": 4.5}) is True
        assert math_case(scenario={"min_load": 2, "max_load": 3.4}) is False

    @staticmethod
    def test_ternary() -> None:
        ternary = constraint("ternary")
        assert ternary(scenario={"turbo": True, "max_load": 9}) is True
        assert ternary(scenario={"turbo": False, "max_load": 9}) is False

    @staticmethod
    def test_equality_boolean_number() -> None:
        strict = constraint("strictEquality")
        assert strict(scenario={"min_load": 1}) is True
        # JS: `true === 1` is false; Python's `True == 1` must not leak in.
        assert strict(scenario={"min_load": True}) is False

    @staticmethod
    def test_scenario_missing_parameter() -> None:
        ordering = constraint("ordering")
        with pytest.raises(HirEvaluationError, match="min_load"):
            ordering(scenario={"max_load": 8})


class TestStateSpace:
    @staticmethod
    def test_state_bound() -> None:
        bound = state_fixture("stateBound")
        assert bound(state={"places": {"Queue": {"count": 7}}}) is True
        assert bound(state={"places": {"Queue": {"count": 11}}}) is False

    @staticmethod
    def test_state_reduce() -> None:
        block = state_fixture("stateBlock")
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
    @staticmethod
    def test_comparison_slack() -> None:
        ordering = constraint("ordering")
        assert ordering.margin(scenario={"min_load": 2, "max_load": 8}) == 6
        assert ordering.margin(scenario={"min_load": 8, "max_load": 2}) == -6

    @staticmethod
    def test_and_minimum() -> None:
        compound = constraint("compound")
        margin = compound.margin(
            scenario={"min_load": 1, "max_load": 4, "turbo": False},
            parameters={"rate": 0.5},
        )
        # min(4 - 1, max(0.5 - 0, -inf)) = 0.5
        assert margin.as_integer_ratio() == (1, 2)

    @staticmethod
    def test_boolean_leaf_infinite() -> None:
        compound = constraint("compound")
        margin = compound.margin(
            scenario={"min_load": 1, "max_load": 9, "turbo": True},
            parameters={"rate": -1.0},
        )
        # The `|| turbo` arm is +inf, so the && is bounded by 9 - 1.
        assert margin == 8

    @staticmethod
    def test_strict_boundary_violated() -> None:
        # `min_load < max_load` at equality is false, so the margin must go
        # negative there rather than reporting a satisfied-looking zero.
        ordering = constraint("ordering")
        boundary = ordering.margin(scenario={"min_load": 5, "max_load": 5})
        assert boundary < 0
        assert not ordering(scenario={"min_load": 5, "max_load": 5})

    @staticmethod
    def test_margin_boolean_parity() -> None:
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

    @staticmethod
    def _constraint(body: dict[str, object]) -> ParameterConstraint:
        return parameter_constraint("strings", body)

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
                self._node("stringCall", fn=fn, target=lit(target), argument=lit(argument))
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
    """ECMAScript arithmetic at Python's divergent edges.

    Cover domain errors, overflow and exponentiation.
    """

    @staticmethod
    def _num(value: float) -> dict[str, object]:
        return {
            "kind": "numberLit",
            "id": 0,
            "span": {"start": 0, "length": 1},
            "value": value,
            "raw": repr(value),
        }

    @staticmethod
    def _eval(body: dict[str, object]) -> float:
        result = evaluate_hir({
            "hirVersion": 1,
            "surface": "scenario-expression",
            "params": [],
            "span": SPAN,
            "body": body,
        })
        assert isinstance(result, (int, float))
        return result

    def _math(self, fn: str, *args: float) -> float:
        return self._eval({
            "kind": "mathCall",
            "id": 0,
            "span": {"start": 0, "length": 1},
            "fn": fn,
            "args": [self._num(argument) for argument in args],
        })

    def _pow(self, base: float, exponent: float) -> float:
        return self._eval({
            "kind": "binary",
            "id": 0,
            "span": {"start": 0, "length": 1},
            "op": "**",
            "left": self._num(base),
            "right": self._num(exponent),
        })

    def test_log_domain(self) -> None:
        assert self._math("log", 0) == -math.inf
        assert math.isnan(self._math("log", -1))
        assert self._math("log10", 0) == -math.inf
        assert self._math("log2", 0) == -math.inf

    def test_math_overflow(self) -> None:
        assert self._math("exp", 1000) == math.inf
        assert self._math("cosh", 1000) == math.inf
        assert self._math("sinh", -1000) == -math.inf

    def test_power_edges(self) -> None:
        # Python raises ZeroDivisionError / OverflowError or goes complex
        # for every one of these; JS defines them all.
        assert self._pow(0, -1) == math.inf
        assert self._pow(1e308, 2) == math.inf
        assert self._pow(-1e308, 3) == -math.inf
        assert math.isnan(self._pow(-8, 1 / 3))
        assert math.isnan(self._pow(1, math.inf))
        assert self._pow(-2, 3) == -8
        assert self._math("pow", 0, -1) == math.inf

    def test_integral_nonfinite(self) -> None:
        assert self._math("ceil", math.inf) == math.inf
        assert self._math("floor", -math.inf) == -math.inf
        assert math.isnan(self._math("round", math.nan))
        assert self._math("round", math.inf) == math.inf


class TestNanMargins:
    """NaN slack resolves at the comparison leaf with the boolean's sign.

    Compound min/max must not drop NaN by argument order.
    """

    @staticmethod
    def _node(kind: str, **fields: object) -> dict[str, object]:
        return {"kind": kind, "id": 0, "span": {"start": 0, "length": 1}, **fields}

    @staticmethod
    def _constraint(body: dict[str, object]) -> ParameterConstraint:
        return parameter_constraint("nan-margins", body)

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

    def test_and_nan_unsatisfied(self) -> None:
        for left, right in (
            (self._nan_leaf(), self._sat_leaf()),
            (self._sat_leaf(), self._nan_leaf()),
        ):
            case = self._constraint(self._node("binary", op="&&", left=left, right=right))
            assert case(scenario={}) is False
            assert case.margin(scenario={}) < 0

    def test_or_nan_rescued(self) -> None:
        rescued = self._constraint(
            self._node("binary", op="||", left=self._nan_leaf(), right=self._sat_leaf())
        )
        assert rescued(scenario={}) is True
        assert rescued.margin(scenario={}) >= 0

    def test_negation_nan_satisfied(self) -> None:
        negated = self._constraint(self._node("unary", op="!", operand=self._nan_leaf()))
        assert negated(scenario={}) is True
        assert negated.margin(scenario={}) >= 0

    def test_nan_equality_margins(self) -> None:
        sqrt_neg = self._node("mathCall", fn="sqrt", args=[self._num(-1)])
        unequal = self._constraint(self._node("binary", op="!=", left=sqrt_neg, right=self._num(5)))
        assert unequal(scenario={}) is True
        assert unequal.margin(scenario={}) >= 0


class TestMarginShortCircuit:
    """Margin walks the same arms as evaluation.

    Slack cancelling to NaN still reports the comparison's own answer.
    """

    @staticmethod
    def _node(kind: str, **fields: object) -> dict[str, object]:
        node: dict[str, object] = {"kind": kind, "id": 0, "span": SPAN, **fields}
        if kind == "fieldAccess":
            node.setdefault("fieldSpan", SPAN)
        return node

    def _num(self, value: float) -> dict[str, object]:
        return self._node("numberLit", value=value, raw=repr(value))

    def _queue(self) -> dict[str, object]:
        state = self._node("localRef", name="state")
        places = self._node("fieldAccess", target=state, field="places")
        return self._node("fieldAccess", target=places, field="Queue")

    def _count(self) -> dict[str, object]:
        return self._node("fieldAccess", target=self._queue(), field="count")

    def _first_token_x(self) -> dict[str, object]:
        tokens = self._node("fieldAccess", target=self._queue(), field="tokens")
        first = self._node("indexAccess", target=tokens, index=self._num(0))
        return self._node("fieldAccess", target=first, field="x")

    def test_guard_skips_index(self) -> None:
        # `count > 0 && tokens[0].x < 5` over an empty place: evaluation
        # stops at the guard, so the margin must stop there too instead of
        # indexing a token that is not there.
        guarded = state_constraint(
            "short-circuit",
            self._node(
                "binary",
                op="&&",
                left=self._node("binary", op=">", left=self._count(), right=self._num(0)),
                right=self._node("binary", op="<", left=self._first_token_x(), right=self._num(5)),
            ),
            param="state",
        )
        empty = {"places": {"Queue": {"count": 0, "tokens": []}}}
        assert guarded(state=empty) is False
        assert guarded.margin(state=empty) < 0

    def test_infinity_margin_sign(self) -> None:
        # inf - inf is NaN, but JS says inf <= inf and inf == inf hold, so a
        # cancelled slack must not read as a violation.
        inf = self._node("mathCall", fn="exp", args=[self._num(1000)])
        for op, satisfied in (
            ("<=", True),
            (">=", True),
            ("==", True),
            ("<", False),
            ("!=", False),
        ):
            case = parameter_constraint(
                "infinities", self._node("binary", op=op, left=inf, right=inf)
            )
            assert case(scenario={}) is satisfied, op
            assert (case.margin(scenario={}) >= 0) == satisfied, op


class TestRejections:
    @staticmethod
    def test_node_unknown_kind() -> None:
        with pytest.raises(ValidationError, match="mystery"):
            evaluate_hir({
                "hirVersion": 1,
                "surface": "scenario-expression",
                "params": [],
                "span": SPAN,
                "body": {"kind": "mystery", "id": 0, "span": SPAN},
            })

    @staticmethod
    def test_distribution_rejected() -> None:
        # Well-formed, so validation passes; the evaluator refuses it.
        with pytest.raises(HirEvaluationError, match="distribution"):
            evaluate_hir({
                "hirVersion": 1,
                "surface": "scenario-expression",
                "params": [],
                "span": SPAN,
                "body": {
                    "kind": "distribution",
                    "id": 0,
                    "span": SPAN,
                    "dist": "gaussian",
                    "args": [],
                },
            })

    @staticmethod
    def test_version_rejected() -> None:
        with pytest.raises(ValidationError, match="hirVersion"):
            evaluate_hir({
                "hirVersion": 2,
                "surface": "scenario-expression",
                "params": [],
                "span": SPAN,
                "body": {"kind": "boolLit", "id": 0, "span": SPAN, "value": True},
            })

    @staticmethod
    def test_constraint_numeric_result() -> None:
        fixture = FIXTURES["ordering"]
        # Evaluate the raw comparison fine, but a Constraint demanding a
        # boolean rejects a numeric body.
        numeric = parameter_constraint(
            "numeric",
            {
                "kind": "numberLit",
                "id": 0,
                "span": fixture["hir"]["span"],
                "value": 2,
                "raw": "2",
            },
            code="1 + 1",
        )
        with pytest.raises(HirEvaluationError, match="boolean"):
            numeric(scenario={})


class TestRunTimeShapeErrors:
    """Runtime shape errors raise HirEvaluationError.

    Well-formed HIR must not leak bare Python exceptions.
    """

    @staticmethod
    def _node(kind: str, **fields: object) -> dict[str, object]:
        return {"kind": kind, "id": 0, "span": SPAN, **fields}

    def _num(self, value: float) -> dict[str, object]:
        return self._node("numberLit", value=value, raw=repr(value))

    @staticmethod
    def _eval(body: dict[str, object], **scenario: float) -> Value:
        return evaluate_hir(
            {
                "hirVersion": 1,
                "surface": "scenario-expression",
                "params": [],
                "span": SPAN,
                "body": body,
            },
            scenario=scenario,
        )

    def test_math_extrema_empty(self) -> None:
        assert self._eval(self._node("mathCall", fn="max", args=[])) == -math.inf
        assert self._eval(self._node("mathCall", fn="min", args=[])) == math.inf
        assert self._eval(self._node("mathCall", fn="max", args=[self._num(5)])) == 5

    def test_math_invalid_arity(self) -> None:
        with pytest.raises(HirEvaluationError, match=r"Math\.sqrt"):
            self._eval(self._node("mathCall", fn="sqrt", args=[self._num(1), self._num(2)]))
        with pytest.raises(HirEvaluationError, match=r"Math\.atan2"):
            self._eval(self._node("mathCall", fn="atan2", args=[self._num(1)]))

    def test_index_noninteger(self) -> None:
        array = self._node("arrayLit", elements=[self._num(1), self._num(2)])
        for index in (math.nan, math.inf, 0.9):
            with pytest.raises(HirEvaluationError, match="not an integer"):
                self._eval(
                    self._node(
                        "indexAccess",
                        target=array,
                        index=self._node("scenarioRef", name="k"),
                    ),
                    k=index,
                )

    def test_range_argument_count(self) -> None:
        with pytest.raises(HirEvaluationError, match="range"):
            self._eval(self._node("rangeCall", args=[]))
        with pytest.raises(HirEvaluationError, match="range"):
            self._eval(self._node("rangeCall", args=[self._num(-1e308), self._num(1e308)]))

    def test_range_backward_overflow(self) -> None:
        # The span underflows to -Infinity; TypeScript ceilings it to zero
        # elements, and so must the evaluator instead of calling it oversized.
        assert self._eval(self._node("rangeCall", args=[self._num(1e308), self._num(-1e308)])) == []

    def test_number_integer_overflow(self) -> None:
        # An int past the double range is a valid Scalar; JS would read it
        # as Infinity, and so must the evaluator instead of overflowing.
        body = self._node(
            "binary",
            op="/",
            left=self._node("scenarioRef", name="a"),
            right=self._num(2),
        )
        assert self._eval(body, a=10**400) == math.inf

    def test_remainder_infinite_dividend(self) -> None:
        inf = self._node("mathCall", fn="exp", args=[self._num(1000)])
        result = self._eval(self._node("binary", op="%", left=inf, right=self._num(7)))
        assert isinstance(result, float)
        assert math.isnan(result)


class TestInterpreterParity:
    """Evaluator parity with the TypeScript interpreter (``hir/interpret.ts``).

    Cover where Python's own semantics disagree with ECMAScript: truthiness,
    equality of composites, ``Math.min``/``Math.max``, ``Math.round``,
    division, string length, and the operators strings are refused on.
    """

    @staticmethod
    def _node(kind: str, **fields: object) -> dict[str, object]:
        node: dict[str, object] = {"kind": kind, "id": 0, "span": SPAN, **fields}
        if kind == "fieldAccess":
            node.setdefault("fieldSpan", SPAN)
        return node

    def _num(self, value: float) -> dict[str, object]:
        return self._node("numberLit", value=value, raw=repr(value))

    def _nan(self) -> dict[str, object]:
        return self._node("constant", name="NaN")

    @staticmethod
    def _eval(
        body: dict[str, object],
        params: list[str] | None = None,
        **locals_: Value,
    ) -> Value:
        return evaluate_hir(
            {
                "hirVersion": 1,
                "surface": "metric" if params else "scenario-expression",
                "params": [{"name": name, "span": SPAN} for name in params or []],
                "span": SPAN,
                "body": body,
            },
            locals_=locals_,
        )

    def _not(self, operand: dict[str, object]) -> dict[str, object]:
        return self._node("unary", op="!", operand=operand)

    def test_nan_is_falsy(self) -> None:
        assert self._eval(self._not(self._nan())) is True
        cond = self._node(
            "cond",
            condition=self._nan(),
            thenBranch=self._num(1),
            elseBranch=self._num(2),
        )
        assert self._eval(cond) == 2

    def test_composites_truthy(self) -> None:
        assert self._eval(self._not(self._node("arrayLit", elements=[]))) is False
        assert self._eval(self._not(self._node("recordLit", entries=[]))) is False

    def test_composites_identity(self) -> None:
        one = self._node("arrayLit", elements=[self._num(1)])
        assert self._eval(self._node("binary", op="==", left=one, right=one)) is False
        state = self._node("localRef", name="state")
        same = self._node("binary", op="==", left=state, right=state)
        assert self._eval(same, params=["state"], state={"places": {}}) is True

    def test_extrema_nan(self) -> None:
        for fn in ("min", "max"):
            for args in ([self._num(1), self._nan()], [self._nan(), self._num(1)]):
                result = self._eval(self._node("mathCall", fn=fn, args=args))
                assert isinstance(result, float), (fn, args)
                assert math.isnan(result), (fn, args)

    def test_extrema_signed_zeros(self) -> None:
        negative_zero = self._node("unary", op="-", operand=self._num(0.0))
        zeros = [self._num(0.0), negative_zero]
        minimum = self._eval(self._node("mathCall", fn="min", args=zeros))
        maximum = self._eval(self._node("mathCall", fn="max", args=zeros))
        assert isinstance(minimum, float)
        assert isinstance(maximum, float)
        assert math.copysign(1.0, minimum) < 0
        assert math.copysign(1.0, maximum) > 0

    def test_round_negative_zero(self) -> None:
        rounded = self._eval(self._node("mathCall", fn="round", args=[self._num(-0.3)]))
        assert isinstance(rounded, float)
        assert rounded == 0
        assert math.copysign(1.0, rounded) < 0
        assert self._eval(self._node("mathCall", fn="round", args=[self._num(-2.5)])) == -2
        assert self._eval(self._node("mathCall", fn="round", args=[self._num(2.5)])) == 3
        # Just under one half: `floor(x + 0.5)` would round it up.
        below_half = self._num(0.49999999999999994)
        assert self._eval(self._node("mathCall", fn="round", args=[below_half])) == 0

    def test_division_nan_zero(self) -> None:
        result = self._eval(self._node("binary", op="/", left=self._nan(), right=self._num(0)))
        assert isinstance(result, float)
        assert math.isnan(result)

    def test_string_length_utf16(self) -> None:
        length = self._node("length", target=self._node("stringLit", value="\U0001f600"))
        assert self._eval(length) == 2

    def test_numeric_operators_strings(self) -> None:
        # The interpreter coerces every `+` and ordering operand to a number,
        # so both readings of a constraint refuse strings alike.
        left, right = (
            self._node("stringLit", value="a"),
            self._node("stringLit", value="b"),
        )
        for op in ("+", "<"):
            body = self._node("binary", op=op, left=left, right=right)
            with pytest.raises(HirEvaluationError, match="expects a number"):
                self._eval(body)
            with pytest.raises(HirEvaluationError, match="expects a number"):
                parameter_constraint("strings", body).margin(scenario={})

    def test_negation_satisfied_boundary(self) -> None:
        for op in ("<=", ">=", "=="):
            boundary = self._node("binary", op=op, left=self._num(3), right=self._num(3))
            negated = parameter_constraint("negated-boundary", self._not(boundary))
            assert negated(scenario={}) is False, op
            assert negated.margin(scenario={}) < 0, op
