"""Tests for the dependency requirement lint."""

from pathlib import Path

from repo_chores.lint import lint_workspace
from repo_chores.workspace import Member, Workspace


def make_workspace(
    *,
    dev_dependencies: tuple[str, ...] = (),
    allowlist: tuple[str, ...] = (),
    members: tuple[Member, ...] = (),
) -> Workspace:
    return Workspace(
        root=Path(),
        requires_python=">=3.14,<3.15",
        declared_members=tuple(member.directory for member in members),
        dev_dependencies=dev_dependencies,
        insecure_bounds_allowlist=allowlist,
        members=members,
    )


def make_member(
    *,
    name: str = "alpha",
    dependencies: tuple[str, ...] = (),
    dev_dependencies: tuple[str, ...] = (),
    allowlist: tuple[str, ...] = (),
) -> Member:
    return Member(
        directory=f"packages/{name}",
        name=name,
        requires_python=">=3.14,<3.15",
        dependencies=dependencies,
        dev_dependencies=dev_dependencies,
        workspace_dependencies=(),
        insecure_bounds_allowlist=allowlist,
        has_tests=False,
    )


# Upper and lower bounds


def test_bounded_ranges_pass() -> None:
    workspace = make_workspace(
        dev_dependencies=(
            "ruff>=0.15.21,<0.16",
            "tach~=0.35.0",
            "exact==1.2.3",
            "arbitrary===1.2.3",
        )
    )

    assert lint_workspace(workspace, resolved={}) == []


def test_missing_upper_bound_fails() -> None:
    findings = lint_workspace(make_workspace(dev_dependencies=("ruff>=0.15.21",)), resolved={})

    assert len(findings) == 1
    assert "no upper bound" in findings[0].message
    assert not findings[0].fixable


def test_missing_lower_bound_fails() -> None:
    # `<2` alone lets resolution reach arbitrarily far down.
    findings = lint_workspace(make_workspace(dev_dependencies=("ruff<2",)), resolved={})

    assert len(findings) == 1
    assert "no lower bound" in findings[0].message


def test_bare_requirement_fails() -> None:
    findings = lint_workspace(make_workspace(dev_dependencies=("pytest",)), resolved={})

    assert len(findings) == 1
    assert "no version bounds at all" in findings[0].message


def test_exclusion_alone_is_not_a_bound() -> None:
    findings = lint_workspace(make_workspace(dev_dependencies=("ruff!=0.15.20",)), resolved={})

    assert len(findings) == 1
    assert "no version bounds at all" in findings[0].message


def test_workspace_members_are_exempt() -> None:
    member = make_member(name="hash-repo-chores")
    workspace = make_workspace(dev_dependencies=("hash-repo-chores",), members=(member,))

    assert lint_workspace(workspace, resolved={}) == []


def test_member_manifests_are_judged_too() -> None:
    member = make_member(dependencies=("requests>=2",), dev_dependencies=("pytest",))
    workspace = make_workspace(members=(member,))

    findings = lint_workspace(workspace, resolved={})

    assert len(findings) == 2
    assert all(finding.path == "packages/alpha/pyproject.toml" for finding in findings)


# Floors against the resolved versions


def test_a_floor_below_the_resolved_series_fails() -> None:
    workspace = make_workspace(dev_dependencies=("fastapi>=0.128.8,<0.140.0",))

    findings = lint_workspace(workspace, resolved={"fastapi": "0.139.2"})

    assert len(findings) == 1
    assert "admits 0.128.8, older than the resolved 0.139.2" in findings[0].message
    assert "raise it to 0.139" in findings[0].message
    assert not findings[0].fixable


def test_a_floor_naming_the_resolved_series_passes() -> None:
    # The floor names the series, not the patch: a patch release must not force
    # a manifest edit, while a minor one must.
    workspace = make_workspace(dev_dependencies=("fastapi>=0.139.0,<0.140.0",))

    assert lint_workspace(workspace, resolved={"fastapi": "0.139.2"}) == []


def test_a_prerelease_floor_is_compared_by_series() -> None:
    workspace = make_workspace(dev_dependencies=("otel-instrumentation>=0.65b0,<0.66.0",))

    assert lint_workspace(workspace, resolved={"otel-instrumentation": "0.65b0"}) == []


def test_a_compatible_release_floor_is_judged_too() -> None:
    workspace = make_workspace(dev_dependencies=("tach~=0.35.0",))

    findings = lint_workspace(workspace, resolved={"tach": "0.36.1"})

    assert len(findings) == 1
    assert "admits 0.35.0, older than the resolved 0.36.1" in findings[0].message


def test_a_distribution_absent_from_the_lockfile_is_not_judged() -> None:
    # `uv sync --locked` owns manifest-against-lockfile disagreement; repeating
    # it here would report the same drift twice, in two vocabularies.
    workspace = make_workspace(dev_dependencies=("ruff>=0.15.21,<0.16",))

    assert lint_workspace(workspace, resolved={}) == []


def test_an_unbounded_requirement_is_reported_once() -> None:
    # The bounds rule fires first; a requirement with no upper bound does not
    # also collect a floor finding.
    workspace = make_workspace(dev_dependencies=("ruff>=0.1",))

    findings = lint_workspace(workspace, resolved={"ruff": "0.15.21"})

    assert len(findings) == 1
    assert "no upper bound" in findings[0].message


def test_the_allowlist_does_not_exempt_a_loose_floor() -> None:
    # The allowlist buys an unbounded range, which is a different risk: a floor
    # older than the resolution is a claim about tested versions.
    workspace = make_workspace(dev_dependencies=("ruff>=0.1,<0.16",), allowlist=("ruff",))

    findings = lint_workspace(workspace, resolved={"ruff": "0.15.21"})

    messages = [finding.message for finding in findings]
    assert any("older than the resolved 0.15.21" in message for message in messages)


# Allowlist


def test_allowlisted_dependency_is_exempt() -> None:
    workspace = make_workspace(dev_dependencies=("ruff>=0.15.21",), allowlist=("ruff",))

    assert lint_workspace(workspace, resolved={}) == []


def test_allowlist_names_are_canonicalized() -> None:
    member = make_member(dependencies=("legacy.pkg>=1",), allowlist=("Legacy-Pkg",))
    workspace = make_workspace(members=(member,))

    assert lint_workspace(workspace, resolved={}) == []


def test_stale_allowlist_entry_fails() -> None:
    workspace = make_workspace(dev_dependencies=("ruff>=0.15.21,<0.16",), allowlist=("ruff",))

    findings = lint_workspace(workspace, resolved={})

    assert len(findings) == 1
    assert "exempts nothing" in findings[0].message


def test_allowlist_is_scoped_to_its_manifest() -> None:
    # The root allowlist does not cover a member's dependencies.
    member = make_member(dependencies=("requests>=2",))
    workspace = make_workspace(members=(member,), allowlist=("requests",))

    findings = lint_workspace(workspace, resolved={})

    messages = [finding.message for finding in findings]
    assert any("no upper bound" in message for message in messages)
    assert any("exempts nothing" in message for message in messages)


# URL and invalid requirements


def test_url_requirements_fail_even_when_allowlisted() -> None:
    workspace = make_workspace(
        dev_dependencies=("weird @ https://example.com/weird-1.0.tar.gz",),
        allowlist=("weird",),
    )

    findings = lint_workspace(workspace, resolved={})

    assert any("URL requirement" in finding.message for finding in findings)


def test_invalid_requirement_is_reported() -> None:
    workspace = make_workspace(dev_dependencies=(">=1.0",))

    findings = lint_workspace(workspace, resolved={})

    assert len(findings) == 1
    assert "invalid requirement" in findings[0].message
