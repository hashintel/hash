"""File identity and original-byte verification shared by document formats."""

from abc import ABC, abstractmethod
from pathlib import Path

from repo_chores.constraints._engine.diagnostics import ConcurrentManifestChangeError, ManifestError


class SourceFile(ABC):
    def __init__(self, *, path: Path, original: bytes | None) -> None:
        self.path = path
        self.original = original

    @staticmethod
    def read(path: Path, *, missing_ok: bool = False) -> bytes | None:
        if path.is_symlink():
            raise ManifestError(path=path, field=(), message="symlinked inputs are not supported")
        try:
            return path.read_bytes()
        except FileNotFoundError as error:
            if missing_ok:
                return None
            raise ManifestError(path=path, field=(), message=str(error)) from error
        except OSError as error:
            raise ManifestError(path=path, field=(), message=str(error)) from error

    def verify(self) -> None:
        if self.path.is_symlink():
            raise ConcurrentManifestChangeError(self.path)
        try:
            current = self.path.read_bytes()
        except FileNotFoundError as error:
            if self.original is None:
                return
            raise ConcurrentManifestChangeError(self.path) from error
        except OSError as error:
            raise ConcurrentManifestChangeError(self.path) from error
        if current != self.original:
            raise ConcurrentManifestChangeError(self.path)

    @abstractmethod
    def render(self) -> bytes | None: ...
