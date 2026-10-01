from pathlib import Path
from typing import Self, override

from tomlkit.exceptions import ParseError

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import Document
from repo_chores.constraints._engine.source_file import SourceFile


class Manifest(SourceFile):
    """A manifest's file identity, its original bytes and its live document."""

    def __init__(self, *, path: Path, original: bytes) -> None:
        super().__init__(path=path, original=original)
        try:
            self.document = Document(path=path, source=original.decode("utf-8"))
        except (ValueError, ParseError) as error:
            raise ManifestError(path=path, field=(), message=str(error)) from error

    @classmethod
    def load(cls, directory: Path) -> Self:
        path = directory / "pyproject.toml"
        original = cls.read(path)
        if original is None:
            raise ManifestError(path=path, field=(), message="manifest is missing")
        return cls(path=path, original=original)

    @override
    def render(self) -> bytes:
        return self.document.render().encode("utf-8")
