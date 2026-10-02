from abc import ABC, abstractmethod
from collections.abc import Iterable
from pathlib import Path
from typing import override

from repo_chores.constraints._engine.diagnostics import (
    Diagnostics,
    ExceptionSink,
    LocatedDiagnostics,
)
from repo_chores.constraints._engine.location import Location
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.strings import PathList

_FIELD = ("tool", "tach")


class TachConfiguration(ExceptionSink, ABC):
    @property
    @abstractmethod
    def source_roots(self) -> Iterable[Path]: ...

    @source_roots.setter
    @abstractmethod
    def source_roots(self, value: Iterable[Path]) -> None: ...

    @property
    @abstractmethod
    def excluded_paths(self) -> Iterable[Path]: ...

    @excluded_paths.setter
    @abstractmethod
    def excluded_paths(self, value: Iterable[Path]) -> None: ...


class ManifestTach(TachConfiguration, LocatedDiagnostics):
    def __init__(self, *, manifest: Manifest, diagnostics: Diagnostics) -> None:
        LocatedDiagnostics.__init__(
            self, location=Location(manifest=manifest.path, path=_FIELD), diagnostics=diagnostics
        )
        self._document = manifest.document
        self._directory = manifest.path.parent

    @property
    @override
    def source_roots(self) -> PathList:
        return PathList(self._document, (*_FIELD, "source_roots"), directory=self._directory)

    @source_roots.setter
    @override
    def source_roots(self, value: Iterable[Path]) -> None:
        self.source_roots.replace(value)

    @property
    @override
    def excluded_paths(self) -> PathList:
        return PathList(
            self._document, (*_FIELD, "exclude"), directory=self._directory, directories=True
        )

    @excluded_paths.setter
    @override
    def excluded_paths(self, value: Iterable[Path]) -> None:
        self.excluded_paths.replace(value)
