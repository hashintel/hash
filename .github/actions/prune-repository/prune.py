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
        (src_dir / "lib.rs").write_text("\n")
        out_cargo.write_text(f'[package]\nname = "{name}"\nedition.workspace = true\n')


def resolve_python_workspace_members() -> list[Path]:
    """Read uv workspace members from pyproject.toml and resolve globs to member directories."""

    with open("pyproject.toml", "rb") as fh:
        pyproject = tomllib.load(fh)

    members: list[str] = pyproject["tool"]["uv"]["workspace"]["members"]
    paths: list[Path] = []

    for member in members:
        for match in glob(member):
            if (Path(match) / "pyproject.toml").exists():
                paths.append(Path(match))

    return paths


def python_workspace_scopes() -> frozenset[str]:
    """Return the turbo package names of all uv workspace members.

    uv always resolves the whole workspace: `uv sync --locked` and `uv run --frozen`
    fail when a member directory referenced by the root `pyproject.toml`/`uv.lock` is
    missing. Python packages are therefore exempt from pruning by adding them to the
    scopes (which also keeps their entries in the pruned `yarn.lock`). The root
    `pyproject.toml` and `uv.lock` are restored by the action's copy step.
    """

    scopes: set[str] = set()

    for directory in resolve_python_workspace_members():
        package_json = directory / "package.json"
        if package_json.exists():
            with open(package_json, "rb") as fh:
                scopes.add(json.load(fh)["name"])

    return frozenset(scopes)


def preserve_python_members(*, dry_run: bool = False) -> None:
    """Copy uv workspace members without a `package.json` into the pruned tree.

    Members with a `package.json` are turbo workspaces and are kept via
    `python_workspace_scopes`; anything else is invisible to turbo and copied here.
    """

    for directory in resolve_python_workspace_members():
        out_dir = Path("out") / directory

        if out_dir.exists():
            continue

        if dry_run:
            print(f"[dry-run] Would preserve Python workspace member: {directory}")
            continue

        print(f"Preserving Python workspace member: {directory}")
        shutil.copytree(
            directory,
            out_dir,
            ignore=shutil.ignore_patterns(
                "__pycache__", ".pytest_cache", ".ruff_cache", ".venv"
            ),
        )


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
    scopes = fixpoint_expand(initial | python_workspace_scopes(), dependencies)
    turbo_prune(scopes, dry_run=args.dry_run)
    stub_missing_members(dry_run=args.dry_run)
    preserve_python_members(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
