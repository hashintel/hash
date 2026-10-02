from abc import ABCMeta
from collections.abc import Callable, Iterable, MutableSequence
from copy import deepcopy
from typing import NoReturn, Self, overload, override

from packaging.requirements import Requirement as PackagingRequirement

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import DocumentArray, DocumentString
from repo_chores.constraints._engine.location import Location


def _field(name: str) -> property:
    def read(self: Requirement) -> object:
        return getattr(self._read(), name)

    def write(self: Requirement, value: object) -> None:
        self._assign(name=name, value=value)

    return property(read, write)


class RequirementMeta(ABCMeta):
    def __new__(
        cls, name: str, bases: tuple[type, ...], namespace: dict[str, object]
    ) -> RequirementMeta:
        for field in PackagingRequirement.__slots__:
            namespace.setdefault(field, _field(field))
        return super().__new__(cls, name, bases, namespace)


class Requirement(PackagingRequirement, metaclass=RequirementMeta):
    """A requirement whose field assignments replace its linked document string."""

    def __init__(self, value: DocumentString) -> None:
        self._value = value

    def _read(self) -> PackagingRequirement:
        try:
            return PackagingRequirement(self._value.item)
        except ValueError as error:
            raise ManifestError(
                path=self.location.manifest, field=self.location.path, message=str(error)
            ) from error

    def _assign(self, *, name: str, value: object) -> None:
        current = self._read()
        updated = self._read()
        setattr(updated, name, value)

        text = str(updated)
        reparsed = PackagingRequirement(text)

        if reparsed.specifier.to_range() != updated.specifier.to_range():
            raise ValueError(
                "The requirement's runtime prerelease policy cannot be represented in TOML"
            )

        if current == updated and current.specifier.to_range() == updated.specifier.to_range():
            return

        self._value.set(text)

    @property
    def location(self) -> Location:
        return self._value.location

    def value(self) -> DocumentString:
        return self._value

    @classmethod
    def from_packaging(cls, requirement: PackagingRequirement, *, location: Location) -> Self:
        text = str(requirement)
        if PackagingRequirement(text).specifier.to_range() != requirement.specifier.to_range():
            raise ValueError(
                "The requirement's runtime prerelease policy cannot be represented in TOML"
            )

        return cls(DocumentString.from_str(text, location=location))

    @override
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, PackagingRequirement):
            return NotImplemented
        return (
            PackagingRequirement.__eq__(self, other) is True
            and self.specifier.to_range() == other.specifier.to_range()
        )

    __hash__ = PackagingRequirement.__hash__

    @override
    def __str__(self) -> str:
        return str(self._read())

    def __copy__(self) -> PackagingRequirement:
        return self._read()

    def __deepcopy__(self, memo: dict[int, object]) -> PackagingRequirement:
        return deepcopy(self._read(), memo)


def cannot_compare(item: object) -> NoReturn:
    raise TypeError(f"Cannot compare {item}")


class RequirementList(MutableSequence[Requirement]):
    def __init__(self, requirements: DocumentArray) -> None:
        self._array = requirements

    def __len__(self) -> int:
        return len(self._array)

    @overload
    def __getitem__(self, index: int) -> Requirement: ...

    @overload
    def __getitem__(self, index: slice) -> list[Requirement]: ...

    @override
    def __getitem__(self, index: int | slice) -> Requirement | list[Requirement]:
        if isinstance(index, slice):
            return [self[position] for position in range(*index.indices(len(self)))]

        item = self._array.get(index)
        if not isinstance(item, DocumentString):
            raise ManifestError(
                path=item.location.manifest,
                field=item.location.path,
                message="expected a requirement string",
            )

        return Requirement(item)

    def _assign_slice(self, index: slice, value: Iterable[Requirement]) -> None:
        # Retain input nodes before an overlapping assignment changes their source entries.
        items = tuple(
            DocumentString(requirement.value().item, location=requirement.location)
            for requirement in value
        )

        start, stop, step = index.indices(len(self))

        positions = range(start, stop, step)
        if step != 1 and len(items) != len(positions):
            raise ValueError("extended slice assignment needs one requirement per selected entry")

        for position, item in zip(positions, items, strict=False):
            self._array.set(position, item)

        if step == 1:
            for position in reversed(range(start + len(items), stop)):
                self._array.delete(position)
            for offset in range(len(positions), len(items)):
                self._array.insert(start + offset, items[offset])

    @overload
    def __setitem__(self, index: int, value: Requirement) -> None: ...

    @overload
    def __setitem__(self, index: slice, value: Iterable[Requirement]) -> None: ...

    @override
    def __setitem__(self, index: int | slice, value: Requirement | Iterable[Requirement]) -> None:
        if isinstance(index, slice):
            if isinstance(value, Requirement):
                raise TypeError("slice assignment needs an iterable of requirements")

            self._assign_slice(index, value)
        elif isinstance(value, Requirement):
            self._array.set(index, value.value())
        else:
            raise TypeError("entry assignment needs a requirement")

    @override
    def __delitem__(self, index: int | slice) -> None:
        if isinstance(index, slice):
            for position in sorted(range(*index.indices(len(self))), reverse=True):
                self._array.delete(position)
        else:
            self._array.delete(index)

    @override
    def __contains__(self, item: object) -> bool:
        return isinstance(item, PackagingRequirement) and any(
            requirement == item for requirement in self
        )

    def insert(self, index: int, value: Requirement) -> None:
        self._array.insert(index, value.value())

    def sort_by(self, key: Callable[[Requirement], str]) -> None:
        self._array.sort_by(
            lambda item: (
                key(Requirement(item)) if isinstance(item, DocumentString) else cannot_compare(item)
            )
        )
