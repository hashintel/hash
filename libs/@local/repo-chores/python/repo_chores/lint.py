"""Lint the workspace's dependency requirements.

Three rules, all judged with :mod:`packaging` semantics and reported as
findings (lint never edits):

- every version range carries a lower and an upper bound (cargo-style, e.g.
  `>=1.2.3,<2`): without an upper bound any upstream release can break the
  build, and without a lower bound resolution may silently downgrade to any
  historic release. A dependency can be exempted by naming it in the
  manifest's `[tool.hash]` allowlist; unused allowlist entries are themselves
  errors, so the list shrinks when exemptions expire.
- URL requirements are rejected: workspace members are wired through
  `[tool.uv.sources]`, and everything else resolves from the registry.
- a bounded range's floor names the release series the lockfile resolves. A
  floor below it advertises support for versions nothing in the repository has
  ever installed, and it is not what `uv add` writes: under `[tool.uv]
  add-bounds` uv pins the floor to the version it resolved, so a looser floor
  is something a hand edit introduced.

The entry point is :func:`lint`.
"""

from collections.abc import Iterable, Mapping
from pathlib import Path

from packaging.requirements import InvalidRequirement, Requirement
from packaging.utils import canonicalize_name
from packaging.version import InvalidVersion, Version

from repo_chores.workspace import (
    INSECURE_BOUNDS_ALLOWLIST_KEY,
    Finding,
    Workspace,
    load_lockfile_versions,
    load_workspace,
)

LOWER_BOUND_OPERATORS = frozenset({">", ">=", "==", "===", "~="})
"""Specifier operators that impose a lower bound on resolved versions."""

UPPER_BOUND_OPERATORS = frozenset({"<", "<=", "==", "===", "~="})
"""Specifier operators that impose an upper bound on resolved versions."""


def _missing_bounds(requirement: Requirement, /) -> str | None:
    """Describe the missing bounds of a requirement, or None when fully bounded."""
    operators = {specifier.operator for specifier in requirement.specifier}
    has_lower = bool(operators & LOWER_BOUND_OPERATORS)
    has_upper = bool(operators & UPPER_BOUND_OPERATORS)

    match has_lower, has_upper:
        case True, True:
            return None
        case True, False:
            return "has no upper bound, so any upstream release can break the build"
        case False, True:
            return (
                "has no lower bound, so resolution may silently downgrade to any historic release"
            )
        case _:
            return "has no version bounds at all"


def _floor(requirement: Requirement, /) -> Version | None:
    """Return the oldest version a requirement admits, where one is stated.

    A wildcard release (`==1.2.*`) is read as its series, and a version this
    module cannot parse returns None rather than a guess.
    """
    floors: list[Version] = []
    for specifier in requirement.specifier:
        if specifier.operator not in LOWER_BOUND_OPERATORS:
            continue

        try:
            floors.append(Version(specifier.version.removesuffix(".*")))
        except InvalidVersion:
            return None

    return max(floors, default=None)


def _loose_floor_finding(
    *, path: str, text: str, requirement: Requirement, resolved: str | None
) -> Finding | None:
    """Judge a bounded requirement's floor against the version uv resolved.

    Nothing is reported for a distribution absent from the lockfile: that
    disagreement between manifest and lockfile is what `uv sync --locked`
    reports, and inventing a second voice for it here would report it twice.
    """
    floor = _floor(requirement)
    if floor is None or resolved is None:
        return None

    try:
        installed = Version(resolved)
    except InvalidVersion:
        return None

    if (floor.major, floor.minor) == (installed.major, installed.minor):
        return None

    return Finding(
        path=path,
        message=f"`{text}` admits {floor}, older than the resolved {installed};"
        f" a floor names the series in the lockfile, so raise it to {installed.major}."
        f"{installed.minor}",
        fixable=False,
    )


def _lint_requirements(
    *,
    path: str,
    requirements: Iterable[str],
    allowlist: frozenset[str],
    workspace_members: frozenset[str],
    resolved: Mapping[str, str],
) -> tuple[list[Finding], frozenset[str]]:
    """Judge one manifest's requirement strings.

    Returns the findings together with the allowlist entries that actually
    exempted something, so the caller can flag the stale remainder.
    """
    findings: list[Finding] = []
    used_exemptions: set[str] = set()

    for text in requirements:
        try:
            requirement = Requirement(text)
        except InvalidRequirement as error:
            findings.append(
                Finding(path=path, message=f"invalid requirement: {error}", fixable=False)
            )
            continue

        name = canonicalize_name(requirement.name)

        if requirement.url is not None:
            findings.append(
                Finding(
                    path=path,
                    message=f"`{text}` is a URL requirement; workspace members are wired"
                    " through [tool.uv.sources], and everything else must resolve from"
                    " the registry",
                    fixable=False,
                )
            )
            continue

        if name in workspace_members:
            continue

        problem = _missing_bounds(requirement)
        if problem is None:
            loose_floor = _loose_floor_finding(
                path=path, text=text, requirement=requirement, resolved=resolved.get(name)
            )
            if loose_floor is not None:
                findings.append(loose_floor)

            continue

        if name in allowlist:
            used_exemptions.add(name)
            continue

        findings.append(
            Finding(
                path=path,
                message=f"`{text}` {problem}; pin a full range (e.g. `>=X.Y.Z,<X+1`),"
                f' or own the risk by adding "{name}" to'
                f" `[tool.hash] {INSECURE_BOUNDS_ALLOWLIST_KEY}`",
                fixable=False,
            )
        )

    return findings, frozenset(used_exemptions)


def _stale_exemption_findings(
    *, path: str, allowlist: Iterable[str], used: frozenset[str]
) -> list[Finding]:
    return [
        Finding(
            path=path,
            message=f'"{name}" in `[tool.hash] {INSECURE_BOUNDS_ALLOWLIST_KEY}` exempts'
            " nothing; remove it",
            fixable=False,
        )
        for name in allowlist
        if canonicalize_name(name) not in used
    ]


def _lint_manifest(
    *,
    path: str,
    requirements: tuple[str, ...],
    allowlist: tuple[str, ...],
    workspace_members: frozenset[str],
    resolved: Mapping[str, str],
) -> list[Finding]:
    canonical_allowlist = frozenset(canonicalize_name(name) for name in allowlist)
    findings, used = _lint_requirements(
        path=path,
        requirements=requirements,
        allowlist=canonical_allowlist,
        workspace_members=workspace_members,
        resolved=resolved,
    )
    findings.extend(_stale_exemption_findings(path=path, allowlist=allowlist, used=used))
    return findings


def lint_workspace(workspace: Workspace, /, *, resolved: Mapping[str, str]) -> list[Finding]:
    """Judge every manifest's requirements against the dependency rules.

    `resolved` maps a canonical distribution name to the version the lockfile
    resolved for it; :func:`lint` reads it from the lockfile.
    """
    members = frozenset(
        canonicalize_name(member.name) for member in workspace.members if member.name is not None
    )

    findings = _lint_manifest(
        path="pyproject.toml",
        requirements=workspace.dev_dependencies,
        allowlist=workspace.insecure_bounds_allowlist,
        workspace_members=members,
        resolved=resolved,
    )
    for member in workspace.members:
        findings.extend(
            _lint_manifest(
                path=f"{member.directory}/pyproject.toml",
                requirements=member.dependencies + member.dev_dependencies,
                allowlist=member.insecure_bounds_allowlist,
                workspace_members=members,
                resolved=resolved,
            )
        )

    return findings


def lint(root: Path, /) -> list[Finding]:
    """Load the workspace at `root` and judge its dependency requirements."""
    resolved = {
        str(canonicalize_name(name)): version
        for name, version in load_lockfile_versions(root).items()
    }
    return lint_workspace(load_workspace(root), resolved=resolved)
