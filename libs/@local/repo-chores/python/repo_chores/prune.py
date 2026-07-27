#!/usr/bin/env python3
"""Prune the turbo workspace to the packages required for the given scope(s).

Scopes are expanded with dependency rules that turbo's graph leaves out
(cyclic and test-data crates), and the pruned output stays a valid Cargo and
uv workspace: members that turbo removed are stubbed back in.

This file runs directly (`python3 prune.py`) before any dependencies are
installed, so it stays stdlib-only and self-contained. `repo-chores prune`
exposes the same logic inside the workspace environment.
"""

import argparse
import json
import subprocess
import tomllib
from collections.abc import Iterable
from pathlib import Path

# Dependency rules that turbo's graph does not track. When any package whose
# name starts with a key appears in the dependency closure, the listed extra
# packages join the scope.
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


def resolve_cargo_members(root: Path) -> list[Path]:
    """Read workspace members from Cargo.toml and resolve globs to Cargo.toml paths."""
    with (root / "Cargo.toml").open("rb") as fh:
        cargo = tomllib.load(fh)

    members: list[str] = cargo["workspace"]["members"]

    return [match for member in members for match in root.glob(f"{member}/Cargo.toml")]


def stub_missing_cargo_members(root: Path, out: Path, *, dry_run: bool = False) -> None:
    """Create dummy Cargo.toml stubs for workspace members not included by turbo prune."""
    for cargo_path in resolve_cargo_members(root):
        out_cargo = out / cargo_path.relative_to(root)

        if out_cargo.exists():
            continue

        # Read the package name from the real Cargo.toml
        with cargo_path.open("rb") as fh:
            pkg = tomllib.load(fh)

        name = pkg.get("package", {}).get("name")
        if name is None:
            continue

        if dry_run:
            print(f"[dry-run] Would stub: {out_cargo} (name={name})")
            continue

        # Create the stub
        src_dir = out_cargo.parent / "src"

        src_dir.mkdir(parents=True, exist_ok=True)
        (src_dir / "lib.rs").write_text("\n", encoding="utf-8")
        stub = f'[package]\nname = "{name}"\nedition.workspace = true\n'
        out_cargo.write_text(stub, encoding="utf-8")


def resolve_uv_members(root: Path) -> list[Path]:
    """Read workspace member globs from pyproject.toml and resolve to pyproject.toml paths."""
    pyproject_path = root / "pyproject.toml"
    if not pyproject_path.exists():
        return []

    with pyproject_path.open("rb") as fh:
        pyproject = tomllib.load(fh)

    workspace = pyproject.get("tool", {}).get("uv", {}).get("workspace", {})
    members: list[str] = workspace.get("members", [])
    excluded = {match for pattern in workspace.get("exclude", []) for match in root.glob(pattern)}

    return [
        match
        for member in members
        for match in root.glob(f"{member}/pyproject.toml")
        if match.parent not in excluded
    ]


def stub_missing_uv_members(root: Path, out: Path, *, dry_run: bool = False) -> None:
    """Copy manifests for uv workspace members that turbo prune left out.

    uv validates the whole workspace graph against uv.lock even with `--frozen`,
    so every member's pyproject.toml must exist in the pruned output. The
    manifest alone is enough: members are only installed when requested, so
    the pruned-away sources are never built.
    """
    for member_pyproject in resolve_uv_members(root):
        out_pyproject = out / member_pyproject.relative_to(root)

        if out_pyproject.exists():
            continue

        if dry_run:
            print(f"[dry-run] Would stub: {out_pyproject}")
            continue

        out_pyproject.parent.mkdir(parents=True, exist_ok=True)
        out_pyproject.write_bytes(member_pyproject.read_bytes())


def parse_scopes(scope: str) -> frozenset[str]:
    """Split a newline or space-separated scope list into individual scopes."""
    return frozenset(s.strip() for line in scope.splitlines() for s in line.split() if s.strip())


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


def run(scope: str, *, dry_run: bool = False) -> None:
    """Expand the scopes, run `turbo prune`, and stub pruned-out workspace members."""
    initial = parse_scopes(scope)

    dependencies = turbo_dependency_map()
    scopes = fixpoint_expand(initial, dependencies)
    turbo_prune(scopes, dry_run=dry_run)

    root = Path.cwd()
    out = root / "out"
    stub_missing_cargo_members(root, out, dry_run=dry_run)
    stub_missing_uv_members(root, out, dry_run=dry_run)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    run(args.scope, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
