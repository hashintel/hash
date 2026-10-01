from collections.abc import Iterator, Mapping, Sequence
from typing import overload

from packaging.dependency_groups import DependencyGroupResolver
from packaging.requirements import Requirement

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import DocumentArray, DocumentString, DocumentTable
from repo_chores.constraints._engine.strings import StringMap

type GroupInput = str | Mapping[str, str]


class GroupEntries(Sequence[GroupInput]):
    def __init__(self, value: DocumentArray) -> None:
        self._value = value

    def __len__(self) -> int:
        return len(self._value)

    @overload
    def __getitem__(self, index: int) -> GroupInput: ...
    @overload
    def __getitem__(self, index: slice) -> list[GroupInput]: ...

    def __getitem__(self, index: int | slice) -> GroupInput | list[GroupInput]:
        if isinstance(index, slice):
            return [self[position] for position in range(*index.indices(len(self)))]

        value = self._value.get(index)
        match value:
            case DocumentString():
                return value.item
            case DocumentTable():
                return StringMap(value, ())
            case _:
                raise ManifestError(
                    path=value.location.manifest,
                    field=value.location.path,
                    message="expected a requirement or include-group directive",
                )


class GroupDefinitions(Mapping[str, GroupEntries]):
    def __init__(self, document: DocumentTable) -> None:
        self._document = document

    def __getitem__(self, name: str) -> GroupEntries:
        value = self._document.expect(("dependency-groups", name), DocumentArray)
        if value is None:
            raise KeyError(name)

        return GroupEntries(value)

    def __iter__(self) -> Iterator[str]:
        table = self._document.expect(("dependency-groups",), DocumentTable)
        return iter(table) if table is not None else iter(())

    def __len__(self) -> int:
        return sum(1 for _ in self)


class DependencyGroups:
    """Resolve the current declarations without retaining the resolver's parsed cache."""

    def __init__(self, document: DocumentTable) -> None:
        self._document = document
        self._definitions = GroupDefinitions(document)

    @property
    def dependency_groups(self) -> Iterator[str]:
        return iter(self._definitions)

    def resolve(self, name: str) -> tuple[Requirement, ...]:
        try:
            return DependencyGroupResolver(self._definitions).resolve(name)
        except (ValueError, TypeError, LookupError, ExceptionGroup) as error:
            raise ManifestError(
                path=self._document.location.manifest,
                field=("dependency-groups", name),
                message=str(error),
            ) from error
