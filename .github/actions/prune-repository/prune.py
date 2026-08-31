#!/usr/bin/env python3
"""Prunes the turbo workspace to only the packages required for the given scope(s).

Handles cyclic and extra dependencies that turbo's dependency graph doesn't track.
"""

import argparse
import json
import shutil
import subprocess
from collections.abc import Iterable
from glob import glob
from pathlib import Path

import tomllib

# ---------------------------------------------------------------------------
# Extra dependency rules that turbo doesn't track
# ---------------------------------------------------------------------------

# If any of these packages appear in the dependency closure, add the
# corresponding extra packages to the scope. Triggers use prefix matching
# so a family root can pull its children (e.g. darwin-kperf).
EXTRA_DEPENDENCIES: dict[str, list[str]] = {
    # Cyclic: hashql crates need compiletest
    "@rust/hashql-ast": ["@rust/hashql-compiletest"],
    "@rust/hashql-hir": ["@rust/hashql-compiletest"],
    "@rust/hashql-mir": ["@rust/hashql-compiletest"],
    "@rust/hashql-eval": ["@rust/hashql-compiletest"],
    # darwin-kperf has all child crates directly as subdirectories and hence need to be included
    "@rust/darwin-kperf": [
        "@rust/darwin-kperf",
        "@rust/darwin-kperf-sys",
        "@rust/darwin-kperf-criterion",
        "@rust/darwin-kperf-events",
        "@rust/darwin-kperf-codegen",
    ],
    # Test data crates
    "@blockprotocol/type-system-rs": ["@rust/hash-graph-test-data"],
    "@rust/hash-graph-types": ["@rust/hash-graph-test-data"],
}

# Extras that must not fire on a transitive or prefix match. Brunch core's
# architecture and contract tests inspect the app and shipped plugins, but a job
# whose requested scope is only a sibling or a consumer of core must not pull
# those fixtures.
REQUESTED_DEPENDENCIES: dict[str, list[str]] = {
    "@hashintel/brunch-agent": [
        "@apps/brunch-agent",
        "@hashintel/brunch-agent-plugin-gherkin",
        "@hashintel/brunch-agent-plugin-sdcpn",
    ],
}

# Non-workspace paths required by packages in the *requested* scope.
# `turbo prune` copies workspace directories and root manifests only.
REQUESTED_PATHS: dict[str, list[str]] = {
    # The Brunch context root is deliberately not a workspace, but the
    # architecture tests in packages/core read its docs, scripts, and agent
    # contract files
    "@hashintel/brunch-agent": [
        ".config/oxlint/brunch",
        "libs/@hashintel/brunch-agent/AGENTS.md",
        "libs/@hashintel/brunch-agent/CONTEXT.md",
        "libs/@hashintel/brunch-agent/docs",
        "libs/@hashintel/brunch-agent/evaluations",
        "libs/@hashintel/brunch-agent/scripts",
    ],
    # The app's condition-5 test executes the evaluation runner as a child
    # process; the context root is not a workspace and must be copied explicitly.
    "@apps/brunch-agent": ["libs/@hashintel/brunch-agent/evaluations"],
}

TURBO_QUERY = """
    query {
      packages {
        items {
          name
          allDependencies {
            items {
              name
            }
          }
        }
      }
    }
"""


def turbo_dependency_map() -> dict[str, frozenset[str]]:
    """Query turbo for all packages and return a map of package name to its dependencies."""

    result = subprocess.run(
        ["turbo", "query", TURBO_QUERY],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)

    dep_map: dict[str, frozenset[str]] = {}
    for item in data["data"]["packages"]["items"]:
        deps = frozenset(dep["name"] for dep in item["allDependencies"]["items"])
        dep_map[item["name"]] = deps

    return dep_map


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


def expand_scopes(dependencies: Iterable[str]) -> frozenset[str]:
    """Return extra scopes implied by the dependency names.

    A rule triggers when any dependency name starts with the trigger prefix.
    """

    extras: set[str] = set()

    for trigger, additions in EXTRA_DEPENDENCIES.items():
        if any(name.startswith(trigger) for name in dependencies):
            extras.update(additions)

    return frozenset(extras)


def fixpoint_expand(
    initial: Iterable[str], dependencies: dict[str, frozenset[str]]
) -> frozenset[str]:
    """Expand scopes to a fixpoint using the pre-built dependency map."""
    scopes: set[str] = set(initial)
    stable: set[str] = set()

    while True:
        frontier = scopes - stable
        if not frontier:
            break

        for scope in frontier:
            stable.add(scope)
            deps: frozenset[str] = dependencies.get(scope, frozenset())

            scopes |= expand_scopes(deps | {scope})

    return frozenset(scopes)


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


def resolve_workspace_members() -> list[Path]:
    """Read workspace members from Cargo.toml and resolve globs to Cargo.toml paths."""

    with open("Cargo.toml", "rb") as fh:
        cargo = tomllib.load(fh)

    members: list[str] = cargo["workspace"]["members"]
    paths: list[Path] = []

    for member in members:
        for match in glob(f"{member}/Cargo.toml"):
            paths.append(Path(match))

    return paths


def stub_missing_members(*, dry_run: bool = False) -> None:
    """Create dummy Cargo.toml stubs for workspace members not included by turbo prune."""

    for cargo_path in resolve_workspace_members():
        directory = cargo_path.parent
        out_cargo = Path("out") / directory / "Cargo.toml"

        if out_cargo.exists():
            continue

        # Read the package name from the real Cargo.toml
        with open(cargo_path, "rb") as fh:
            pkg = tomllib.load(fh)

        name = pkg.get("package", {}).get("name")
        if name is None:
            continue

        if dry_run:
            print(f"[dry-run] Would stub: {out_cargo} (name={name})")
            continue

        # Create the stub
        out_dir = out_cargo.parent
        src_dir = out_dir / "src"

        src_dir.mkdir(parents=True, exist_ok=True)
        (src_dir / "lib.rs").write_text("\n")
        out_cargo.write_text(f'[package]\nname = "{name}"\nedition.workspace = true\n')


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
        help="Print what would be done without executing turbo prune or creating stubs.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    initial = {
        s.strip() for line in args.scope.splitlines() for s in line.split() if s.strip()
    }

    dependencies = turbo_dependency_map()
    scopes = fixpoint_expand(initial | extras_for_requested(initial), dependencies)
    turbo_prune(scopes, dry_run=args.dry_run)
    copy_extra_paths(initial, dry_run=args.dry_run)
    stub_missing_members(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
