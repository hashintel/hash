"""Ergonomic API to create different type-checked filters for use in structural queries.

This module provides a set of classes
that can be used to create type-checked filters for
use in structural queries.

To combine filters use the `&` and `|` operators. If you prefer explicit operations,
you can also use `BaseFilter.and_()` and `BaseFilter.or_()` respectively.

To create filters use `==` or `!=` with a `Path` and `Parameter`.
If you prefer explicit operations you can also use `BaseFilter.equal()`
and `BaseFilter.not_equal()` respectively.

To create a filter that will always match use `BaseFilter.always()`.
Use `BaseFilter.never()` to create a filter that will never match.
"""

from abc import ABC, abstractmethod
from collections.abc import Sequence
from enum import Enum
from typing import Any, Generic, Never, Protocol, Self, TypeVar, assert_never

from graph_client import QueryToken
from graph_client.models import (
    AllFilter,
    AnyFilter,
    ContainsSegmentFilter,
    EndsWithFilter,
    EqualFilter,
    Filter,
    FilterExpression,
    NotEqualFilter,
    NotFilter,
    ParameterExpression,
    PathExpression,
    StartsWithFilter,
)
from pydantic import BaseModel


class FFIConversionProtocol(Protocol):
    """Protocol for converting to and from FFI objects."""

    def to_ffi(self) -> BaseModel:
        """Converts the object to a FFI object."""
        ...


class UnaryOperation(Enum):
    """Unary operations."""

    NOT = "not"


class BinaryOperation(Enum):
    """Binary operations."""

    EQUAL = "equal"
    NOT_EQUAL = "notEqual"
    STARTS_WITH = "startsWith"
    ENDS_WITH = "endsWith"
    CONTAINS_SEGMENT = "containsSegment"


class NaryOperation(Enum):
    """Nary operations."""

    ALL = "all"
    ANY = "any"


L = TypeVar("L", bound="BaseFilterExpression")
R = TypeVar("R", bound="BaseFilterExpression")
F = TypeVar("F", bound="BaseFilter")


class BaseFilter(ABC):
    """Protocol for queries."""

    def all_(
        self,
        other: Sequence[F],
    ) -> "NaryFilter[Self | F]":
        """Combines two or more queries with an AND."""
        return NaryFilter(NaryOperation.ALL, [self, *other])

    def __and__(self, other: F) -> "NaryFilter[Self | F]":
        """Combines two queries with an AND."""
        if isinstance(other, BaseFilter):
            return self.all_((other,))

        msg: str  # type: ignore[unreachable]
        msg = f"unsupported operand type(s) for &: '{type(self)}' and '{type(other)}'"
        raise TypeError(msg)

    def any_(
        self,
        other: Sequence[F],
    ) -> "NaryFilter[Self | F]":
        """Combines two or more queries with an OR."""
        return NaryFilter(NaryOperation.ANY, [self, *other])

    def __or__(self, other: F) -> "NaryFilter[Self | F]":
        """Combines two queries with an OR."""
        if isinstance(other, BaseFilter):
            return self.any_((other,))

        msg: str  # type: ignore[unreachable]
        msg = f"unsupported operand type(s) for |: '{type(self)}' and '{type(other)}'"
        raise TypeError(msg)

    def not_(self) -> "UnaryFilter[Self]":
        """Negates the query."""
        return UnaryFilter(UnaryOperation.NOT, self)

    def __invert__(self) -> "UnaryFilter[Self]":
        """Negates the query."""
        return self.not_()

    @classmethod
    def always(cls) -> "NaryFilter[Never]":
        """Returns a query that always returns true.

        Warning:
        -------
        Using this query is generally discouraged,
        and should only be used if there is no other way.

        This will return everything, which means that depending
        on graph size, this **will** return a lot of data.
        """
        return NaryFilter(NaryOperation.ALL, [])

    @classmethod
    def never(cls) -> "NaryFilter[Never]":
        """Returns a query that always returns false."""
        return NaryFilter(NaryOperation.ANY, [])

    @abstractmethod
    def to_ffi(self) -> Filter:
        """Converts the query to an FFI query."""
        ...


class UnaryFilter(BaseFilter, Generic[F]):
    """Unary query."""

    operation: UnaryOperation
    operand: F

    def __init__(self, operation: UnaryOperation, operand: F) -> None:
        """Initializes the unary query."""
        self.operation = operation
        self.operand = operand

    def __repr__(self) -> str:
        """Returns a string representation of the unary query."""
        return f"UnaryFilter({self.operation}, {self.operand})"

    def to_ffi(self) -> Filter:
        """Converts the query to an FFI query."""
        operation = self.operation

        if operation == UnaryOperation.NOT:
            return Filter(root=NotFilter(not_=self.operand.to_ffi()))

        assert_never(operation)


class BinaryFilter(BaseFilter, Generic[L, R]):
    """Binary query."""

    operation: BinaryOperation
    lhs: L
    rhs: R

    def __init__(self, operation: BinaryOperation, lhs: L, rhs: R) -> None:
        """Initializes the binary query."""
        self.operation = operation
        self.lhs = lhs
        self.rhs = rhs

    def __repr__(self) -> str:
        """Returns a string representation of the binary query."""
        return f"BinaryFilter({self.operation}, {self.lhs}, {self.rhs})"

    def to_ffi(self) -> Filter:
        """Converts the query to an FFI query."""
        operation = self.operation

        match operation:
            case BinaryOperation.EQUAL:
                return Filter(
                    root=EqualFilter(
                        equal=[self.lhs.to_ffi(), self.rhs.to_ffi()],
                    ),
                )
            case BinaryOperation.NOT_EQUAL:
                return Filter(
                    root=NotEqualFilter(
                        not_equal=[self.lhs.to_ffi(), self.rhs.to_ffi()],
                    ),
                )
            case BinaryOperation.STARTS_WITH:
                return Filter(
                    root=StartsWithFilter(
                        starts_with=[self.lhs.to_ffi(), self.rhs.to_ffi()],
                    ),
                )
            case BinaryOperation.ENDS_WITH:
                return Filter(
                    root=EndsWithFilter(
                        ends_with=[self.lhs.to_ffi(), self.rhs.to_ffi()],
                    ),
                )
            case BinaryOperation.CONTAINS_SEGMENT:
                return Filter(
                    root=ContainsSegmentFilter(
                        contains_segment=[self.lhs.to_ffi(), self.rhs.to_ffi()],
                    ),
                )
            case _:
                assert_never(operation)


# I would love to use TypeVarTuple here, but the ecosystem is not ready yet.
class NaryFilter(BaseFilter, Generic[F]):
    """Nary query."""

    operation: NaryOperation
    operands: list[F]

    def __init__(
        self,
        operation: NaryOperation,
        operands: Sequence[F],
    ) -> None:
        """Initializes the nary query."""
        self.operation = operation
        self.operands = [*operands]

    def __repr__(self) -> str:
        """Returns a string representation of the nary query."""
        return f"NaryFilter({self.operation}, {self.operands})"

    def to_ffi(self) -> Filter:
        """Converts the query to an FFI query."""
        operation = self.operation

        match operation:
            case NaryOperation.ALL:
                return Filter(
                    root=AllFilter(
                        all=[operand.to_ffi() for operand in self.operands],
                    ),
                )
            case NaryOperation.ANY:
                return Filter(
                    root=AnyFilter(
                        any=[operand.to_ffi() for operand in self.operands],
                    ),
                )
            case _:
                assert_never(operation)


class BaseFilterExpression(ABC):
    """Protocol for filters."""

    def equals(self, other: R) -> BinaryFilter[Self, R]:
        """Checks if two filters are equal."""
        return BinaryFilter(BinaryOperation.EQUAL, self, other)

    def __eq__(self, other: R) -> BinaryFilter[Self, R]:  # type: ignore[override]
        """Checks if two filters are equal."""
        if isinstance(other, BaseFilterExpression):
            return self.equals(other)

        msg: str  # type: ignore[unreachable]
        msg = f"unsupported operand type(s) for ==: '{type(self)}' and '{type(other)}'"
        raise TypeError(msg)

    def not_equals(self, other: R) -> BinaryFilter[Self, R]:
        """Checks if two filters are not equal."""
        return BinaryFilter(BinaryOperation.NOT_EQUAL, self, other)

    def __ne__(self, other: R) -> BinaryFilter[Self, R]:  # type: ignore[override]
        """Checks if two filters are not equal."""
        if isinstance(other, BaseFilterExpression):
            return self.not_equals(other)

        msg: str  # type: ignore[unreachable]
        msg = f"unsupported operand type(s) for !=: '{type(self)}' and '{type(other)}'"
        raise TypeError(msg)

    def starts_with(self, other: R) -> BinaryFilter[Self, R]:
        """Checks if the left filter starts with the right filter."""
        return BinaryFilter(BinaryOperation.STARTS_WITH, self, other)

    def ends_with(self, other: R) -> BinaryFilter[Self, R]:
        """Checks if the left filter ends with the right filter."""
        return BinaryFilter(BinaryOperation.ENDS_WITH, self, other)

    def contains_segment(self, other: R) -> BinaryFilter[Self, R]:
        """Checks if the left filter contains the right filter as a segment."""
        return BinaryFilter(BinaryOperation.CONTAINS_SEGMENT, self, other)

    @abstractmethod
    def to_ffi(self) -> FilterExpression:
        """Converts the filter to an FFI filter."""
        ...


class Parameter(BaseFilterExpression):
    """Values that are given to queries as parameters."""

    value: Any

    def __init__(self, value: Any) -> None:  # noqa: ANN401
        """Initializes the parameter with a value."""
        self.value = value

    def __repr__(self) -> str:
        """Returns a string representation of the parameter."""
        return f"Parameter({self.value!r})"

    def to_ffi(self) -> FilterExpression:
        """Converts the parameter to a FFI object."""
        return FilterExpression(root=ParameterExpression(parameter=self.value))


class Path(BaseFilterExpression):
    """A path to a value in a query."""

    value: list[QueryToken]

    def __init__(self) -> None:
        """Initialize the path with an empty vector."""
        self.value = []

    def __repr__(self) -> str:
        """Return the repr."""
        return f"{self.__class__.__name__}({self.value!r})"

    @classmethod
    def from_ffi(cls, value: list[QueryToken]) -> Self:
        """Initialize the path with a vector."""
        self = cls()
        self.value = value[::]

        return self

    def push(self, value: QueryToken) -> Self:
        """Push a value onto the path."""
        tokens = self.value[::]
        tokens.append(value)

        return self.from_ffi(tokens)

    def _finish(self) -> PathExpression:
        """Finish the path."""
        return PathExpression(path=self.value)

    def to_ffi(self) -> FilterExpression:
        """Converts the path to a FFI object."""
        return FilterExpression(root=self._finish())
