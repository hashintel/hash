"""Evaluation of serialized HIR expressions — Petrinaut's shared expression
representation. ``hir/hir.ts`` in ``@hashintel/petrinaut-core`` owns the
grammar; :mod:`petrinaut.models` carries it as pydantic models generated from
the CLI's protocol schema, so a document is validated node by node before
anything here runs. Constraints travel as ``{code, hir}`` pairs; this module
evaluates the ``hir`` side so Python consumers need no TypeScript frontend.

Two evaluation modes:

- :func:`evaluate_hir` — the expression's value; for a constraint, ``True``
  means satisfied.
- :func:`hir_margin` — a signed robustness margin (``>= 0`` means
  satisfied): comparisons yield signed slack, ``&&`` combines by ``min``,
  ``||`` by ``max``, ``!`` negates. This is the learnable signal constrained
  samplers (e.g. Optuna's ``constraints_func``, which expects violation
  ``<= 0`` — i.e. ``-margin``) consume. The same walk evaluated over
  intervals instead of scalars would bound a constraint over a whole
  parameter box; that extension is deliberately not implemented yet.

Malformed HIR — an unknown node kind, a missing field, a foreign version —
fails pydantic validation (:class:`pydantic.ValidationError`) before
evaluation starts. Nodes the grammar allows but a deterministic constraint
cannot evaluate (distributions, UUID generation, ``Math.random()``) raise
:class:`HirEvaluationError`, as do a value of the wrong shape, an index that
is not an integer, and a ``Math`` call with the wrong number of arguments.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from typing import TypeAlias, TypeVar

from pydantic import TypeAdapter

from . import models as m

__all__ = [
    "HirEvaluationError",
    "HirExpr",
    "HirFunction",
    "Scalar",
    "Value",
    "evaluate_hir",
    "hir_margin",
    "validate_hir_function",
]

Scalar: TypeAlias = float | int | bool

#: What HIR evaluates to: scalars and strings, plus the arrays and records
#: the metric surface reads from the simulation state.
Value: TypeAlias = float | int | bool | str | list["Value"] | dict[str, "Value"]

#: One expression node, any kind. The members are the generated models.
HirExpr: TypeAlias = (
    m.HirNumberLit
    | m.HirBoolLit
    | m.HirStringLit
    | m.HirStringCall
    | m.HirUuidGenerate
    | m.HirUuidFrom
    | m.HirConstant
    | m.HirLocalRef
    | m.HirParamRef
    | m.HirScenarioRef
    | m.HirRangeCall
    | m.HirFieldAccess
    | m.HirIndexAccess
    | m.HirLength
    | m.HirUnary
    | m.HirBinary
    | m.HirCond
    | m.HirLet
    | m.HirMathCall
    | m.HirRecordLit
    | m.HirArrayLit
    | m.HirArrayMap
    | m.HirArrayReduce
    | m.HirArrayConcat
    | m.HirDistribution
    | m.HirDistributionMap
)

#: A lowered function: the generic shape, or one of the two surface-pinned
#: shapes a constraint carries.
HirFunction: TypeAlias = m.HirFunction | m.ParameterConstraintHir | m.StateConstraintHir

_FUNCTION_ADAPTER = TypeAdapter(m.HirFunction)

_MAX_RANGE_LENGTH = 1_000_000


class HirEvaluationError(Exception):
    """A serialized HIR expression could not be evaluated."""


def validate_hir_function(fn: HirFunction | Mapping[str, object]) -> HirFunction:
    """The function as a model: a mapping is validated against the grammar
    (raising :class:`pydantic.ValidationError` when it does not fit), a
    model passes through."""
    if isinstance(fn, (m.HirFunction, m.ParameterConstraintHir, m.StateConstraintHir)):
        return fn
    return _FUNCTION_ADAPTER.validate_python(fn)


# -- ECMAScript arithmetic ------------------------------------------------------


def _js_round(value: float) -> float:
    """ECMAScript ``Math.round``: half-up toward positive infinity (Python's
    ``round`` is banker's)."""
    if not math.isfinite(value):
        return value  # JS: round(±Infinity) is ±Infinity, round(NaN) is NaN
    return math.floor(value + 0.5)


def _js_sign(value: float) -> float:
    if value > 0:
        return 1
    if value < 0:
        return -1
    return value  # preserves 0 / -0 / NaN like JS


def _is_odd_integer(value: float) -> bool:
    return math.isfinite(value) and value == int(value) and int(value) % 2 == 1


def _js_pow(base: float, exponent: float) -> float:
    """ECMAScript exponentiation (``**`` and ``Math.pow``): IEEE-754 via
    ``math.pow``, never raising and never going complex, with the spec's
    deviations from C ``pow`` restored."""
    # JS: any NaN exponent, and ±Infinity exponents on a |base| of exactly
    # 1, yield NaN where C pow returns 1.
    if math.isnan(exponent) or (math.isinf(exponent) and abs(base) == 1):
        return math.nan
    try:
        return math.pow(base, exponent)
    except OverflowError:
        # Finite operands overflowing a double: ±Infinity, negative only
        # for a negative base raised to an odd integer.
        negative = base < 0 and _is_odd_integer(exponent)
        return -math.inf if negative else math.inf
    except ValueError:
        if base == 0 and exponent < 0:
            # JS: 0 ** negative is Infinity; -0 flips the sign through an
            # odd integer exponent.
            negative = math.copysign(1.0, base) < 0 and _is_odd_integer(exponent)
            return -math.inf if negative else math.inf
        # Negative base with a non-integer exponent, and other domain
        # errors: NaN in JS.
        return math.nan


_Unary = Callable[[float], float]


def _js_log(fn: _Unary) -> _Unary:
    """JS ``Math.log`` family: 0 yields -Infinity and negatives yield NaN,
    where Python raises for both."""

    def wrapped(value: float) -> float:
        if value == 0:
            return -math.inf
        if value < 0:
            return math.nan
        return fn(value)

    return wrapped


def _js_grows(fn: _Unary, *, odd: bool) -> _Unary:
    """JS ``Math.exp``/``cosh``/``sinh``: a result too large for a double is
    ±Infinity, where Python raises OverflowError. ``odd`` functions take the
    argument's sign."""

    def wrapped(value: float) -> float:
        try:
            return fn(value)
        except OverflowError:
            return math.copysign(math.inf, value) if odd else math.inf

    return wrapped


def _js_integral(fn: Callable[[float], int]) -> _Unary:
    """JS ``Math.ceil``/``floor``/``trunc`` pass non-finite values through,
    where Python raises."""

    def wrapped(value: float) -> float:
        if not math.isfinite(value):
            return value
        return fn(value)

    return wrapped


def _cbrt(value: float) -> float:
    return math.copysign(abs(value) ** (1 / 3), value)


def _max(*values: float) -> float:
    return max(values) if values else -math.inf  # JS: Math.max() is -Infinity


def _min(*values: float) -> float:
    return min(values) if values else math.inf  # JS: Math.min() is Infinity


_MATH_FNS: dict[str, Callable[..., float]] = {
    "abs": abs,
    "acos": math.acos,
    "asin": math.asin,
    "atan": math.atan,
    "atan2": math.atan2,
    "cbrt": _cbrt,
    "ceil": _js_integral(math.ceil),
    "cos": math.cos,
    "cosh": _js_grows(math.cosh, odd=False),
    "exp": _js_grows(math.exp, odd=False),
    "floor": _js_integral(math.floor),
    "hypot": math.hypot,
    "log": _js_log(math.log),
    "log10": _js_log(math.log10),
    "log2": _js_log(math.log2),
    "max": _max,
    "min": _min,
    "pow": _js_pow,
    "round": _js_round,
    "sign": _js_sign,
    "sin": math.sin,
    "sinh": _js_grows(math.sinh, odd=True),
    "sqrt": math.sqrt,
    "tan": math.tan,
    "tanh": math.tanh,
    "trunc": _js_integral(math.trunc),
}

_CONSTANTS: dict[str, float] = {
    "PI": math.pi,
    "E": math.e,
    "Infinity": math.inf,
    "NaN": math.nan,
}

_COMPARISONS = ("<", "<=", ">", ">=")


def _strict_slack(slack: float) -> float:
    """A strict comparison is violated at the boundary, so its margin must
    go negative there: a zero slack becomes the smallest representable step
    below zero, keeping "margin >= 0 iff satisfied" exact for ``<``, ``>``
    and ``!=`` while staying negligible for any consumer of magnitudes."""
    if slack != 0.0:
        return slack
    return -math.ulp(1.0)


def _strict_equal(left: Value, right: Value) -> bool:
    """ECMAScript strict equality on the value kinds HIR produces: booleans
    never equal numbers (`1 === true` is false in JS, unlike Python)."""
    if isinstance(left, bool) != isinstance(right, bool):
        return False
    return left == right


def _truthy(value: Value) -> bool:
    return bool(value)


def _number(value: Value, context: str) -> float:
    """The value as a JS number: booleans coerce to 0/1, an int too large for
    a double becomes ±Infinity; anything else is a type error the frontend's
    typechecker would have refused."""
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        try:
            return float(value)
        except OverflowError:
            return math.inf if value > 0 else -math.inf
    raise HirEvaluationError(f"{context} expects a number, got {type(value).__name__}")


_Ordered = TypeVar("_Ordered", float, str)


def _compare(op: str, left: _Ordered, right: _Ordered) -> bool:
    if op == "<":
        return left < right
    if op == "<=":
        return left <= right
    if op == ">":
        return left > right
    return left >= right


def _range(args: Sequence[float]) -> list[Value]:
    """The scenario ``range(...)`` helper, matching the TypeScript
    implementation (Python-style bounds, fractional steps allowed)."""
    if not 1 <= len(args) <= 3:
        raise HirEvaluationError(f"range() takes 1 to 3 arguments, got {len(args)}")
    for argument in args:
        if not math.isfinite(argument):
            raise HirEvaluationError("range() arguments must be finite numbers.")
    start = args[0] if len(args) > 1 else 0
    end = args[1] if len(args) > 1 else args[0]
    step = args[2] if len(args) > 2 else 1
    if step == 0:
        raise HirEvaluationError("range() step must not be zero.")
    span = (end - start) / step
    if not math.isfinite(span):
        raise HirEvaluationError(
            f"range() would produce more than {_MAX_RANGE_LENGTH} elements."
        )
    maximum_length = max(0, math.ceil(span))
    if maximum_length > _MAX_RANGE_LENGTH:
        raise HirEvaluationError(
            f"range() would produce {maximum_length} elements, exceeding the "
            f"limit of {_MAX_RANGE_LENGTH}."
        )
    values: list[Value] = []
    for i in range(maximum_length):
        value = start + i * step
        if value >= end if step > 0 else value <= end:
            break
        values.append(value)
    return values


# -- The walker -----------------------------------------------------------------


class _Evaluator:
    def __init__(
        self,
        scenario: Mapping[str, Scalar],
        parameters: Mapping[str, Scalar],
        locals_: dict[str, Value],
    ) -> None:
        self.scenario = scenario
        self.parameters = parameters
        self.locals = locals_

    def eval(self, node: HirExpr) -> Value:
        match node:
            case m.HirNumberLit() | m.HirBoolLit() | m.HirStringLit():
                return node.value
            case m.HirConstant():
                return _CONSTANTS[node.name.value]
            case m.HirLocalRef():
                if node.name not in self.locals:
                    raise HirEvaluationError(f'Unbound local "{node.name}"')
                return self.locals[node.name]
            case m.HirParamRef():
                if node.name not in self.parameters:
                    raise HirEvaluationError(f'Unknown net parameter "{node.name}"')
                return self.parameters[node.name]
            case m.HirScenarioRef():
                if node.name not in self.scenario:
                    raise HirEvaluationError(
                        f'Unknown scenario parameter "{node.name}"'
                    )
                return self.scenario[node.name]
            case m.HirRangeCall():
                return _range(
                    [_number(self.eval(argument), "range()") for argument in node.args]
                )
            case m.HirFieldAccess():
                target = self.eval(node.target)
                if not isinstance(target, Mapping) or node.field not in target:
                    raise HirEvaluationError(f'No field "{node.field}" on {target!r}')
                return target[node.field]
            case m.HirIndexAccess():
                target = self.eval(node.target)
                position = _number(self.eval(node.index), "An index")
                if not math.isfinite(position) or position != int(position):
                    raise HirEvaluationError(f"Index {position!r} is not an integer")
                index = int(position)
                if not isinstance(target, list) or not 0 <= index < len(target):
                    raise HirEvaluationError(f"Index {index} out of range")
                return target[index]
            case m.HirLength():
                target = self.eval(node.target)
                if not isinstance(target, (list, str)):
                    raise HirEvaluationError(".length target is not an array or string")
                return len(target)
            case m.HirStringCall():
                return self._string_call(node)
            case m.HirUnary():
                operand = self.eval(node.operand)
                op = node.op.value
                if op == "!":
                    return not _truthy(operand)
                number = _number(operand, f'Unary "{op}"')
                return -number if op == "-" else number
            case m.HirBinary():
                return self._binary(node)
            case m.HirCond():
                taken = (
                    node.thenBranch
                    if _truthy(self.eval(node.condition))
                    else node.elseBranch
                )
                return self.eval(taken)
            case m.HirLet():
                saved = dict(self.locals)
                try:
                    for binding in node.bindings:
                        self.locals[binding.name] = self.eval(binding.value)
                    return self.eval(node.body)
                finally:
                    self.locals = saved
            case m.HirMathCall():
                fn = node.fn.value
                if fn == "random":
                    raise HirEvaluationError(
                        "Math.random() is not evaluable in a constraint"
                    )
                args = [
                    _number(self.eval(argument), f"Math.{fn}()")
                    for argument in node.args
                ]
                try:
                    return _MATH_FNS[fn](*args)
                except (ValueError, OverflowError):
                    return math.nan
                except TypeError as error:
                    raise HirEvaluationError(
                        f"Math.{fn}() called with {len(args)} argument(s)"
                    ) from error
            case m.HirRecordLit():
                return {entry.key: self.eval(entry.value) for entry in node.entries}
            case m.HirArrayLit():
                return [self.eval(element) for element in node.elements]
            case m.HirArrayMap():
                return self._array_map(node)
            case m.HirArrayReduce():
                return self._array_reduce(node)
            case m.HirArrayConcat():
                left = self.eval(node.left)
                right = self.eval(node.right)
                if not isinstance(left, list) or not isinstance(right, list):
                    raise HirEvaluationError(".concat operands must be arrays")
                return [*left, *right]
            case (
                m.HirDistribution()
                | m.HirDistributionMap()
                | m.HirUuidGenerate()
                | m.HirUuidFrom()
            ):
                raise HirEvaluationError(
                    f'HIR node kind "{node.kind}" is not evaluable in a constraint'
                )

    def _string_call(self, node: m.HirStringCall) -> Value:
        target = self.eval(node.target)
        argument = self.eval(node.argument)
        fn = node.fn.value
        if not isinstance(target, str) or not isinstance(argument, str):
            raise HirEvaluationError(f".{fn}(...) is only available on strings")
        if fn == "startsWith":
            return target.startswith(argument)
        if fn == "endsWith":
            return target.endswith(argument)
        return argument in target

    def _binary(self, node: m.HirBinary) -> Value:
        op = node.op.value
        left = self.eval(node.left)
        if op == "&&":
            return self.eval(node.right) if _truthy(left) else left
        if op == "||":
            return left if _truthy(left) else self.eval(node.right)
        right = self.eval(node.right)
        if op == "==":
            return _strict_equal(left, right)
        if op == "!=":
            return not _strict_equal(left, right)
        if isinstance(left, str) and isinstance(right, str):
            if op == "+":
                return left + right
            if op in _COMPARISONS:
                return _compare(op, left, right)
        left_number = _number(left, f'"{op}"')
        right_number = _number(right, f'"{op}"')
        if op in _COMPARISONS:
            return _compare(op, left_number, right_number)
        if op == "+":
            return left_number + right_number
        if op == "-":
            return left_number - right_number
        if op == "*":
            return left_number * right_number
        if op == "/":
            if right_number == 0:
                # ECMAScript division never raises.
                if left_number == 0:
                    return math.nan
                return math.copysign(math.inf, left_number) * math.copysign(
                    1, right_number
                )
            return left_number / right_number
        if op == "%":
            if right_number == 0 or math.isinf(left_number):
                return math.nan
            # ECMAScript remainder takes the dividend's sign (math.fmod).
            return math.fmod(left_number, right_number)
        # `**`, through the JS-faithful pow: Python's `**` raises on overflow
        # and 0**negative, and goes complex for a negative base with a
        # fractional exponent, where JS yields ±Infinity / NaN.
        return _js_pow(left_number, right_number)

    def _array_map(self, node: m.HirArrayMap) -> list[Value]:
        target = self.eval(node.target)
        if not isinstance(target, list):
            raise HirEvaluationError(".map target is not an array")
        out: list[Value] = []
        saved = dict(self.locals)
        try:
            for index, element in enumerate(target):
                self.locals[node.param.name] = element
                if node.indexParam is not None:
                    self.locals[node.indexParam.name] = index
                out.append(self.eval(node.body))
        finally:
            self.locals = saved
        return out

    def _array_reduce(self, node: m.HirArrayReduce) -> Value:
        target = self.eval(node.target)
        if not isinstance(target, list):
            raise HirEvaluationError(".reduce target is not an array")
        accumulator = self.eval(node.initial)
        saved = dict(self.locals)
        try:
            for index, element in enumerate(target):
                self.locals[node.accParam.name] = accumulator
                self.locals[node.param.name] = element
                if node.indexParam is not None:
                    self.locals[node.indexParam.name] = index
                accumulator = self.eval(node.body)
        finally:
            self.locals = saved
        return accumulator

    # -- Signed margins ----------------------------------------------------

    def margin(self, node: HirExpr) -> float:
        """Robustness of a boolean expression: ``>= 0`` iff it evaluates to
        ``True``, with magnitude measuring the distance to the boundary.
        Comparisons yield signed slack; ``&&`` = ``min``, ``||`` = ``max``,
        ``!`` negates; a plain boolean is ``±inf`` (no boundary to measure).

        A slack that comes out NaN never leaves a comparison, because
        ``min``/``max`` would drop it by argument order and let a compound
        read satisfied while the boolean is false. The leaf resolves to
        ``±inf`` by asking the comparison itself: NaN operands make every
        JS comparison false, but ``inf`` against ``inf`` also cancels to a
        NaN slack while ``<=``, ``>=`` and ``==`` still hold.

        ``&&`` and ``||`` short-circuit exactly as evaluation does, so an
        arm guarded by the one before it — a count checked before the token
        it indexes — is never walked when evaluation would not walk it."""
        match node:
            case m.HirBinary():
                margin = self._binary_margin(node)
                if margin is not None:
                    return margin
            case m.HirUnary() if node.op.value == "!":
                return -self.margin(node.operand)
            case m.HirCond():
                taken = (
                    node.thenBranch
                    if _truthy(self.eval(node.condition))
                    else node.elseBranch
                )
                return self.margin(taken)
            case m.HirLet():
                saved = dict(self.locals)
                try:
                    for binding in node.bindings:
                        self.locals[binding.name] = self.eval(binding.value)
                    return self.margin(node.body)
                finally:
                    self.locals = saved
            case _:
                pass
        # A boolean leaf (literal, parameter, field): no boundary to measure.
        value = self.eval(node)
        if not isinstance(value, bool):
            raise HirEvaluationError(
                f"margin() requires a boolean expression, got a {type(value).__name__}"
            )
        return math.inf if value else -math.inf

    def _binary_margin(self, node: m.HirBinary) -> float | None:
        """The margin of a logical or comparison node; ``None`` for an
        arithmetic operator, which is a leaf for :meth:`margin`."""
        op = node.op.value
        if op == "&&":
            left_margin = self.margin(node.left)
            if left_margin < 0:
                return left_margin
            return min(left_margin, self.margin(node.right))
        if op == "||":
            left_margin = self.margin(node.left)
            if left_margin >= 0:
                return left_margin
            return max(left_margin, self.margin(node.right))
        if op in _COMPARISONS:
            left_value = _number(self.eval(node.left), f'"{op}"')
            right_value = _number(self.eval(node.right), f'"{op}"')
            slack = (
                right_value - left_value
                if op in ("<", "<=")
                else left_value - right_value
            )
            if math.isnan(slack):
                satisfied = _compare(op, left_value, right_value)
                return math.inf if satisfied else -math.inf
            return slack if op in ("<=", ">=") else _strict_slack(slack)
        if op in ("==", "!="):
            left, right = self.eval(node.left), self.eval(node.right)
            equal = _strict_equal(left, right)
            wanted = equal if op == "==" else not equal
            if (
                isinstance(left, bool)
                or isinstance(right, bool)
                or not isinstance(left, (int, float))
                or not isinstance(right, (int, float))
            ):
                # Booleans, strings, and composites have no distance to
                # measure: the boolean's sign is the whole answer.
                return math.inf if wanted else -math.inf
            distance = abs(float(left) - float(right))
            if math.isnan(distance):
                return math.inf if wanted else -math.inf
            return -distance if op == "==" else _strict_slack(distance)
        return None


# -- Entry points -----------------------------------------------------------------


def evaluate_hir(
    fn: HirFunction | Mapping[str, object],
    *,
    scenario: Mapping[str, Scalar] | None = None,
    parameters: Mapping[str, Scalar] | None = None,
    locals_: Mapping[str, Value] | None = None,
) -> Value:
    """Evaluate one serialized HIR function body.

    ``scenario`` binds ``scenario.<name>`` reads, ``parameters`` binds
    ``parameters.<name>`` reads, ``locals_`` binds the function's declared
    parameters (e.g. a metric-surface ``state`` record, as plain dicts and
    lists). A mapping is validated against the grammar first.
    """
    function = validate_hir_function(fn)
    return _Evaluator(scenario or {}, parameters or {}, dict(locals_ or {})).eval(
        function.body
    )


def hir_margin(
    fn: HirFunction | Mapping[str, object],
    *,
    scenario: Mapping[str, Scalar] | None = None,
    parameters: Mapping[str, Scalar] | None = None,
    locals_: Mapping[str, Value] | None = None,
) -> float:
    """The signed robustness margin of one boolean HIR function: ``>= 0``
    iff :func:`evaluate_hir` would return ``True``. Bindings as for
    :func:`evaluate_hir`."""
    function = validate_hir_function(fn)
    return _Evaluator(scenario or {}, parameters or {}, dict(locals_ or {})).margin(
        function.body
    )
