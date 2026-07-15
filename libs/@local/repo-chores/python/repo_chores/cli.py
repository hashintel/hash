"""Command-line entry point for the Python repo chores."""

import argparse
import sys
from pathlib import Path

from repo_chores import prune
from repo_chores.sync import synchronize
from repo_chores.workspace import WorkspaceError, find_workspace_root


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="repo-chores",
        description="Keeps the boring parts of the Python workspace correct.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync_parser = subparsers.add_parser(
        "sync",
        help="Synchronize workspace membership, version bounds, and turbo wiring",
    )
    sync_parser.add_argument(
        "--check",
        action="store_true",
        help="Report deviations without fixing them (exit 1 if any are found)",
    )

    prune_parser = subparsers.add_parser(
        "prune",
        help="Prune the turbo workspace to the packages required for the given scopes",
    )
    prune_parser.add_argument(
        "scope",
        help="Newline or space-separated list of package scopes to include.",
    )
    prune_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without executing turbo prune or creating stubs.",
    )

    return parser.parse_args(argv)


def run_sync(*, check: bool) -> None:
    try:
        root = find_workspace_root(Path.cwd())
        findings = synchronize(root, apply=not check)
    except WorkspaceError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error

    label = "would fix" if check else "fixed"
    for finding in findings:
        prefix = label if finding.fixable else "cannot fix"
        print(f"{prefix}: {finding.path}: {finding.message}")

    if check and findings:
        print(
            f"\n{len(findings)} deviation(s) found."
            " Run `mise run sync:python` (or `uv run repo-chores sync`) to fix.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    if not check and any(not finding.fixable for finding in findings):
        raise SystemExit(1)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    match args.command:
        case "sync":
            run_sync(check=args.check)
        case "prune":
            prune.run(args.scope, dry_run=args.dry_run)
        case _:  # pragma: no cover - argparse enforces the command set
            raise SystemExit(2)


if __name__ == "__main__":
    main()
