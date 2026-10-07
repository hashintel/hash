from abc import ABC, abstractmethod
from collections.abc import Iterable
from pathlib import Path
from typing import override

from repo_chores.constraints._engine.diagnostics import (
    Diagnostics,
    ExceptionSink,
    LocatedDiagnostics,
    ManifestError,
)
from repo_chores.constraints._engine.document import DocumentTable
from repo_chores.constraints._engine.location import Location, LocationPath
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.strings import PathList


class PytestConfiguration(ExceptionSink, ABC):
    @property
    @abstractmethod
    def test_paths(self) -> Iterable[Path]: ...

    @test_paths.setter
    @abstractmethod
    def test_paths(self, value: Iterable[Path]) -> None: ...

    @property
    @abstractmethod
    def python_paths(self) -> Iterable[Path]: ...

    @python_paths.setter
    @abstractmethod
    def python_paths(self, value: Iterable[Path]) -> None: ...


class ManifestPytest(PytestConfiguration, LocatedDiagnostics):
    def __init__(self, *, manifest: Manifest, diagnostics: Diagnostics) -> None:
        LocatedDiagnostics.__init__(
            self,
            location=Location(manifest=manifest.path, path=("tool", "pytest")),
            diagnostics=diagnostics,
        )
        self._document = manifest.document
        self._directory = manifest.path.parent

    @property
    def _field(self) -> LocationPath:
        config = self._document.expect(("tool", "pytest"), DocumentTable)
        if config is not None and "ini_options" not in config:
            return ("tool", "pytest")

        if config is not None and len(config) != 1:
            raise ManifestError(
                path=self._document.location.manifest,
                field=("tool", "pytest"),
                message="cannot combine native pytest settings with ini_options",
            )

        return ("tool", "pytest", "ini_options")

    def _paths(self, key: str) -> PathList:
        return PathList(self._document, (*self._field, key), directory=self._directory)

    @property
    @override
    def test_paths(self) -> PathList:
        return self._paths("testpaths")

    @test_paths.setter
    @override
    def test_paths(self, value: Iterable[Path]) -> None:
        self.test_paths.replace(value)

    @property
    @override
    def python_paths(self) -> PathList:
        return self._paths("pythonpath")

    @python_paths.setter
    @override
    def python_paths(self, value: Iterable[Path]) -> None:
        self.python_paths.replace(value)
