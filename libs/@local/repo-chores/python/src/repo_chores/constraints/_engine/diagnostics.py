from abc import ABC, abstractmethod
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import override

from repo_chores.constraints._engine.location import Location, LocationPath


class ManifestError(ValueError):
    def __init__(self, *, path: Path, field: LocationPath, message: str) -> None:
        self.path = path
        self.field = field
        self.message = message
        super().__init__(f"{Location(manifest=path, path=field)}: {message}")


class WorkspaceError(RuntimeError):
    def __init__(self, *, directory: Path, message: str) -> None:
        self.directory = directory
        self.message = message
        super().__init__(f"{directory}: {message}")


class ConcurrentManifestChangeError(ManifestError):
    def __init__(self, path: Path) -> None:
        super().__init__(
            path=path,
            field=(),
            message="manifest changed since loading, refusing to overwrite it",
        )


class FixError(OSError):
    def __init__(self, *, path: Path, written: tuple[Path, ...]) -> None:
        self.path = path
        self.written = written
        super().__init__(f"Could not replace {path}. Already written: {written}")


class ConvergenceError(WorkspaceError):
    pass


class ExceptionSink(ABC):
    @abstractmethod
    def error(self, exception: Exception) -> None: ...

    @abstractmethod
    def warning(self, message: Warning) -> None: ...


@dataclass(frozen=True, slots=True, kw_only=True)
class RuleError:
    location: Location
    rule: str
    error: Exception


@dataclass(frozen=True, slots=True, kw_only=True)
class RuleWarning:
    location: Location
    rule: str
    warning: Warning


type Diagnostic = RuleError | RuleWarning


class Diagnostics:
    def __init__(self) -> None:
        self.rule = "<constraint>"
        self._entries: list[Diagnostic] = []

    @property
    def entries(self) -> Iterable[Diagnostic]:
        return iter(self._entries)

    def error(self, *, location: Location, exception: Exception, rule: str | None = None) -> None:
        self._entries.append(
            RuleError(
                location=location,
                rule=self.rule if rule is None else rule,
                error=exception,
            )
        )

    def warning(self, *, location: Location, message: Warning, rule: str | None = None) -> None:
        self._entries.append(
            RuleWarning(
                location=location,
                rule=self.rule if rule is None else rule,
                warning=message,
            )
        )


class LocatedDiagnostics(ExceptionSink):
    def __init__(self, *, location: Location, diagnostics: Diagnostics) -> None:
        self._location = location
        self._diagnostics = diagnostics

    @override
    def error(self, exception: Exception) -> None:
        self._diagnostics.error(location=self._location, exception=exception)

    @override
    def warning(self, message: Warning) -> None:
        self._diagnostics.warning(location=self._location, message=message)
