from abc import ABC, abstractmethod
from collections.abc import Callable, Container, Iterable, Iterator, Mapping
from typing import override

from packaging.dependency_groups import DependencyGroupInclude
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

from repo_chores.constraints._engine.diagnostics import Diagnostics, ExceptionSink, ManifestError
from repo_chores.constraints._engine.document import (
    DocumentArray,
    DocumentItem,
    DocumentString,
    DocumentTable,
)
from repo_chores.constraints._engine.location import Location, LocationPath
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.requirement import Requirement as LinkedRequirement


class DependencyRequirement(LinkedRequirement, ExceptionSink, ABC):
    pass


type Entry = DependencyRequirement | DependencyGroupInclude


class DependencySet(Container[DependencyRequirement], Iterable[DependencyRequirement], ABC):
    @abstractmethod
    def has(self, name: str) -> bool: ...

    @abstractmethod
    def get(self, name: str) -> DependencyRequirement | None: ...

    @abstractmethod
    def insert(self, requirement: Requirement) -> None: ...

    @abstractmethod
    def sort(self, *, key: Callable[[Requirement], str]) -> None:
        """Sort requirements stably. Include directives stay where they are."""


class ManifestRequirement(DependencyRequirement):
    def __init__(self, value: DocumentString, *, diagnostics: Diagnostics) -> None:
        super().__init__(value)
        self._diagnostics = diagnostics

    @override
    def _assign(self, *, name: str, value: object) -> None:
        try:
            super()._assign(name=name, value=value)
        except (TypeError, ValueError) as error:
            self.error(error)

    @override
    def error(self, exception: Exception) -> None:
        self._diagnostics.error(location=self.location, exception=exception)

    @override
    def warning(self, message: Warning) -> None:
        self._diagnostics.warning(location=self.location, message=message)


class ManifestDependencies(DependencySet):
    def __init__(
        self,
        *,
        manifest: Manifest,
        field: LocationPath,
        diagnostics: Diagnostics,
        groups: Callable[[str], ManifestDependencies] | None = None,
    ) -> None:
        self.manifest = manifest
        self.field = field
        self.diagnostics = diagnostics
        self._groups = groups

    def _entry(self, value: DocumentItem) -> Entry:
        if isinstance(value, DocumentString):
            return ManifestRequirement(value, diagnostics=self.diagnostics)

        if self._groups is not None and isinstance(value, DocumentTable):
            include = value.get("include-group")
            if set(value) == {"include-group"} and isinstance(include, DocumentString):
                return DependencyGroupInclude(include_group=include.item)

        raise ValueError("expected a requirement string")

    def entries(self) -> Iterator[Entry]:
        try:
            for value in self.manifest.document.expect(self.field, DocumentArray) or ():
                yield self._entry(value)
        except ValueError as error:
            raise ManifestError(
                path=self.manifest.path, field=self.field, message=str(error)
            ) from error

    def declarations(self, visited: set[LocationPath]) -> Iterator[DependencyRequirement]:
        visited.add(self.field)
        for entry in self.entries():
            if isinstance(entry, DependencyRequirement):
                yield entry
            elif self._groups is not None:
                group = self._groups(entry.include_group)
                if group.field not in visited:
                    yield from group.declarations(visited)

    @property
    def location(self) -> Location:
        return Location(manifest=self.manifest.path, path=self.field)

    @staticmethod
    def _same_declaration(*, left: Requirement, right: Requirement) -> bool:
        return (
            canonicalize_name(left.name) == canonicalize_name(right.name)
            and {canonicalize_name(extra) for extra in left.extras}
            == {canonicalize_name(extra) for extra in right.extras}
            and left.marker == right.marker
        )

    @override
    def __iter__(self) -> Iterator[DependencyRequirement]:
        return (entry for entry in self.entries() if isinstance(entry, DependencyRequirement))

    @override
    def __contains__(self, requirement: object) -> bool:
        return isinstance(requirement, Requirement) and any(entry == requirement for entry in self)

    @override
    def has(self, name: str) -> bool:
        normalized = canonicalize_name(name, validate=True)
        return any(canonicalize_name(entry.name) == normalized for entry in self)

    @override
    def get(self, name: str) -> DependencyRequirement | None:
        normalized = canonicalize_name(name, validate=True)
        matches = [entry for entry in self if canonicalize_name(entry.name) == normalized]

        if len(matches) > 1:
            self.diagnostics.warning(
                location=self.location,
                message=UserWarning(
                    f"Multiple requirements named {name!r}; returning the last declaration"
                ),
            )

        return matches[-1] if matches else None

    @override
    def insert(self, requirement: Requirement) -> None:
        try:
            value = LinkedRequirement.from_packaging(requirement, location=self.location).value()
        except (TypeError, ValueError) as error:
            self.diagnostics.error(location=self.location, exception=error)
            return

        matches = [
            entry
            for entry in self.declarations(set())
            if self._same_declaration(left=entry, right=requirement)
        ]

        if len(matches) > 1:
            self.diagnostics.warning(
                location=self.location,
                message=UserWarning(
                    f"Multiple declarations of {requirement.name!r}; applying the inserted requirement to each"
                ),
            )

        for entry in matches:
            if entry != requirement:
                entry.value().set(value.item)

        if not matches:
            array = self.manifest.document.expect(self.field, DocumentArray)
            if array is None:
                self.manifest.document.assign(
                    field=self.field,
                    value=DocumentArray.from_items((value,), location=self.location),
                )
            else:
                array.insert(len(array), value)

    @override
    def sort(self, *, key: Callable[[Requirement], str]) -> None:
        array = self.manifest.document.expect(self.field, DocumentArray)
        if array is None:
            return

        entries = tuple(self.entries())
        keys = {
            index: key(entry)
            for index, entry in enumerate(entries)
            if isinstance(entry, Requirement)
        }

        order: list[int] = []
        run: list[int] = []

        for index in range(len(entries)):
            if index in keys:
                run.append(index)
            else:
                order.extend(sorted(run, key=keys.__getitem__))
                order.append(index)
                run = []

        order.extend(sorted(run, key=keys.__getitem__))
        array.permute(order)


class DependencyMap(Mapping[str, DependencySet]):
    def __init__(
        self, *, manifest: Manifest, field: LocationPath, diagnostics: Diagnostics
    ) -> None:
        self._manifest = manifest
        self._field = field
        self._diagnostics = diagnostics

    @override
    def __getitem__(self, name: str) -> DependencySet:
        if name not in self:
            raise KeyError(name)

        return ManifestDependencies(
            manifest=self._manifest, field=(*self._field, name), diagnostics=self._diagnostics
        )

    @override
    def __contains__(self, name: object) -> bool:
        table = self._manifest.document.expect(self._field, DocumentTable)

        return table is not None and name in table

    @override
    def __iter__(self) -> Iterator[str]:
        table = self._manifest.document.expect(self._field, DocumentTable)

        return iter(table) if table is not None else iter(())

    @override
    def __len__(self) -> int:
        return sum(1 for _ in self)
