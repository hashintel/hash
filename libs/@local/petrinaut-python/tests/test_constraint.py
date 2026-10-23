"""Test both constraint shapes as callables.

Cover full HIR validation, bindings, margins, validators and symbolic views.
"""

import json
from pathlib import Path
from typing import Annotated

import pytest
import sympy
from pydantic import AfterValidator, BaseModel, ValidationError

from petrinaut import (
    ConstraintViolationError,
    HirEvaluationError,
    NotSymbolicError,
    OptimizationDescribeResult,
    ParameterConstraint,
    StateConstraint,
    parse_constraint,
    parse_constraints,
    violations,
)
from petrinaut.hir import Scalar, Value
from petrinaut.symbolic import to_sympy

FIXTURES = json.loads((Path(__file__).parent / "hir_fixtures.json").read_text(encoding="utf-8"))


def data(name: str, **overrides: object) -> dict[str, object]:
    fixture = FIXTURES[name]
    return {
        "space": fixture["space"],
        "id": name,
        "code": fixture["code"],
        "hir": fixture["hir"],
        **overrides,
    }


class TestParsing:
    @staticmethod
    def test_space_discriminator() -> None:
        assert isinstance(parse_constraint(data("ordering")), ParameterConstraint)
        assert isinstance(parse_constraint(data("stateBound")), StateConstraint)

    @staticmethod
    def test_space_surface_mismatch() -> None:
        # A metric-surface function cannot pose as a parameter constraint.
        misfiled = data("ordering", hir=FIXTURES["stateBound"]["hir"])
        with pytest.raises(ValidationError, match="scenario-expression"):
            parse_constraint(misfiled)

    @staticmethod
    def test_node_missing_span() -> None:
        hir = json.loads(json.dumps(FIXTURES["ordering"]["hir"]))
        del hir["body"]["left"]["span"]
        broken = data("ordering", hir=hir)
        with pytest.raises(ValidationError, match="span"):
            parse_constraint(broken)

    @staticmethod
    def test_node_unknown_kind() -> None:
        hir = json.loads(json.dumps(FIXTURES["ordering"]["hir"]))
        hir["body"]["kind"] = "eval"
        forged = data("ordering", hir=hir)
        with pytest.raises(ValidationError, match="eval"):
            parse_constraint(forged)

    @staticmethod
    def test_node_extra_field() -> None:
        extra = data("ordering", hir={**FIXTURES["ordering"]["hir"], "compiled": True})
        with pytest.raises(ValidationError, match="compiled"):
            parse_constraint(extra)

    @staticmethod
    def test_description_constraints() -> None:
        described = OptimizationDescribeResult.model_validate({
            "direction": "maximize",
            "study": {"trials": 3, "sampler": "random", "seed": 1},
            "parameters": [],
            "constraints": [data("ordering"), data("stateBound")],
        })
        constraints = parse_constraints(described.constraints)
        assert [type(constraint).__name__ for constraint in constraints] == [
            "ParameterConstraint",
            "StateConstraint",
        ]
        assert constraints[0].id == "ordering"
        # A callable passes through untouched; None reads as no constraints.
        assert parse_constraint(constraints[0]) is constraints[0]
        assert parse_constraints(None) == []


class TestParameterConstraint:
    @staticmethod
    def test_scenario_binding() -> None:
        ordering = parse_constraint(data("ordering"))
        assert isinstance(ordering, ParameterConstraint)
        assert ordering(scenario={"min_load": 2, "max_load": 8}) is True
        assert ordering({"min_load": 8, "max_load": 2}) is False

    @staticmethod
    def test_net_parameter_binding() -> None:
        compound = parse_constraint(data("compound"))
        assert isinstance(compound, ParameterConstraint)
        scenario = {"min_load": 1, "max_load": 4, "turbo": False}
        assert compound(scenario, parameters={"rate": 1.5}) is True
        with pytest.raises(HirEvaluationError, match="rate"):
            compound(scenario)

    @staticmethod
    def test_readings_agree() -> None:
        ordering = parse_constraint(data("ordering"))
        assert isinstance(ordering, ParameterConstraint)
        holds = {"min_load": 2, "max_load": 8}
        fails = {"min_load": 8, "max_load": 2}
        assert ordering.margin(holds) == 6
        assert ordering.violation(holds) == -6
        ordering.check(holds)
        assert ordering.margin(fails) == -6
        with pytest.raises(ConstraintViolationError, match="ordering") as raised:
            ordering.check(fails)
        assert raised.value.margin == -6
        assert raised.value.constraint is ordering

    @staticmethod
    def test_validator_pydantic() -> None:
        ordering = parse_constraint(data("ordering"))
        assert isinstance(ordering, ParameterConstraint)

        class Study(BaseModel):
            scenario: Annotated[dict[str, float], AfterValidator(ordering.validator())]

        assert Study(scenario={"min_load": 1, "max_load": 2}).scenario == {
            "min_load": 1,
            "max_load": 2,
        }
        with pytest.raises(ValidationError, match="violated"):
            Study(scenario={"min_load": 3, "max_load": 2})


class TestStateConstraint:
    @staticmethod
    def test_state_binding() -> None:
        bound = parse_constraint(data("stateBound"))
        assert isinstance(bound, StateConstraint)
        assert bound(state={"places": {"Queue": {"count": 7}}}) is True
        assert bound({"places": {"Queue": {"count": 11}}}) is False
        assert bound.margin({"places": {"Queue": {"count": 7}}}) == 3
        assert bound.violation({"places": {"Queue": {"count": 11}}}) == 1

    @staticmethod
    def test_state_check_validator() -> None:
        bound = parse_constraint(data("stateBound"))
        assert isinstance(bound, StateConstraint)
        with pytest.raises(ConstraintViolationError, match="stateBound"):
            bound.check({"places": {"Queue": {"count": 11}}})

        class Snapshot(BaseModel):
            state: Annotated[dict[str, Value], AfterValidator(bound.validator())]

        snapshot = Snapshot(state={"places": {"Queue": {"count": 1}}})
        assert snapshot.state == {"places": {"Queue": {"count": 1}}}
        with pytest.raises(ValidationError, match="violated"):
            Snapshot(state={"places": {"Queue": {"count": 99}}})


class TestViolations:
    @staticmethod
    def test_violation_slots() -> None:
        constraints = parse_constraints([data("ordering"), data("stateBound")])
        out = violations(
            constraints,
            scenario={"min_load": 2, "max_load": 8},
            state={"places": {"Queue": {"count": 12}}},
        )
        assert out == [-6.0, 2.0]

    @staticmethod
    def test_violation_missing_binding() -> None:
        constraints = parse_constraints([data("ordering"), data("stateBound")])
        with pytest.raises(ValueError, match="needs a state"):
            violations(constraints, scenario={"min_load": 2, "max_load": 8})
        with pytest.raises(ValueError, match="needs a scenario"):
            violations(constraints, state={})


class TestSymbolic:
    @staticmethod
    def test_ordering_relation() -> None:
        ordering = parse_constraint(data("ordering"))
        assert isinstance(ordering, ParameterConstraint)
        symbolic = ordering.to_sympy()
        min_load, max_load = (
            symbolic.scenario["min_load"],
            symbolic.scenario["max_load"],
        )
        assert symbolic.expression == sympy.Lt(min_load, max_load)
        # The symbolic view answers what evaluation cannot: the feasible
        # interval of one parameter given the others.
        solved = sympy.solve_univariate_inequality(
            symbolic.expression.subs(max_load, 8), min_load, relational=False
        )
        assert solved == sympy.Interval.open(-sympy.oo, 8)

    @staticmethod
    def test_compound_parameter_kinds() -> None:
        compound = parse_constraint(data("compound"))
        assert isinstance(compound, ParameterConstraint)
        symbolic = compound.to_sympy()
        assert set(symbolic.scenario) == {"min_load", "max_load", "turbo"}
        assert set(symbolic.parameters) == {"rate"}
        # Substituting a satisfying point evaluates the relation to true.
        point = {
            symbolic.scenario["min_load"]: 1,
            symbolic.scenario["max_load"]: 4,
            symbolic.scenario["turbo"]: sympy.false,
            symbolic.parameters["rate"]: 2,
        }
        assert symbolic.expression.subs(list(point.items())) == sympy.true

    @staticmethod
    @pytest.mark.parametrize(
        ("name", "scenario", "expected"),
        [
            ("math", {"min_load": 2, "max_load": 4.5}, True),
            ("math", {"min_load": 2, "max_load": 3.4}, False),
            ("ternary", {"turbo": True, "max_load": 9}, True),
            ("ternary", {"turbo": False, "max_load": 9}, False),
        ],
    )
    def test_symbolic_fixture(name: str, scenario: dict[str, Scalar], *, expected: bool) -> None:
        constraint = parse_constraint(data(name))
        assert isinstance(constraint, ParameterConstraint)
        symbolic = constraint.to_sympy()
        substitutions = [
            (symbol, sympy.sympify(scenario[key])) for key, symbol in symbolic.scenario.items()
        ]
        assert bool(symbolic.expression.subs(substitutions)) is expected
        assert constraint(scenario) is expected

    @staticmethod
    def test_symbolic_state_rejected() -> None:
        block = parse_constraint(data("stateBlock"))
        assert isinstance(block, StateConstraint)
        assert not hasattr(block, "to_sympy")
        # A parameter constraint over an array is out of the subset too.
        with pytest.raises(NotSymbolicError):
            to_sympy(
                ParameterConstraint.model_validate(
                    data(
                        "ordering",
                        hir={
                            "hirVersion": 1,
                            "surface": "scenario-expression",
                            "params": [],
                            "span": {"start": 0, "length": 1},
                            "body": {
                                "kind": "binary",
                                "id": 2,
                                "span": {"start": 0, "length": 1},
                                "op": ">",
                                "left": {
                                    "kind": "length",
                                    "id": 1,
                                    "span": {"start": 0, "length": 1},
                                    "target": {
                                        "kind": "arrayLit",
                                        "id": 0,
                                        "span": {"start": 0, "length": 1},
                                        "elements": [],
                                    },
                                },
                                "right": {
                                    "kind": "numberLit",
                                    "id": 3,
                                    "span": {"start": 0, "length": 1},
                                    "value": 0,
                                    "raw": "0",
                                },
                            },
                        },
                    )
                )
            )


SPAN = {"start": 0, "length": 1}


def node(kind: str, **fields: object) -> dict[str, object]:
    built: dict[str, object] = {"kind": kind, "id": 0, "span": SPAN, **fields}
    if kind == "fieldAccess":
        built.setdefault("fieldSpan", SPAN)
    return built


def num(value: float) -> dict[str, object]:
    return node("numberLit", value=value, raw=repr(value))


def ref(name: str) -> dict[str, object]:
    return node("scenarioRef", name=name)


def parameter_constraint(body: dict[str, object]) -> ParameterConstraint:
    return ParameterConstraint.model_validate({
        "space": "parameters",
        "id": "inline",
        "code": "<inline>",
        "hir": {
            "hirVersion": 1,
            "surface": "scenario-expression",
            "params": [],
            "span": SPAN,
            "body": body,
        },
    })


class TestSymbolicAgreesWithEvaluation:
    """Symbolic substitution agrees with evaluation.

    Cover cases SymPy gets wrong when handed naively
    (Piecewise in condition positions, Mod's sign, the complex cube root).
    """

    @staticmethod
    def agree(constraint: ParameterConstraint, assignments: list[dict[str, Scalar]]) -> None:
        symbolic = constraint.to_sympy()
        for scenario in assignments:
            point = {
                symbol: (sympy.true if value is True else sympy.false if value is False else value)
                for name, symbol in symbolic.scenario.items()
                for value in [scenario[name]]
            }
            expected = constraint(scenario)
            actual = bool(symbolic.expression.subs(list(point.items())))
            assert actual is expected, (scenario, symbolic.expression)

    def test_numeric_ternary_condition(self) -> None:
        # ((a > (flag ? b : c)) ? 1 : 2) == 2
        inner = node("cond", condition=ref("flag"), thenBranch=ref("b"), elseBranch=ref("c"))
        outer = node(
            "cond",
            condition=node("binary", op=">", left=ref("a"), right=inner),
            thenBranch=num(1),
            elseBranch=num(2),
        )
        constraint = parameter_constraint(node("binary", op="==", left=outer, right=num(2)))
        self.agree(
            constraint,
            [
                {"a": 5, "b": 3, "c": 10, "flag": False},
                {"a": 5, "b": 3, "c": 10, "flag": True},
                {"a": 0, "b": 3, "c": -1, "flag": True},
            ],
        )

    def test_boolean_ternary_and(self) -> None:
        # (flag ? a < 1 : a < 2) && b > 0
        ternary = node(
            "cond",
            condition=ref("flag"),
            thenBranch=node("binary", op="<", left=ref("a"), right=num(1)),
            elseBranch=node("binary", op="<", left=ref("a"), right=num(2)),
        )
        constraint = parameter_constraint(
            node(
                "binary",
                op="&&",
                left=ternary,
                right=node("binary", op=">", left=ref("b"), right=num(0)),
            )
        )
        self.agree(
            constraint,
            [
                {"a": 1.5, "b": 1, "flag": False},
                {"a": 1.5, "b": 1, "flag": True},
                {"a": 0.5, "b": -1, "flag": True},
            ],
        )

    def test_boolean_ternary_equality(self) -> None:
        # (turbo ? flag : true) == (1.5 <= rate)   and the same with !=
        for op in ("==", "!="):
            left = node(
                "cond",
                condition=ref("turbo"),
                thenBranch=ref("flag"),
                elseBranch=node("boolLit", value=True),
            )
            right = node("binary", op="<=", left=num(1.5), right=ref("rate"))
            constraint = parameter_constraint(node("binary", op=op, left=left, right=right))
            self.agree(
                constraint,
                [
                    {"turbo": False, "flag": False, "rate": 100},
                    {"turbo": True, "flag": False, "rate": 100},
                    {"turbo": True, "flag": True, "rate": 1},
                ],
            )

    def test_remainder_dividend_sign(self) -> None:
        constraint = parameter_constraint(
            node(
                "binary",
                op="<",
                left=node("binary", op="%", left=ref("a"), right=num(3)),
                right=num(0),
            )
        )
        self.agree(constraint, [{"a": -7}, {"a": 7}, {"a": -4.5}, {"a": 6}])

    def test_cube_root_real(self) -> None:
        constraint = parameter_constraint(
            node(
                "binary",
                op="<",
                left=node("mathCall", fn="cbrt", args=[ref("a")]),
                right=num(0),
            )
        )
        self.agree(constraint, [{"a": -8}, {"a": 8}, {"a": -0.749}])


class TestStateBinding:
    @staticmethod
    def test_state_nonrecord() -> None:
        bound = parse_constraint(data("stateBound"))
        assert isinstance(bound, StateConstraint)
        with pytest.raises(HirEvaluationError, match="state record"):
            bound([1, 2, 3])
