"""Command-line interface for Python workspace constraints."""

import argparse
import sys
from collections.abc import Sequence
from enum import Enum, auto
from pathlib import Path
from typing import Literal, overload

from repo_chores.constraints import CONSTRAINTS, CheckReport, Engine, FixReport
from repo_chores.constraints._engine import CheckStatus, FixStatus
from repo_chores.constraints._engine.diagnostics import (
    FixError,
    ManifestError,
    WorkspaceError,
)
from repo_chores.constraints.rendering import render_operational_error, render_report


class ConstraintMode(Enum):
    CHECK = auto()
    FIX = auto()


@overload
def verify_constraints(*, directory: Path, mode: Literal[ConstraintMode.CHECK]) -> CheckReport: ...
@overload
def verify_constraints(*, directory: Path, mode: Literal[ConstraintMode.FIX]) -> FixReport: ...


def verify_constraints(*, directory: Path, mode: ConstraintMode) -> CheckReport | FixReport:
    engine = Engine(directory=directory)

    match mode:
        case ConstraintMode.CHECK:
            return engine.check(CONSTRAINTS)
        case ConstraintMode.FIX:
            return engine.fix(CONSTRAINTS)


def run(args: argparse.Namespace) -> int:
    """Execute a parsed constraints command."""
    mode = ConstraintMode.FIX if args.fix else ConstraintMode.CHECK
    try:
        report = verify_constraints(directory=args.directory, mode=mode)
    except (ManifestError, WorkspaceError, FixError) as error:
        render_operational_error(error, directory=args.directory, stream=sys.stderr)
        return 1

    blocked = report.status is CheckStatus.BLOCKED or report.status is FixStatus.BLOCKED
    render_report(
        report,
        directory=args.directory,
        stream=sys.stderr if blocked else sys.stdout,
    )
    return int(blocked or report.status is CheckStatus.CHANGES)


def configure_parser(parser: argparse.ArgumentParser) -> None:
    """Add the shared constraints options to either entrypoint's parser."""
    parser.add_argument("--fix", action="store_true", help="apply constraint fixes")
    parser.add_argument(
        "--directory",
        type=Path,
        default=Path.cwd(),
        metavar="PATH",
        help="workspace directory (default: current directory)",
    )
    parser.set_defaults(command=run)


def main(argv: Sequence[str] | None = None) -> int:
    """Run the standalone constraints module."""
    parser = argparse.ArgumentParser(prog="python -m repo_chores.constraints")
    configure_parser(parser)
    args = parser.parse_args(argv)
    return run(args)
