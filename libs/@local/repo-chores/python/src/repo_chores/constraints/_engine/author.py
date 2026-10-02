from collections.abc import Iterator

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import (
    DocumentArray,
    DocumentString,
    DocumentTable,
    DocumentTables,
)
from repo_chores.constraints._engine.location import Location, LocationPath


class Author:
    def __init__(self, value: DocumentTable) -> None:
        self._value = value

    @property
    def name(self) -> str | None:
        value = self._value.expect(("name",), DocumentString)
        return value.item if value is not None else None

    @name.setter
    def name(self, value: str | None) -> None:
        if value is None and self.email is None:
            raise ValueError("An author needs a name or an email address")

        self._value.set_string(("name",), value)

    @property
    def email(self) -> str | None:
        value = self._value.expect(("email",), DocumentString)
        return value.item if value is not None else None

    @email.setter
    def email(self, value: str | None) -> None:
        if value is None and self.name is None:
            raise ValueError("An author needs a name or an email address")

        self._value.set_string(("email",), value)


class AuthorList:
    def __init__(self, owner: DocumentTable, path: LocationPath) -> None:
        self._owner = owner
        self._path = path

    def _array(self) -> DocumentArray | DocumentTables | None:
        value = self._owner.at(self._path)
        if value is None or isinstance(value, DocumentArray | DocumentTables):
            return value

        raise ManifestError(
            path=value.location.manifest,
            field=value.location.path,
            message="expected author tables",
        )

    def __len__(self) -> int:
        array = self._array()
        return len(array) if array is not None else 0

    def __getitem__(self, index: int) -> Author:
        array = self._array()
        if array is None:
            raise IndexError(index)
        entry = array.get(index)
        if not isinstance(entry, DocumentTable):
            raise ManifestError(
                path=entry.location.manifest,
                field=entry.location.path,
                message="expected an author table",
            )
        return Author(entry)

    def __iter__(self) -> Iterator[Author]:
        return (self[index] for index in range(len(self)))

    def __delitem__(self, index: int | slice) -> None:
        array = self._array()
        if array is None:
            return
        indices = range(*index.indices(len(array))) if isinstance(index, slice) else (index,)
        for position in sorted(indices, reverse=True):
            array.delete(position)

    def append(self, *, name: str | None, email: str | None = None) -> None:
        if name is None and email is None:
            raise ValueError("An author needs a name or an email address")

        array = self._array()
        location = Location(
            manifest=self._owner.location.manifest, path=(*self._owner.location.path, *self._path)
        )

        table = DocumentTable.from_entries(
            (
                (
                    key,
                    DocumentString.from_str(
                        text, location=location.descend(len(self)).descend(key)
                    ),
                )
                for key, text in (("name", name), ("email", email))
                if text is not None
            ),
            location=location.descend(len(self)),
            inline=not isinstance(array, DocumentTables),
        )

        if array is None:
            self._owner.assign(
                field=self._path, value=DocumentArray.from_items((table,), location=location)
            )
        else:
            array.insert(len(array), table)
