"""Native Turbo task declarations; execution remains Turbo's responsibility."""

from collections.abc import Iterable
from pathlib import Path
from typing import Self, override

from repo_chores.constraints._engine.jsonc import JsoncDocument
from repo_chores.constraints._engine.source_file import SourceFile


class TurboTask:
    def __init__(self, configuration: TurboConfiguration, name: str) -> None:
        self._configuration = configuration
        self._field = ("tasks", name)

    def _bootstrap(self) -> JsoncDocument:
        if self._configuration.document is not None:
            return self._configuration.document

        document = JsoncDocument(
            path=self._configuration.path,
            source='{"extends": ["//"], "tasks": {}}\n',
        )

        self._configuration.document = document
        return document

    @property
    def command(self) -> list[str] | None:
        document = self._configuration.document
        return document.strings((*self._field, "command")) if document is not None else None

    @command.setter
    def command(self, value: Iterable[str] | None) -> None:
        configuration = self._configuration
        document = configuration.document

        if document is None and value is None:
            return

        document = self._bootstrap()
        document.assign((*self._field, "command"), value)
        configuration.document = document

    @property
    def depends_on(self) -> list[str] | None:
        document = self._configuration.document
        return document.strings((*self._field, "dependsOn")) if document is not None else None

    @depends_on.setter
    def depends_on(self, value: Iterable[str] | None) -> None:
        configuration = self._configuration
        document = configuration.document

        if document is None and value is None:
            return

        document = self._bootstrap()
        document.assign((*self._field, "dependsOn"), value)
        configuration.document = document

    def remove_dependency(self, name: str) -> None:
        document = self._configuration.document
        if document is not None:
            document.remove_string((*self._field, "dependsOn"), name)


class TurboConfiguration(SourceFile):
    def __init__(self, *, path: Path, original: bytes | None) -> None:
        super().__init__(path=path, original=original)
        self.document = (
            JsoncDocument(path=path, source=original.decode("utf-8"))
            if original is not None
            else None
        )

    @classmethod
    def load(cls, directory: Path) -> Self:
        path = directory / "turbo.json"
        return cls(path=path, original=cls.read(path, missing_ok=True))

    def task(self, name: str) -> TurboTask:
        return TurboTask(self, name)

    @override
    def render(self) -> bytes | None:
        return self.document.render().encode("utf-8") if self.document is not None else None
