from abc import ABC
from typing import Generic, Self, TypeVar

from graph_client import QueryToken
from graph_client.models import Selector

from graph_sdk.query import Path


class AbstractPath(ABC):
    """An abstract path."""

    path: Path

    def __init__(self) -> None:
        """Initialize the filter with a path."""
        self.path = Path()

    @classmethod
    def from_list(cls, value: list[QueryToken]) -> Self:
        """Initialize the filter with a vector."""
        self = cls()
        self.path = Path.from_list(value)
        return self

    @classmethod
    def from_path(cls, path: Path) -> Self:
        """Initialize the filter with a path."""
        self = cls()
        self.path = path
        return self


T = TypeVar("T", bound=AbstractPath)


class SelectorPath(AbstractPath, Generic[T]):
    """A selector is a path that is used to select a value in an array."""

    cls: type[T]

    def set_cls(self, cls: type[T]) -> Self:
        """Set the class of the selector."""
        self.cls = cls
        return self

    def all_(self) -> T:
        """Return the path to all values in an array."""
        return self.cls.from_path(self.path.push(Selector(root="*")))


class PropertiesPath(AbstractPath):
    """Navigation through properties, which is largely untyped."""

    def array(self, index: int) -> Self:
        """Return the path to the array for a property."""
        return self.from_path(self.path.push(index))

    def array_all(self) -> Self:
        """Return the path to the array for a property."""
        return self.from_path(self.path.push("*"))

    def key(self, key: str) -> Self:
        """Return the path to the key for a property."""
        return self.from_path(self.path.push(key))

    def finish(self) -> Path:
        """Return the path to the finish for a property."""
        return self.path
