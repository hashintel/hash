"""Rich presentation of structured constraint reports for the CLI only."""

import os
from collections import defaultdict
from collections.abc import Mapping
from pathlib import Path
from typing import TextIO

from rich.console import Console
from rich.text import Text

from repo_chores.constraints._engine.diagnostics import (
    FixError,
    ManifestError,
    RuleError,
    RuleWarning,
    WorkspaceError,
)
from repo_chores.constraints._engine.document import Operation
from repo_chores.constraints._engine.location import Location
from repo_chores.constraints._engine.report import (
    CheckReport,
    CheckStatus,
    FixReport,
    FixStatus,
    ManifestDiff,
)


def _relative(path: Path, directory: Path) -> str:
    return os.path.relpath(path.absolute(), start=directory.absolute())


def _value(value: object) -> str:
    if isinstance(value, Mapping):
        return (
            "{" + ", ".join(f"{_value(key)}: {_value(item)}" for key, item in value.items()) + "}"
        )

    if isinstance(value, (list, tuple, set, frozenset)):
        return "[" + ", ".join(_value(item) for item in value) + "]"
    if isinstance(value, str):
        return repr(value)
    if value is None:
        return "absent"

    return str(value)


def _field(location: Location) -> str:
    field = ""
    for component in location.path:
        if isinstance(component, int):
            field += f" · index {component}"
        else:
            field += ("." if field else "") + component
    return field or "manifest"


def _error_location(diagnostic: RuleError) -> Location:
    if isinstance(diagnostic.error, ManifestError):
        return Location(manifest=diagnostic.error.path, path=diagnostic.error.field)

    return diagnostic.location


def _error_message(diagnostic: RuleError) -> str:
    if isinstance(diagnostic.error, ManifestError):
        return diagnostic.error.message
    return str(diagnostic.error)


def _operation(operation: Operation) -> str:
    cause = ", ".join(
        part
        for part in (operation.rule, operation.reason, f"pass {operation.pass_number}")
        if part is not None
    )
    return (
        f"{_field(operation.location)} · {operation.kind.value} · "
        f"{_value(operation.before)} → {_value(operation.after)} ({cause})"
    )


def _console(stream: TextIO) -> Console:
    return Console(file=stream, highlight=False)


def _line(console: Console, label: str, body: str, *, style: str = "") -> None:
    text = Text("  ")
    text.append(label, style=style)
    text.append(body)
    console.print(text)


def _render_group(
    console: Console,
    *,
    manifest: Path,
    group: dict[str, list[object]],
    diff: ManifestDiff | None,
    directory: Path,
) -> None:
    console.print(Text(_relative(manifest, directory), style="bold"))
    for diagnostic in group["errors"]:
        if isinstance(diagnostic, RuleError):
            _line(
                console,
                "error · ",
                f"{_field(_error_location(diagnostic))} · {diagnostic.rule}: {_error_message(diagnostic)}",
                style="bold red",
            )

    for operation in group["changes"]:
        if isinstance(operation, Operation):
            _line(console, "change · ", _operation(operation), style="cyan")

    for diagnostic in group["warnings"]:
        if isinstance(diagnostic, RuleWarning):
            _line(
                console,
                "warning · ",
                f"{_field(diagnostic.location)} · {diagnostic.rule}: {diagnostic.warning}",
                style="yellow",
            )

    if diff is not None:
        console.print(Text(diff.unified(name=_relative(manifest, directory))), soft_wrap=True)

    console.print()


def _outcome(report: CheckReport | FixReport) -> str:
    if isinstance(report, FixReport):
        match report.status:
            case FixStatus.BLOCKED:
                return "Fix blocked; pending changes not written"
            case FixStatus.APPLIED:
                return "Fix applied"
            case FixStatus.UNCHANGED:
                return "Fix complete; no changes needed"

    match report.status:
        case CheckStatus.BLOCKED:
            return "Check blocked; pending changes not written"
        case CheckStatus.CHANGES:
            return "Check found pending changes; no files written"
        case CheckStatus.CLEAN:
            return "Check clean; no files written"


def render_report(report: CheckReport | FixReport, *, directory: Path, stream: TextIO) -> None:
    """Group errors, the operation trace, warnings and the final diff by manifest."""
    console = _console(stream)
    check = report.report if isinstance(report, FixReport) else report
    groups: dict[Path, dict[str, list[object]]] = defaultdict(
        lambda: {"errors": [], "changes": [], "warnings": []}
    )

    for diagnostic in check.diagnostics:
        category = "errors" if isinstance(diagnostic, RuleError) else "warnings"
        location = (
            _error_location(diagnostic)
            if isinstance(diagnostic, RuleError)
            else diagnostic.location
        )
        groups[location.manifest][category].append(diagnostic)

    for operation in check.operations:
        groups[operation.location.manifest]["changes"].append(operation)

    diffs = {diff.path: diff for diff in check.diffs}
    for manifest in dict.fromkeys((*groups, *diffs)):
        _render_group(
            console,
            manifest=manifest,
            group=groups[manifest],
            diff=diffs.get(manifest),
            directory=directory,
        )

    errors = sum(isinstance(entry, RuleError) for entry in check.diagnostics)
    warnings = sum(isinstance(entry, RuleWarning) for entry in check.diagnostics)
    written = len(report.written) if isinstance(report, FixReport) else 0
    console.print(Text(_outcome(report)))
    console.print(
        Text(
            f"{errors} error(s), {len(check.operations)} change(s), "
            f"{warnings} warning(s) · {written} file(s) written"
        )
    )

    if isinstance(report, FixReport) and report.written:
        console.print(
            Text("Written: " + ", ".join(_relative(path, directory) for path in report.written))
        )


def render_operational_error(
    error: ManifestError | WorkspaceError | FixError,
    *,
    directory: Path,
    stream: TextIO,
) -> None:
    """Retain the partial-write list on a failed replacement."""
    console = _console(stream)
    if isinstance(error, FixError):
        console.print(Text(f"Could not replace {_relative(error.path, directory)}."))
        if error.written:
            console.print(
                Text(
                    "Already written: "
                    + ", ".join(_relative(path, directory) for path in error.written)
                )
            )
        else:
            console.print(Text("No files written."))

    elif isinstance(error, ManifestError):
        location = Location(manifest=error.path, path=error.field)
        console.print(
            Text(f"{_relative(error.path, directory)} · {_field(location)}: {error.message}")
        )
    else:
        console.print(Text(f"{_relative(error.directory, directory)}: {error.message}"))
