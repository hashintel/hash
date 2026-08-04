"""Discovery and shared model of the Python workspace.

The workspace is rooted at the pyproject.toml declaring `[tool.uv.workspace]`.
:func:`load_workspace` parses that manifest, discovers every member manifest in
the repository, and returns an immutable :class:`Workspace` snapshot.

tomllib parses into untyped dictionaries; every value crossing this module's
boundary is narrowed to a checked type.
"""

import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import TypeIs

PRUNED_DIRECTORIES = frozenset({
    ".git",
    ".ruff_cache",
    ".turbo",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "out",
    "target",
    "venv",
})
"""Directory names that never contain workspace members and are skipped during discovery."""


class WorkspaceError(RuntimeError):
    """Raised when the workspace or one of its manifests cannot be interpreted."""


INSECURE_BOUNDS_ALLOWLIST_KEY = (
    "allow_insecure_unbounded_dependency_ranges_that_i_will_personally_fix_when_they_break"
)
"""The `[tool.hash]` key exempting named dependencies from the upper-bound lint.

The name is deliberately painful: an unbounded range is a standing invitation
for an upstream release to break the build, so opting out should read like
the commitment it is."""


@dataclass(frozen=True, kw_only=True, slots=True)
class Finding:
    """A single deviation from the expected workspace state.

    A fixable finding can be corrected automatically in apply mode; an
    unfixable finding requires a manual edit and fails the run either way.
    """

    path: str
    message: str
    fixable: bool = True


@dataclass(frozen=True, kw_only=True, slots=True)
class Member:
    """A Python package manifest discovered in the repository."""

    directory: str
    """Posix path of the package directory, relative to the workspace root."""

    name: str | None
    """The distribution name, or None when the manifest has no `[project]` name."""

    requires_python: str | None
    dependencies: tuple[str, ...]
    dev_dependencies: tuple[str, ...]
    workspace_dependencies: tuple[str, ...]
    insecure_bounds_allowlist: tuple[str, ...]
    has_tests: bool


@dataclass(frozen=True, kw_only=True, slots=True)
class Workspace:
    """The workspace root manifest together with every discovered member."""

    root: Path
    requires_python: str
    declared_members: tuple[str, ...]
    dev_dependencies: tuple[str, ...]
    insecure_bounds_allowlist: tuple[str, ...]
    members: tuple[Member, ...]


def _load_toml(path: Path, /) -> Mapping[str, object]:
    """Parse a TOML file, wrapping parse failures in :exc:`WorkspaceError`."""
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as error:
        raise WorkspaceError(f"{path} is not valid TOML: {error}") from error


def _is_table(value: object, /) -> TypeIs[Mapping[str, object]]:
    """Narrow a parsed TOML value to a table.

    TOML keys are always strings, so a Mapping instance check is sufficient
    to justify the declared key type.
    """
    return isinstance(value, Mapping)


def _table_at(table: Mapping[str, object], /, *path: str) -> Mapping[str, object]:
    """Descend through nested tables, returning an empty mapping where absent."""
    for key in path:
        value = table.get(key)
        if not _is_table(value):
            return {}
        table = value

    return table


def _str_at(table: Mapping[str, object], key: str, /) -> str | None:
    """Read a string value, returning None when absent or of another type."""
    value = table.get(key)
    return value if isinstance(value, str) else None


def _str_entries(table: Mapping[str, object], key: str, /) -> tuple[str, ...]:
    """Collect the string entries of a list value, skipping entries of other types."""
    value = table.get(key)
    if not isinstance(value, list):
        return ()

    return tuple(entry for entry in value if isinstance(entry, str))


def _dev_dependencies(manifest: Mapping[str, object], /) -> tuple[str, ...]:
    """Read the dev dependency group of a manifest."""
    return _str_entries(_table_at(manifest, "dependency-groups"), "dev")


def _insecure_bounds_allowlist(manifest: Mapping[str, object], /) -> tuple[str, ...]:
    """Read the manifest's upper-bound lint exemptions."""
    return _str_entries(_table_at(manifest, "tool", "hash"), INSECURE_BOUNDS_ALLOWLIST_KEY)


def load_lockfile_versions(root: Path, /) -> Mapping[str, str]:
    """Read the version uv resolved for every distribution in the lockfile.

    Names come back as the lockfile spells them; a caller comparing against
    requirement names canonicalizes both sides.

    Raises :exc:`WorkspaceError` when the lockfile is missing or holds no
    package list. Resolved versions are what a dependency range is judged
    against, so an absent lockfile has to fail rather than pass everything.
    """
    lockfile_path = root / "uv.lock"
    if not lockfile_path.is_file():
        raise WorkspaceError(f"{lockfile_path} does not exist; run `uv lock`")

    packages = _load_toml(lockfile_path).get("package")
    if not isinstance(packages, list):
        raise WorkspaceError(f"{lockfile_path} declares no [[package]] entries")

    versions: dict[str, str] = {}
    for package in packages:
        if not _is_table(package):
            continue

        name = _str_at(package, "name")
        version = _str_at(package, "version")
        if name is not None and version is not None:
            versions[name] = version

    return versions


def find_workspace_root(start: Path, /) -> Path:
    """Walk upwards from `start` to the manifest declaring the uv workspace.

    Raises :exc:`WorkspaceError` when no ancestor declares `[tool.uv.workspace]`.
    """
    for directory in (start, *start.parents):
        manifest_path = directory / "pyproject.toml"
        if not manifest_path.is_file():
            continue

        if "workspace" in _table_at(_load_toml(manifest_path), "tool", "uv"):
            return directory

    raise WorkspaceError(f"no pyproject.toml with a [tool.uv.workspace] above {start}")


def find_member_manifests(root: Path, /) -> list[Path]:
    """Find every pyproject.toml under `root` except the workspace root's own.

    Traversal skips :data:`PRUNED_DIRECTORIES` and returns paths in sorted order,
    so discovery is deterministic across runs and platforms.
    """
    manifests: list[Path] = []
    for directory, directory_names, file_names in root.walk():
        directory_names[:] = sorted(set(directory_names) - PRUNED_DIRECTORIES)
        if directory != root and "pyproject.toml" in file_names:
            manifests.append(directory / "pyproject.toml")

    return sorted(manifests)


def load_member(root: Path, manifest_path: Path, /) -> Member:
    """Parse a member manifest into a :class:`Member`.

    Workspace dependencies are the `[tool.uv.sources]` entries marked
    `workspace = true`.
    """
    manifest = _load_toml(manifest_path)
    project = _table_at(manifest, "project")

    workspace_dependencies = tuple(
        sorted(
            dependency
            for dependency, source in _table_at(manifest, "tool", "uv", "sources").items()
            if _is_table(source) and source.get("workspace") is True
        )
    )

    return Member(
        directory=manifest_path.parent.relative_to(root).as_posix(),
        name=_str_at(project, "name"),
        requires_python=_str_at(project, "requires-python"),
        dependencies=_str_entries(project, "dependencies"),
        dev_dependencies=_dev_dependencies(manifest),
        workspace_dependencies=workspace_dependencies,
        insecure_bounds_allowlist=_insecure_bounds_allowlist(manifest),
        has_tests=(manifest_path.parent / "tests").is_dir(),
    )


def load_workspace(root: Path, /) -> Workspace:
    """Parse the root manifest and discover every member in the repository.

    Raises :exc:`WorkspaceError` when the root manifest declares no
    requires-python bound; that bound is the single source of truth for the
    workspace's Python version.
    """
    manifest = _load_toml(root / "pyproject.toml")

    requires_python = _str_at(_table_at(manifest, "project"), "requires-python")
    if requires_python is None:
        raise WorkspaceError(f"{root / 'pyproject.toml'} does not declare requires-python")

    return Workspace(
        root=root,
        requires_python=requires_python,
        declared_members=_str_entries(_table_at(manifest, "tool", "uv", "workspace"), "members"),
        dev_dependencies=_dev_dependencies(manifest),
        insecure_bounds_allowlist=_insecure_bounds_allowlist(manifest),
        members=tuple(
            load_member(root, manifest_path) for manifest_path in find_member_manifests(root)
        ),
    )
