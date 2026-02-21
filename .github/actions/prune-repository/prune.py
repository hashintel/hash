#!/usr/bin/env python3
"""Prunes the turbo workspace to only the packages required for the given scope(s).

Handles cyclic and extra dependencies that turbo's dependency graph doesn't track.
"""

import argparse
import json
import subprocess
from collections.abc import Iterable
from glob import glob
from pathlib import Path

import tomllib

# ---------------------------------------------------------------------------
# Extra dependency rules that turbo doesn't track
# ---------------------------------------------------------------------------

# If any of these packages appear in the dependency closure, add the
# corresponding extra packages to the scope.
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
    # Graph app required for these crates
    "@rust/hash-graph-type-fetcher": ["@apps/hash-graph"],
    "@rust/hash-graph-test-server": ["@apps/hash-graph"],
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
        (src_dir / "lib.rs").write_text("")
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
    scopes = fixpoint_expand(initial, dependencies)
    turbo_prune(scopes, dry_run=args.dry_run)
    stub_missing_members(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
