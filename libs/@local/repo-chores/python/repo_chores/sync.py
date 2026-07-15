"""Check and fix the workspace invariants.

Every rule reports deviations as :class:`Finding` records; in apply mode the fixable
are written back to disk:

- every discovered pyproject.toml is an explicit uv workspace member,
- every member is reachable through the root package.json yarn workspace globs,
- every member declares the workspace's exact requires-python bound,
- every member's dev group carries the shared ruff (and, with tests, pytest) pins,
- every member has a package.json wiring it into turbo (`@python/<name>`),
- the root manifest's ruff `src`, pytest `testpaths`, and tach `source_roots`
  cover every member.

Manifest edits are made in place; comments, ordering, and formatting survive
every fix. The entry point is :func:`synchronize`.
"""

import json
import shutil
import subprocess
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from fnmatch import fnmatch
from functools import cache
from pathlib import Path

import tomlkit
from packaging.requirements import InvalidRequirement, Requirement
from packaging.utils import canonicalize_name
from tomlkit.items import Array

from repo_chores.toml_edit import (
    array_to_str,
    navigate_to_array,
    navigate_to_table,
    reconcile_string_array,
)
from repo_chores.workspace import (
    Member,
    Workspace,
    WorkspaceError,
    load_workspace,
)

RUFF_FIX_SCRIPT = "uv run --frozen ruff check --fix . && uv run --frozen ruff format ."
RUFF_LINT_SCRIPT = "uv run --frozen ruff check . && uv run --frozen ruff format --check ."
PYTEST_SCRIPT = "uv run --frozen pytest tests"

DEFAULT_LICENSE = "AGPL-3"
NPM_SCOPE = "@python"


@dataclass(frozen=True, kw_only=True, slots=True)
class Finding:
    """A single deviation from the expected workspace state.

    A fixable finding is corrected in apply mode; an unfixable finding
    requires a manual edit and fails the run in either mode.
    """

    path: str
    message: str
    fixable: bool = True


@dataclass(frozen=True, kw_only=True, slots=True)
class ManifestExpectation:
    """A managed string array in the root manifest and its expected contents.

    The expected values are deduplicated and sorted on construction, so every
    comparison and reconciliation downstream sees the canonical form.
    """

    table_path: tuple[str, ...]
    key: str
    expected: tuple[str, ...]
    description: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "expected", tuple(sorted(set(self.expected))))


def _write(*, path: Path, content: str, apply: bool) -> None:
    """Write `content` to `path` in apply mode; check mode leaves disk untouched."""
    if apply:
        path.write_text(content, encoding="utf-8")


@cache
def _oxfmt_executable() -> str:
    """Resolve the oxfmt binary once per run.

    Raises :exc:`WorkspaceError` when oxfmt is not on PATH; `mise install`
    provisions it.
    """
    executable = shutil.which("oxfmt")
    if executable is None:
        raise WorkspaceError("oxfmt not found on PATH; run `mise install` to provision it")

    return executable


@cache
def _format_package_json(content: str, /, *, root: Path) -> str:
    """Format package.json content with the repository formatter.

    oxfmt discovers its configuration from `root`, including package.json
    key and script sorting, so generated files match `yarn lint:format`
    byte for byte and the canonical ordering has a single owner. Results
    are cached: formatting is pure in `content` and the configuration at
    `root`.

    Raises :exc:`WorkspaceError` when oxfmt rejects the content.
    """
    result = subprocess.run(
        [_oxfmt_executable(), "--stdin-filepath=package.json"],
        input=content,
        capture_output=True,
        text=True,
        cwd=root,
        check=False,
    )
    if result.returncode != 0:
        raise WorkspaceError(f"oxfmt failed to format package.json: {result.stderr.strip()}")

    return result.stdout


def _pins_by_name(specifiers: Iterable[str], /) -> dict[str, str]:
    """Index verbatim requirement strings by canonical distribution name.

    Canonicalization follows the PyPA rules, so `Foo.Bar` and `foo-bar` name
    the same distribution and compare equal.

    Raises :exc:`InvalidRequirement` when a specifier does not parse.
    """
    return {canonicalize_name(Requirement(pin).name): pin for pin in specifiers}


def _upsert_requirement(dev_group: Array, /, *, tool: str, specifier: str) -> None:
    """Replace the requirement pinning `tool` in place, or append `specifier`.

    In-place replacement keeps the entry's position and trivia; the pinned
    tool keeps its spot in the list when only the version spec changes.
    """
    # The entries were already parsed when the member's pins were indexed,
    # so the Requirement construction here cannot fail.
    for index, existing in enumerate(array_to_str(dev_group)):
        if existing is not None and canonicalize_name(Requirement(existing).name) == tool:
            dev_group[index] = specifier
            return

    if not dev_group:
        dev_group.multiline(multiline=True)
    dev_group.append(specifier)


def _named_members(workspace: Workspace) -> list[Member]:
    """Select the members that carry a `[project]` name."""
    return [member for member in workspace.members if member.name is not None]


def _sync_root_manifest(workspace: Workspace, /, *, apply: bool) -> list[Finding]:
    """Reconcile the managed arrays of the root manifest.

    Managed arrays are the uv workspace members, the ruff src roots, the
    pytest testpaths, and the tach source roots; each must list exactly the
    discovered members (or, for testpaths, the members with a tests
    directory). Arrays containing non-string entries are reported as
    unfixable and left untouched.
    """
    manifest_path = workspace.root / "pyproject.toml"
    document = tomlkit.parse(manifest_path.read_text(encoding="utf-8"))
    findings: list[Finding] = []

    member_directories = tuple(member.directory for member in _named_members(workspace))
    test_directories = tuple(
        f"{member.directory}/tests" for member in _named_members(workspace) if member.has_tests
    )

    expectations = (
        ManifestExpectation(
            table_path=("tool", "uv", "workspace"),
            key="members",
            expected=member_directories,
            description="workspace members",
        ),
        ManifestExpectation(
            table_path=("tool", "ruff"),
            key="src",
            expected=member_directories,
            description="ruff src roots",
        ),
        ManifestExpectation(
            table_path=("tool", "pytest", "ini_options"),
            key="testpaths",
            expected=tuple(test_directories),
            description="pytest testpaths",
        ),
        ManifestExpectation(
            table_path=("tool", "tach"),
            key="source_roots",
            expected=member_directories,
            description="tach source roots",
        ),
    )

    for expectation in expectations:
        table = navigate_to_table(document, path=expectation.table_path)
        current = navigate_to_array(table, path=(expectation.key,))
        current_items = list(array_to_str(current))

        if any(item is None for item in current_items):
            findings.append(
                Finding(
                    path="pyproject.toml",
                    message=f"{expectation.description} must only contain strings",
                    fixable=False,
                )
            )
            continue

        if tuple(current_items) == expectation.expected:
            continue

        findings.append(
            Finding(
                path="pyproject.toml",
                message=f"{expectation.description} must list every member:"
                f" {', '.join(expectation.expected)}",
            )
        )
        reconcile_string_array(current, expected=expectation.expected)

    if findings:
        _write(path=manifest_path, content=tomlkit.dumps(document), apply=apply)

    return findings


def _sync_root_package_json(workspace: Workspace, /, *, apply: bool) -> list[Finding]:
    """Ensure every member is reachable through the yarn workspace globs.

    turbo discovers packages through the root package.json workspaces list;
    a member outside every glob is invisible to it. Missing members are added
    as explicit entries and the list is kept sorted.
    """
    package_json_path = workspace.root / "package.json"
    data = json.loads(package_json_path.read_text(encoding="utf-8"))

    patterns = [
        pattern
        for pattern in data.get("workspaces", {}).get("packages", [])
        if isinstance(pattern, str) and not pattern.startswith("!")
    ]

    findings: list[Finding] = []
    for member in _named_members(workspace):
        if any(fnmatch(member.directory, pattern) for pattern in patterns):
            continue

        findings.append(
            Finding(
                path="package.json",
                message=(
                    f"{member.directory} is not covered by workspaces.packages; turbo cannot see it"
                ),
            )
        )

        data["workspaces"]["packages"] = sorted({*data["workspaces"]["packages"], member.directory})

    if findings:
        content = _format_package_json(json.dumps(data), root=workspace.root)
        _write(path=package_json_path, content=content, apply=apply)

    return findings


def _unnamed_member_findings(workspace: Workspace) -> list[Finding]:
    """Report manifests that lack a `[project]` name.

    uv rejects nameless workspace members, so these manifests stay out of
    the managed arrays and surface as unfixable findings.
    """
    return [
        Finding(
            path=f"{member.directory}/pyproject.toml",
            message=(
                "manifest has no [project] name; every pyproject.toml must be a"
                " workspace member (move tool-only configuration into the root manifest)"
            ),
            fixable=False,
        )
        for member in workspace.members
        if member.name is None
    ]


def _sync_member_dev_group(
    workspace: Workspace,
    member: Member,
    /,
    *,
    document: tomlkit.TOMLDocument,
) -> list[Finding]:
    """Align a member's dev group with the workspace tool pins.

    Every member needs ruff (its lint scripts run `uv run --frozen ruff` from
    the member directory), and members with tests need pytest. Each pin must
    match the root dev group's specifier exactly, so the shared lockfile
    resolves one version per tool.
    """
    try:
        root_specifiers = _pins_by_name(workspace.dev_dependencies)
    except InvalidRequirement as error:
        return [
            Finding(
                path="pyproject.toml", message=f"invalid dev requirement: {error}", fixable=False
            )
        ]
    try:
        member_specifiers = _pins_by_name(member.dev_dependencies)
    except InvalidRequirement as error:
        return [
            Finding(
                path=f"{member.directory}/pyproject.toml",
                message=f"invalid dev requirement: {error}",
                fixable=False,
            )
        ]

    required_tools = ["ruff", *(["pytest"] if member.has_tests else [])]

    findings: list[Finding] = []
    for tool in required_tools:
        root_specifier = root_specifiers.get(tool)
        if root_specifier is None:
            findings.append(
                Finding(
                    path="pyproject.toml",
                    message=f"the root dev group does not pin {tool}, so members cannot inherit it",
                    fixable=False,
                )
            )
            continue

        if member_specifiers.get(tool) == root_specifier:
            continue

        findings.append(
            Finding(
                path=f"{member.directory}/pyproject.toml",
                message=f'dev group must pin "{root_specifier}" (matching the workspace root)',
            )
        )
        dev_group = navigate_to_array(document, path=("dependency-groups", "dev"))
        _upsert_requirement(dev_group, tool=tool, specifier=root_specifier)

    return findings


def _sync_member_manifest(workspace: Workspace, member: Member, /, *, apply: bool) -> list[Finding]:
    """Align a member manifest with the workspace: requires-python and tool pins."""
    manifest_path = workspace.root / member.directory / "pyproject.toml"
    document = tomlkit.parse(manifest_path.read_text(encoding="utf-8"))
    findings: list[Finding] = []

    if member.requires_python != workspace.requires_python:
        findings.append(
            Finding(
                path=f"{member.directory}/pyproject.toml",
                message=f'requires-python must be "{workspace.requires_python}"'
                f" (found {member.requires_python!r})",
            )
        )

        table = navigate_to_table(document, path=("project",))
        table["requires-python"] = workspace.requires_python

    findings.extend(_sync_member_dev_group(workspace, member, document=document))

    if findings:
        _write(path=manifest_path, content=tomlkit.dumps(document), apply=apply)

    return findings


def assemble_package_json(
    member: Member, existing: Mapping[str, object] | None, /
) -> dict[str, object]:
    """Assemble the package.json contents wiring a member into turbo.

    Managed keys (name, version, private, the ruff and pytest scripts, and
    the dependencies mirroring the member's workspace dependencies) are
    overwritten; everything else in `existing`, including hand-written
    scripts, is preserved. Key and script ordering is left to the repository
    formatter, which owns the canonical package.json layout.
    """
    data: dict[str, object] = dict(existing or {})
    scripts = data.get("scripts")
    scripts = dict(scripts) if isinstance(scripts, dict) else {}

    scripts["fix:ruff"] = RUFF_FIX_SCRIPT
    scripts["lint:ruff"] = RUFF_LINT_SCRIPT
    if member.has_tests:
        scripts["test:unit"] = PYTEST_SCRIPT

    data["name"] = f"{NPM_SCOPE}/{member.name}"
    data["version"] = "0.0.0-private"
    data["private"] = True
    data.setdefault("license", DEFAULT_LICENSE)
    data["scripts"] = scripts

    dependencies = {
        f"{NPM_SCOPE}/{dependency}": "workspace:*" for dependency in member.workspace_dependencies
    }
    if dependencies:
        data["dependencies"] = dependencies
    else:
        data.pop("dependencies", None)

    return data


def _sync_member_package_json(
    workspace: Workspace, member: Member, /, *, apply: bool
) -> list[Finding]:
    """Ensure a member's package.json matches the formatted assembly byte for byte."""
    package_json_path = workspace.root / member.directory / "package.json"
    original = (
        package_json_path.read_text(encoding="utf-8") if package_json_path.is_file() else None
    )
    existing = json.loads(original) if original is not None else None

    assembled = assemble_package_json(member, existing)
    expected = _format_package_json(json.dumps(assembled), root=workspace.root)
    if original == expected:
        return []

    _write(path=package_json_path, content=expected, apply=apply)
    return [
        Finding(
            path=f"{member.directory}/package.json",
            message="turbo wiring is missing or out of date"
            f" (managed by `repo-chores sync`, name {NPM_SCOPE}/{member.name})",
        )
    ]


def synchronize(root: Path, /, *, apply: bool) -> list[Finding]:
    """Check every workspace invariant, fixing fixable deviations when `apply` is set.

    Check mode never writes; apply mode writes each corrected file once. The
    returned findings describe every deviation that was found, fixed or not.
    """
    workspace = load_workspace(root)

    findings = [
        *_sync_root_manifest(workspace, apply=apply),
        *_sync_root_package_json(workspace, apply=apply),
        *_unnamed_member_findings(workspace),
    ]

    for member in _named_members(workspace):
        findings.extend(_sync_member_manifest(workspace, member, apply=apply))
        findings.extend(_sync_member_package_json(workspace, member, apply=apply))

    return findings
