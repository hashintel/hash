"""Translate parameter constraints to SymPy relations.

Only the arithmetic subset translates: numbers, scenario and net parameters,
Math functions with symbolic counterparts, comparisons, logic, ternaries and
const bindings. Arrays, records, strings, range and random raise NotSymbolicError.
State constraints are never symbolic.

Translation is exact mathematics over the reals, not ECMAScript floating-point
edges (NaN, signed zero, overflow). Logarithmic boundaries may need simplify or
nsimplify before SymPy decides them; ask the evaluator when those edges matter.
SymPy is optional: install ``petrinaut-python[sympy]`` to use this module.
"""

import math
import operator
from collections.abc import Callable
from dataclasses import dataclass, field

from . import models as m
from .hir import HirExpr

try:
    import sympy
    from sympy import Basic, Expr, Symbol
    from sympy.logic.boolalg import Boolean
except ImportError as error:
    _SYMPY_IMPORT_ERROR = error
    _SYMPY = None
else:
    _SYMPY_IMPORT_ERROR = None
    _SYMPY = sympy

__all__ = ["NotSymbolicError", "SymbolicConstraint", "to_sympy"]

_BOOLEAN_BINARY_OPS = frozenset({"<", "<=", ">", ">=", "==", "!=", "&&", "||"})
type SymbolicValue = Expr | Boolean


class NotSymbolicError(ValueError):
    """The constraint reads something SymPy cannot represent."""


@dataclass(frozen=True, slots=True)
class SymbolicConstraint:
    """A SymPy relation plus the symbols it was built over."""

    expression: Basic
    """A SymPy Boolean relation, or a combination of relations."""
    scenario: dict[str, Symbol] = field(default_factory=dict)
    """Scenario parameter identifier to Symbol."""
    parameters: dict[str, Symbol] = field(default_factory=dict)
    """Net parameter name to Symbol."""

    @property
    def symbols(self) -> list[Symbol]:
        """Every symbol, scenario parameters first, in first-use order."""
        return [*self.scenario.values(), *self.parameters.values()]


def to_sympy(constraint: m.ParameterConstraint) -> SymbolicConstraint:
    """Translate one parameter constraint.

    Raise ImportError without the extra, or NotSymbolicError outside the
    arithmetic subset.
    """
    translator = _Translator()
    expression = translator.expr(constraint.hir.body)
    return SymbolicConstraint(expression, translator.scenario, translator.parameters)


class _Translator:
    def __init__(self) -> None:
        if _SYMPY is None:
            raise ImportError(
                "SymPy is not installed; install the `sympy` extra of petrinaut-python"
            ) from _SYMPY_IMPORT_ERROR

        self.sympy = _SYMPY
        self.scenario: dict[str, Symbol] = {}
        self.parameters: dict[str, Symbol] = {}
        self.locals: dict[str, SymbolicValue] = {}
        self.boolean_locals: set[str] = set()
        sp = _SYMPY

        def hypot(*args: Expr) -> Expr:
            return sp.sqrt(sum(argument**2 for argument in args))

        def log10(value: Expr) -> Expr:
            return sp.log(value, 10)

        def log2(value: Expr) -> Expr:
            return sp.log(value, 2)

        def js_round(value: Expr) -> Expr:
            return sp.floor(value + sp.Rational(1, 2))

        def cbrt(value: Expr) -> Expr:
            # sp.cbrt is the principal complex root, not the real cube root.
            return sp.real_root(value, 3)

        self.math_fns: dict[str, Callable[..., Expr]] = {
            "abs": sp.Abs,
            "acos": sp.acos,
            "asin": sp.asin,
            "atan": sp.atan,
            "atan2": sp.atan2,
            "cbrt": cbrt,
            "ceil": sp.ceiling,
            "cos": sp.cos,
            "cosh": sp.cosh,
            "exp": sp.exp,
            "floor": sp.floor,
            "hypot": hypot,
            "log": sp.log,
            "log10": log10,
            "log2": log2,
            "max": sp.Max,
            "min": sp.Min,
            "pow": sp.Pow,
            "round": js_round,
            "sign": sp.sign,
            "sin": sp.sin,
            "sinh": sp.sinh,
            "sqrt": sp.sqrt,
            "tan": sp.tan,
            "tanh": sp.tanh,
            "trunc": self._trunc,
        }
        self.arithmetic: dict[str, Callable[[Expr, Expr], Expr]] = {
            "+": operator.add,
            "-": operator.sub,
            "*": operator.mul,
            "/": operator.truediv,
            "%": self._remainder,
            "**": operator.pow,
        }

    def _trunc(self, value: Expr) -> Expr:
        sp = self.sympy
        return sp.sign(value) * sp.floor(sp.Abs(value))

    def _remainder(self, left: Expr, right: Expr) -> Expr:
        # ECMAScript remainder takes the dividend's sign, unlike sp.Mod.
        return left - right * self._trunc(left / right)

    def _numeric(self, value: SymbolicValue) -> Expr:
        if not isinstance(value, self.sympy.Expr):
            raise NotSymbolicError("Arithmetic requires a numeric expression")
        return value

    def _symbol(self, table: dict[str, Symbol], other: dict[str, Symbol], name: str) -> Symbol:
        if name not in table:
            if name in other:
                raise NotSymbolicError(
                    f'"{name}" names both a scenario parameter and a net parameter'
                )
            table[name] = self.sympy.Symbol(name, real=True)
        return table[name]

    def _number(self, value: float) -> Expr:
        sp = self.sympy
        if math.isnan(value):
            return sp.nan
        if math.isinf(value):
            return sp.oo if value > 0 else -sp.oo
        if value == int(value):
            return sp.Integer(int(value))
        return sp.Float(value)

    def is_boolean(self, node: HirExpr) -> bool:
        """Determine whether a node is a condition rather than a number.

        HIR carries no types. A bare parameter reads as a number unless the
        other side of an operator says otherwise.
        """
        match node:
            case m.HirBoolLit():
                result = True
            case m.HirBinary():
                result = node.op.value in _BOOLEAN_BINARY_OPS
            case m.HirUnary():
                result = node.op.value == "!"
            case m.HirCond():
                result = self.is_boolean(node.then_branch) or self.is_boolean(node.else_branch)
            case m.HirLet():
                result = self.is_boolean(node.body)
            case m.HirLocalRef():
                result = node.name in self.boolean_locals
            case _:
                result = False
        return result

    def expr(self, node: HirExpr) -> SymbolicValue:
        match node:
            case (
                m.HirNumberLit()
                | m.HirBoolLit()
                | m.HirConstant()
                | m.HirScenarioRef()
                | m.HirParamRef()
                | m.HirLocalRef()
            ):
                return self._leaf(node)
            case m.HirUnary():
                return self._unary(node)
            case m.HirBinary():
                return self._binary(node)
            case m.HirCond():
                return self._conditional(node)
            case m.HirLet():
                return self._let(node)
            case m.HirMathCall():
                fn = node.fn.value
                if fn not in self.math_fns:
                    raise NotSymbolicError(f"Math.{fn}() has no symbolic form")
                return self.math_fns[fn](*(self._numeric(self.expr(arg)) for arg in node.args))
            case _:
                raise NotSymbolicError(f'HIR node kind "{node.kind}" has no symbolic form')

    def _leaf(
        self,
        node: m.HirNumberLit
        | m.HirBoolLit
        | m.HirConstant
        | m.HirScenarioRef
        | m.HirParamRef
        | m.HirLocalRef,
    ) -> SymbolicValue:
        sp = self.sympy
        match node:
            case m.HirNumberLit():
                return self._number(node.value)
            case m.HirBoolLit():
                return sp.true if node.value else sp.false
            case m.HirConstant():
                return {"PI": sp.pi, "E": sp.E, "Infinity": sp.oo, "NaN": sp.nan}[node.name.value]
            case m.HirScenarioRef():
                return self._symbol(self.scenario, self.parameters, node.name)
            case m.HirParamRef():
                return self._symbol(self.parameters, self.scenario, node.name)
            case m.HirLocalRef():
                if node.name not in self.locals:
                    raise NotSymbolicError(f'Unbound local "{node.name}"')
                return self.locals[node.name]

    def _unary(self, node: m.HirUnary) -> SymbolicValue:
        operand = self.expr(node.operand)
        op = node.op.value
        if op == "!":
            return self._logic(self.sympy.Not, operand)
        return -self._numeric(operand) if op == "-" else operand

    def _conditional(self, node: m.HirCond) -> SymbolicValue:
        condition = self.expr(node.condition)
        then_branch = self.expr(node.then_branch)
        else_branch = self.expr(node.else_branch)
        if self.is_boolean(node):
            # A condition-valued ternary stays Boolean; Piecewise loses its
            # own condition when SymPy rewrites it in a condition position.
            return self._logic(self.sympy.ITE, condition, then_branch, else_branch)
        return self.sympy.Piecewise((then_branch, condition), (else_branch, True))

    def _let(self, node: m.HirLet) -> SymbolicValue:
        saved_locals = dict(self.locals)
        saved_booleans = set(self.boolean_locals)
        try:
            for binding in node.bindings:
                self.locals[binding.name] = self.expr(binding.value)
                if self.is_boolean(binding.value):
                    self.boolean_locals.add(binding.name)
                else:
                    self.boolean_locals.discard(binding.name)
            return self.expr(node.body)
        finally:
            self.locals = saved_locals
            self.boolean_locals = saved_booleans

    def _condition(self, expression: SymbolicValue) -> Boolean:
        """Normalize a relation for use in a Boolean condition position.

        Fold Piecewise relations into ITEs; SymPy otherwise rewrites them
        lossily under a condition. An arm-less remainder reads as false.
        """
        sp = self.sympy
        folded = sp.piecewise_fold(expression)
        if not isinstance(folded, sp.Piecewise):
            return folded
        result = sp.false
        for arm in reversed(folded.args):
            arm_expression, arm_condition = arm.args
            result = sp.ITE(arm_condition, arm_expression, result)
        return result

    @staticmethod
    def _logic(connective: Callable[..., Boolean], *operands: SymbolicValue) -> Boolean:
        """Apply a Boolean connective.

        Report SymPy's TypeError for a non-Boolean operand as a subset boundary.
        """
        try:
            return connective(*operands)
        except TypeError as error:
            raise NotSymbolicError(str(error)) from error

    def _binary(self, node: m.HirBinary) -> SymbolicValue:
        sp = self.sympy
        left = self.expr(node.left)
        right = self.expr(node.right)
        op = node.op.value
        if op in {"&&", "||"}:
            return self._logic(sp.And if op == "&&" else sp.Or, left, right)
        if op in self.arithmetic:
            return self.arithmetic[op](self._numeric(left), self._numeric(right))
        if op in {"==", "!="}:
            if self.is_boolean(node.left) or self.is_boolean(node.right):
                return self._logic(sp.Equivalent if op == "==" else sp.Xor, left, right)
            return self._condition(sp.Eq(left, right) if op == "==" else sp.Ne(left, right))
        relation = {"<": sp.Lt, "<=": sp.Le, ">": sp.Gt, ">=": sp.Ge}[op]
        return self._condition(relation(left, right))
