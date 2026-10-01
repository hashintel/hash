from pathlib import Path
from typing import Self

from tomlkit.exceptions import ParseError

from repo_chores.constraints._engine.diagnostics import (
    ConcurrentManifestChangeError,
    ManifestError,
)
from repo_chores.constraints._engine.document import Document


class Manifest:
    """A manifest's file identity, its original bytes and its live document."""

    def __init__(self, *, path: Path, original: bytes) -> None:
        self.path = path
        self.original = original
        try:
            self.document = Document(path=path, source=original.decode("utf-8"))
        except (ValueError, ParseError) as error:
            raise ManifestError(path=path, field=(), message=str(error)) from error

    @classmethod
    def load(cls, directory: Path) -> Self:
        path = directory / "pyproject.toml"
        if path.is_symlink():
            raise ManifestError(
                path=path, field=(), message="symlinked manifests are not supported"
            )
        try:
            original = path.read_bytes()
        except OSError as error:
            raise ManifestError(path=path, field=(), message=str(error)) from error
        return cls(path=path, original=original)

    def verify(self) -> None:
        if self.path.is_symlink():
            raise ConcurrentManifestChangeError(self.path)
        try:
            current = self.path.read_bytes()
        except OSError as error:
            raise ConcurrentManifestChangeError(self.path) from error
        if current != self.original:
            raise ConcurrentManifestChangeError(self.path)

    def render(self) -> bytes:
        return self.document.render().encode("utf-8")
