#!/usr/bin/env python3
"""Prunes the turbo workspace to only the packages required for the given scope(s).

`turbo prune` follows the package graph and, across toolchains, the task graph itself.
This adds what neither graph carries: packages a job reads without depending on them,
and paths outside any workspace.
"""

import argparse
import shutil
import subprocess
from collections.abc import Iterable
from pathlib import Path

# Extras that must not fire on a transitive or prefix match.
REQUESTED_DEPENDENCIES: dict[str, list[str]] = {
    # The frontend's wire-conformance suite decodes the atlas crate's checked-in fixtures
    "@apps/hash-frontend": ["hash-graph-atlas"],
}

# Non-workspace paths required by packages in the *requested* scope.
# `turbo prune` copies workspace directories and root manifests only.
REQUESTED_PATHS: dict[str, list[str]] = {
    "@hashintel/brunch-agent": [".config/oxlint/brunch"],
    # The app's product tests execute evaluation runners and inspect committed
    # evidence. Those non-workspace inputs are copied explicitly.
    "@apps/brunch-agent": [
        ".config/oxlint/brunch",
        "libs/@hashintel/brunch-agent/docs",
        "libs/@hashintel/brunch-agent/evaluations",
        "libs/@hashintel/petrinaut/docs",
    ],
}


def extras_for_requested(requested: Iterable[str]) -> frozenset[str]:
    """Return extras implied by the job's requested scopes only.

    Exact identity: a name that is a prefix of its siblings must not match them.
    """

    names = set(requested)
    extras: set[str] = set()
    for trigger, additions in REQUESTED_DEPENDENCIES.items():
        if trigger in names:
            extras.update(additions)
    return frozenset(extras)


def extra_paths_for_requested(requested: Iterable[str]) -> list[str]:
    """Return non-workspace paths implied by the job's requested scopes only."""

    names = set(requested)
    paths: list[str] = []
    for trigger, trigger_paths in REQUESTED_PATHS.items():
        if trigger in names:
            paths.extend(trigger_paths)
    return paths


def turbo_prune(scopes: Iterable[str], *, dry_run: bool = False) -> None:
    """Run `turbo prune` with the given scopes."""
    args = ["turbo", "prune", *sorted(scopes)]
    print(f"Pruning with scopes: {' '.join(sorted(scopes))}")

    if dry_run:
        print(f"[dry-run] Would run: {' '.join(args)}")
        return

    subprocess.run(args, check=True)


def copy_extra_paths(scopes: Iterable[str], *, dry_run: bool = False) -> None:
    """Copy non-workspace paths that `turbo prune` cannot include."""

    for path in extra_paths_for_requested(scopes):
        source = Path(path)
        if not source.exists():
            msg = f"REQUESTED_PATHS names {source}, which does not exist"
            raise FileNotFoundError(msg)

        destination = Path("out") / source

        if dry_run:
            print(f"[dry-run] Would copy: {source} -> {destination}")
            continue

        print(f"Copying extra path: {source} -> {destination}")
        if source.is_dir():
            shutil.copytree(source, destination, dirs_exist_ok=True)
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prune the turbo workspace to only the packages required for the given scopes.",
    )
    parser.add_argument(
        "scope",
        help="Newline or space-separated list of package scopes to include.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be done without executing turbo prune.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    requested = {
        s.strip() for line in args.scope.splitlines() for s in line.split() if s.strip()
    }

    turbo_prune(requested | extras_for_requested(requested), dry_run=args.dry_run)
    copy_extra_paths(requested, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
