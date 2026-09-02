"""The two constraint shapes as callables: parsing with full HIR validation,
the binding each shape takes, the four readings of a condition, the pydantic
validator, and the symbolic view."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any

import pytest
import sympy
from pydantic import AfterValidator, BaseModel, ValidationError

from petrinaut import (
    ConstraintViolation,
    HirEvaluationError,
    NotSymbolicError,
    OptimizationDescribeResult,
    ParameterConstraint,
    StateConstraint,
    parse_constraint,
    parse_constraints,
    violations,
)

FIXTURES = json.loads(
    (Path(__file__).parent / "hir_fixtures.json").read_text(encoding="utf-8")
)


def data(name: str, **overrides: Any) -> dict[str, Any]:
    fixture = FIXTURES[name]
    return {
        "space": fixture["space"],
        "id": name,
        "code": fixture["code"],
        "hir": fixture["hir"],
        **overrides,
    }


class TestParsing:
    def test_discriminates_on_space(self) -> None:
        assert isinstance(parse_constraint(data("ordering")), ParameterConstraint)
        assert isinstance(parse_constraint(data("stateBound")), StateConstraint)

    def test_pins_the_surface_to_the_space(self) -> None:
        # A metric-surface function cannot pose as a parameter constraint.
        misfiled = data("ordering", hir=FIXTURES["stateBound"]["hir"])
        with pytest.raises(ValidationError, match="scenario-expression"):
            parse_constraint(misfiled)

    def test_validates_every_node(self) -> None:
        broken = data("ordering")
        broken["hir"] = json.loads(json.dumps(broken["hir"]))
        del broken["hir"]["body"]["left"]["span"]
        with pytest.raises(ValidationError, match="span"):
            parse_constraint(broken)

    def test_rejects_an_unknown_node_kind(self) -> None:
        forged = data("ordering")
        forged["hir"] = json.loads(json.dumps(forged["hir"]))
        forged["hir"]["body"]["kind"] = "eval"
        with pytest.raises(ValidationError, match="eval"):
            parse_constraint(forged)

    def test_rejects_fields_outside_the_grammar(self) -> None:
        extra = data("ordering")
        extra["hir"] = {**extra["hir"], "compiled": True}
        with pytest.raises(ValidationError, match="compiled"):
            parse_constraint(extra)

    def test_reads_a_describe_result(self) -> None:
        described = OptimizationDescribeResult.model_validate(
            {
                "direction": "maximize",
                "study": {"trials": 3, "sampler": "random", "seed": 1},
                "parameters": [],
                "constraints": [data("ordering"), data("stateBound")],
            }
        )
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
    def test_takes_a_scenario(self) -> None:
        ordering = parse_constraint(data("ordering"))
        assert isinstance(ordering, ParameterConstraint)
        assert ordering(scenario={"min_load": 2, "max_load": 8}) is True
        assert ordering({"min_load": 8, "max_load": 2}) is False

    def test_reads_net_parameters(self) -> None:
        compound = parse_constraint(data("compound"))
        assert isinstance(compound, ParameterConstraint)
        scenario = {"min_load": 1, "max_load": 4, "turbo": False}
        assert compound(scenario, parameters={"rate": 1.5}) is True
        with pytest.raises(HirEvaluationError, match="rate"):
            compound(scenario)

    def test_four_readings_agree(self) -> None:
        ordering = parse_constraint(data("ordering"))
        assert isinstance(ordering, ParameterConstraint)
        holds = {"min_load": 2, "max_load": 8}
        fails = {"min_load": 8, "max_load": 2}
        assert ordering.margin(holds) == 6.0
        assert ordering.violation(holds) == -6.0
        ordering.check(holds)
        assert ordering.margin(fails) == -6.0
        with pytest.raises(ConstraintViolation, match="ordering") as raised:
            ordering.check(fails)
        assert raised.value.margin == -6.0
        assert raised.value.constraint is ordering

    def test_validator_plugs_into_pydantic(self) -> None:
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
    def test_takes_a_state(self) -> None:
        bound = parse_constraint(data("stateBound"))
        assert isinstance(bound, StateConstraint)
        assert bound(state={"places": {"Queue": {"count": 7}}}) is True
        assert bound({"places": {"Queue": {"count": 11}}}) is False
        assert bound.margin({"places": {"Queue": {"count": 7}}}) == 3.0
        assert bound.violation({"places": {"Queue": {"count": 11}}}) == 1.0

    def test_check_and_validator(self) -> None:
        bound = parse_constraint(data("stateBound"))
        assert isinstance(bound, StateConstraint)
        with pytest.raises(ConstraintViolation, match="stateBound"):
            bound.check({"places": {"Queue": {"count": 11}}})

        class Snapshot(BaseModel):
            state: Annotated[dict[str, Any], AfterValidator(bound.validator())]

        Snapshot(state={"places": {"Queue": {"count": 1}}})
        with pytest.raises(ValidationError, match="violated"):
            Snapshot(state={"places": {"Queue": {"count": 99}}})


class TestViolations:
    def test_one_slot_per_constraint(self) -> None:
        constraints = parse_constraints([data("ordering"), data("stateBound")])
        out = violations(
            constraints,
            scenario={"min_load": 2, "max_load": 8},
            state={"places": {"Queue": {"count": 12}}},
        )
        assert out == [-6.0, 2.0]

    def test_a_missing_binding_is_an_error_not_a_gap(self) -> None:
        constraints = parse_constraints([data("ordering"), data("stateBound")])
        with pytest.raises(ValueError, match="needs a state"):
            violations(constraints, scenario={"min_load": 2, "max_load": 8})
        with pytest.raises(ValueError, match="needs a scenario"):
            violations(constraints, state={})


class TestSymbolic:
    def test_ordering_becomes_a_relation(self) -> None:
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

    def test_compound_keeps_both_parameter_kinds_apart(self) -> None:
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
        assert symbolic.expression.subs(point) == sympy.true

    def test_math_and_ternary_translate(self) -> None:
        for name in ("math", "ternary"):
            constraint = parse_constraint(data(name))
            assert isinstance(constraint, ParameterConstraint)
            symbolic = constraint.to_sympy()
            assert symbolic.expression is not None

    def test_state_reads_have_no_symbolic_form(self) -> None:
        block = parse_constraint(data("stateBlock"))
        assert isinstance(block, StateConstraint)
        assert not hasattr(block, "to_sympy")
        # A parameter constraint over an array is out of the subset too.
        from petrinaut.symbolic import to_sympy

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
