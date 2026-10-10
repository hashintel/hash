from collections.abc import Iterable, Iterator, Mapping
from contextlib import suppress
from pathlib import Path
from typing import override

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import DocumentArray, DocumentString, DocumentTable
from repo_chores.constraints._engine.document_native import NativeTable
from repo_chores.constraints._engine.location import Location, LocationPath


class StringList(Iterable[str]):
    """A live string collection at a document field."""

    def __init__(
        self, owner: DocumentTable[NativeTable], path: LocationPath, *, scalar: bool = False
    ) -> None:
        self._owner = owner
        self._path = path
        self._scalar = scalar

    @property
    def location(self) -> Location:
        return Location(
            manifest=self._owner.location.manifest, path=(*self._owner.location.path, *self._path)
        )

    @property
    def exists(self) -> bool:
        return self._owner.at(self._path) is not None

    @override
    def __iter__(self) -> Iterator[str]:
        value = self._owner.at(self._path)

        if self._scalar and isinstance(value, DocumentString):
            yield value.item
        else:
            array = self._owner.expect(self._path, DocumentArray)
            if array is not None:
                for entry in array.strings():
                    yield entry.item

    def __len__(self) -> int:
        return sum(1 for _ in self)

    def replace(self, values: Iterable[str]) -> None:
        if self._scalar:
            entries = tuple(values)
            with suppress(ManifestError):
                if self.exists and entries == tuple(self):
                    return

            if len(entries) == 1:
                self._owner.set_string(self._path, entries[0])
                return

            values = entries

        self._owner.assign(
            field=self._path, value=DocumentArray.from_strings(values, location=self.location)
        )

    def remove(self) -> None:
        self._owner.remove(self._path)


class PathList(Iterable[Path]):
    def __init__(
        self,
        owner: DocumentTable[NativeTable],
        path: LocationPath,
        *,
        directory: Path,
        directories: bool = False,
    ) -> None:
        self._strings = StringList(owner, path)
        self._directory = directory
        self._directories = directories

    @override
    def __iter__(self) -> Iterator[Path]:
        return (Path(value) for value in self._strings)

    def replace(self, paths: Iterable[Path]) -> None:
        def encoded() -> Iterator[str]:
            for path in paths:
                relative = (
                    path.relative_to(self._directory, walk_up=True) if path.is_absolute() else path
                )
                text = relative.as_posix()
                yield text.rstrip("/") + "/" if self._directories else text

        self._strings.replace(encoded())


class StringMap(Mapping[str, str]):
    def __init__(self, owner: DocumentTable[NativeTable], path: LocationPath) -> None:
        self._owner = owner
        self._path = path

    @override
    def __getitem__(self, name: str) -> str:
        value = self._owner.expect((*self._path, name), DocumentString)
        if value is None:
            raise KeyError(name)
        return value.item

    @override
    def __iter__(self) -> Iterator[str]:
        table = self._owner.expect(self._path, DocumentTable)
        return iter(table) if table is not None else iter(())

    @override
    def __len__(self) -> int:
        return sum(1 for _ in self)

    def replace(self, values: Mapping[str, str]) -> None:
        location = Location(
            manifest=self._owner.location.manifest, path=(*self._owner.location.path, *self._path)
        )

        table = DocumentTable.from_entries(
            (
                (name, DocumentString.from_str(value, location=location.descend(name)))
                for name, value in values.items()
            ),
            location=location,
        )

        self._owner.assign(field=self._path, value=table)
