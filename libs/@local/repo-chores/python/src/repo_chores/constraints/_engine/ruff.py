from abc import ABC, abstractmethod
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import override

from repo_chores.constraints._engine.diagnostics import (
    Diagnostics,
    ExceptionSink,
    LocatedDiagnostics,
)
from repo_chores.constraints._engine.document import DocumentItem, DocumentString, DocumentTable
from repo_chores.constraints._engine.location import Location, LocationPath
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.strings import PathList, StringList, StringMap

_FIELD = ("tool", "ruff")


class RuffIgnoredRules(LocatedDiagnostics):
    def __init__(
        self, *, manifest: Manifest, diagnostics: Diagnostics, field: LocationPath
    ) -> None:
        super().__init__(
            location=Location(manifest=manifest.path, path=field), diagnostics=diagnostics
        )
        self._selectors = StringList(manifest.document, field)

    @property
    def selectors(self) -> StringList:
        return self._selectors


class RuffConfiguration(ExceptionSink, ABC):
    @property
    @abstractmethod
    def directory(self) -> Path: ...

    @property
    @abstractmethod
    def is_configured(self) -> bool: ...

    @is_configured.setter
    @abstractmethod
    def is_configured(self, value: bool) -> None: ...

    @property
    @abstractmethod
    def has_options(self) -> bool: ...

    @property
    @abstractmethod
    def target_version(self) -> str | None: ...

    @target_version.setter
    @abstractmethod
    def target_version(self, value: str | None) -> None: ...

    @property
    @abstractmethod
    def per_file_target_versions(self) -> Mapping[str, str] | None: ...

    @per_file_target_versions.setter
    @abstractmethod
    def per_file_target_versions(self, value: Mapping[str, str] | None) -> None: ...

    @property
    @abstractmethod
    def extend(self) -> Path | None: ...

    @extend.setter
    @abstractmethod
    def extend(self, value: Path | None) -> None: ...

    @property
    @abstractmethod
    def select(self) -> Iterable[str] | None: ...

    @select.setter
    @abstractmethod
    def select(self, value: Iterable[str] | None) -> None: ...

    @property
    @abstractmethod
    def source_roots(self) -> Iterable[Path]: ...

    @source_roots.setter
    @abstractmethod
    def source_roots(self, value: Iterable[Path]) -> None: ...

    @property
    @abstractmethod
    def ignored_rules(self) -> Iterable[RuffIgnoredRules]: ...


def _populated(value: DocumentItem) -> bool:
    match value:
        case DocumentTable():
            return any(_populated(value[name]) for name in value)
        case _:
            return True


class ManifestRuff(RuffConfiguration, LocatedDiagnostics):
    def __init__(self, *, manifest: Manifest, diagnostics: Diagnostics) -> None:
        LocatedDiagnostics.__init__(
            self, location=Location(manifest=manifest.path, path=_FIELD), diagnostics=diagnostics
        )
        self._manifest = manifest
        self._document = manifest.document
        self._diagnostics = diagnostics

    def _selection(self, field: LocationPath) -> StringList | None:
        selectors = StringList(self._document, (*_FIELD, *field))
        return selectors if selectors.exists else None

    @property
    @override
    def directory(self) -> Path:
        return self._manifest.path.parent

    @property
    @override
    def is_configured(self) -> bool:
        return self._document.expect(_FIELD, DocumentTable) is not None

    @is_configured.setter
    @override
    def is_configured(self, value: bool) -> None:
        if not value:
            self._document.remove(_FIELD)
        elif not self.is_configured:
            self._document.assign(
                field=_FIELD,
                value=DocumentTable.from_entries(
                    (), location=Location(manifest=self._manifest.path, path=_FIELD)
                ),
            )

    @property
    @override
    def has_options(self) -> bool:
        table = self._document.expect(_FIELD, DocumentTable)
        return table is not None and any(
            _populated(value) for name, value in table.items() if name != "extend"
        )

    @property
    @override
    def target_version(self) -> str | None:
        value = self._document.expect((*_FIELD, "target-version"), DocumentString)
        return value.item if value is not None else None

    @target_version.setter
    @override
    def target_version(self, value: str | None) -> None:
        self._document.set_string((*_FIELD, "target-version"), value)

    @property
    @override
    def per_file_target_versions(self) -> StringMap | None:
        field = (*_FIELD, "per-file-target-version")
        return (
            StringMap(self._document, field)
            if self._document.expect(field, DocumentTable) is not None
            else None
        )

    @per_file_target_versions.setter
    @override
    def per_file_target_versions(self, value: Mapping[str, str] | None) -> None:
        field = (*_FIELD, "per-file-target-version")

        if value is None:
            self._document.remove(field)
        else:
            StringMap(self._document, field).replace(value)

    @property
    @override
    def extend(self) -> Path | None:
        value = self._document.expect((*_FIELD, "extend"), DocumentString)
        return Path(value.item) if value is not None else None

    @extend.setter
    @override
    def extend(self, value: Path | None) -> None:
        if value is not None and value.is_absolute():
            value = value.relative_to(self.directory, walk_up=True)

        self._document.set_string(
            (*_FIELD, "extend"), value.as_posix() if value is not None else None
        )

    @property
    @override
    def select(self) -> StringList | None:
        modern = self._selection(("lint", "select"))
        return modern if modern is not None else self._selection(("select",))

    @select.setter
    @override
    def select(self, value: Iterable[str] | None) -> None:
        modern = StringList(self._document, (*_FIELD, "lint", "select"))

        if value is None:
            modern.remove()
        else:
            modern.replace(value)

        self._document.remove((*_FIELD, "select"))

    @property
    @override
    def source_roots(self) -> PathList:
        return PathList(self._document, (*_FIELD, "src"), directory=self.directory)

    @source_roots.setter
    @override
    def source_roots(self, value: Iterable[Path]) -> None:
        self.source_roots.replace(value)

    @property
    @override
    def ignored_rules(self) -> Iterable[RuffIgnoredRules]:
        for prefix in (_FIELD, (*_FIELD, "lint")):
            for key in ("ignore", "extend-ignore"):
                yield RuffIgnoredRules(
                    manifest=self._manifest, diagnostics=self._diagnostics, field=(*prefix, key)
                )
            for key in ("per-file-ignores", "extend-per-file-ignores"):
                table = self._document.expect((*prefix, key), DocumentTable)
                for pattern in table or ():
                    yield RuffIgnoredRules(
                        manifest=self._manifest,
                        diagnostics=self._diagnostics,
                        field=(*prefix, key, pattern),
                    )
