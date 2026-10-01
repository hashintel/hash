import difflib
from dataclasses import dataclass, field
from enum import Enum, auto
from pathlib import Path
from typing import override

from repo_chores.constraints._engine.diagnostics import (
    Diagnostic,
    RuleError,
    RuleWarning,
)
from repo_chores.constraints._engine.document import Operation


class CheckStatus(Enum):
    CLEAN = auto()
    CHANGES = auto()
    BLOCKED = auto()


class FixStatus(Enum):
    UNCHANGED = auto()
    APPLIED = auto()
    BLOCKED = auto()


@dataclass(frozen=True, slots=True, kw_only=True)
class ManifestDiff:
    """A manifest's original bytes and the bytes a fix would write."""

    path: Path
    before: bytes
    after: bytes

    def unified(self, *, name: str | None = None) -> str:
        label = name if name is not None else str(self.path)
        return "".join(
            difflib.unified_diff(
                self.before.decode("utf-8").splitlines(keepends=True),
                self.after.decode("utf-8").splitlines(keepends=True),
                fromfile=f"a/{label}",
                tofile=f"b/{label}",
            )
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class CheckReport:
    """The chronological operation trace, the final per-file diff and the final pass's diagnostics."""

    operations: tuple[Operation, ...]
    diffs: tuple[ManifestDiff, ...]
    diagnostics: tuple[Diagnostic, ...]
    passes: int
    status: CheckStatus = field(init=False)

    def __post_init__(self) -> None:
        if any(isinstance(entry, RuleError) for entry in self.diagnostics):
            status = CheckStatus.BLOCKED
        elif self.diffs:
            status = CheckStatus.CHANGES
        else:
            status = CheckStatus.CLEAN

        object.__setattr__(self, "status", status)

    @override
    def __str__(self) -> str:
        lines = [
            f"{operation.location}: {operation.kind.value} {operation.before!r} -> "
            f"{operation.after!r} ({operation.rule}, pass {operation.pass_number})"
            for operation in self.operations
        ]

        for diagnostic in self.diagnostics:
            match diagnostic:
                case RuleError(location=location, rule=rule, error=error):
                    lines.append(f"{location}: error in {rule}: {error}")
                case RuleWarning(location=location, rule=rule, warning=warning):
                    lines.append(f"{location}: warning in {rule}: {warning}")

        return "\n".join(lines) if lines else "No constraint violations."


@dataclass(frozen=True, slots=True, kw_only=True)
class FixReport:
    report: CheckReport
    written: tuple[Path, ...]
    status: FixStatus = field(init=False)

    def __post_init__(self) -> None:
        if self.report.status is CheckStatus.BLOCKED:
            status = FixStatus.BLOCKED
        elif self.written:
            status = FixStatus.APPLIED
        else:
            status = FixStatus.UNCHANGED

        object.__setattr__(self, "status", status)

    @override
    def __str__(self) -> str:
        return f"{self.report}\nUpdated {len(self.written)} manifest(s)."
