from abc import ABC, abstractmethod
from collections.abc import Iterator, Mapping
from typing import override

from packaging.utils import NormalizedName, canonicalize_name

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import (
    DocumentArray,
    DocumentTable,
    DocumentTables,
    DocumentValue,
)
from repo_chores.constraints._engine.document_native import NativeTable
from repo_chores.constraints._engine.location import Location
from repo_chores.constraints._engine.manifest import Manifest

_FIELD = ("tool", "uv", "sources")


class DependencySource:
    def __init__(
        self, definition: DocumentTable[NativeTable] | DocumentArray | DocumentTables
    ) -> None:
        self._definition = definition

    @property
    def definition(self) -> DocumentTable[NativeTable] | DocumentArray | DocumentTables:
        return self._definition

    @property
    def is_workspace(self) -> bool:
        definition = self.definition

        if not isinstance(definition, DocumentTable) or len(definition) != 1:
            return False

        value = definition.get("workspace")
        return isinstance(value, DocumentValue) and value.boolean


class DependencySources(Mapping[NormalizedName, DependencySource], ABC):
    @abstractmethod
    def use_workspace(self, name: str) -> None: ...


class ManifestSources(DependencySources):
    def __init__(self, manifest: Manifest) -> None:
        self._document = manifest.document

    def _keys(self) -> dict[NormalizedName, str]:
        names: dict[NormalizedName, str] = {}
        for name in self._document.expect(_FIELD, DocumentTable) or ():
            try:
                normalized = canonicalize_name(name, validate=True)
            except ValueError as error:
                raise ManifestError(
                    path=self._document.location.manifest, field=(*_FIELD, name), message=str(error)
                ) from error

            if normalized in names:
                raise ManifestError(
                    path=self._document.location.manifest,
                    field=(*_FIELD, name),
                    message=f"duplicate normalized source name {normalized!r}",
                )

            names[normalized] = name

        return names

    @override
    def __getitem__(self, name: str) -> DependencySource:
        key = self._keys()[canonicalize_name(name)]
        value = self._document.at((*_FIELD, key))

        if not isinstance(value, DocumentTable | DocumentArray | DocumentTables):
            raise ManifestError(
                path=self._document.location.manifest,
                field=(*_FIELD, key),
                message="expected a source table or array of tables",
            )

        return DependencySource(value)

    @override
    def use_workspace(self, name: str) -> None:
        normalized = canonicalize_name(name, validate=True)
        key = self._keys().get(normalized, normalized)
        location = Location(manifest=self._document.location.manifest, path=(*_FIELD, key))

        table = DocumentTable.from_entries(
            (
                (
                    "workspace",
                    DocumentValue.from_bool(value=True, location=location.descend("workspace")),
                ),
            ),
            location=location,
            inline=True,
        )

        self._document.assign(field=(*_FIELD, key), value=table)

    @override
    def __iter__(self) -> Iterator[NormalizedName]:
        return iter(self._keys())

    @override
    def __len__(self) -> int:
        return len(self._keys())
