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

    assert lint_workspace(workspace) == []


def test_missing_upper_bound_fails() -> None:
    findings = lint_workspace(make_workspace(dev_dependencies=("ruff>=0.15.21",)))

    assert len(findings) == 1
    assert "no upper bound" in findings[0].message
    assert not findings[0].fixable


def test_missing_lower_bound_fails() -> None:
    # `<2` alone lets resolution reach arbitrarily far down.
    findings = lint_workspace(make_workspace(dev_dependencies=("ruff<2",)))

    assert len(findings) == 1
    assert "no lower bound" in findings[0].message


def test_bare_requirement_fails() -> None:
    findings = lint_workspace(make_workspace(dev_dependencies=("pytest",)))

    assert len(findings) == 1
    assert "no version bounds at all" in findings[0].message


def test_exclusion_alone_is_not_a_bound() -> None:
    findings = lint_workspace(make_workspace(dev_dependencies=("ruff!=0.15.20",)))

    assert len(findings) == 1
    assert "no version bounds at all" in findings[0].message


def test_workspace_members_are_exempt() -> None:
    member = make_member(name="hash-repo-chores")
    workspace = make_workspace(dev_dependencies=("hash-repo-chores",), members=(member,))

    assert lint_workspace(workspace) == []


def test_member_manifests_are_judged_too() -> None:
    member = make_member(dependencies=("requests>=2",), dev_dependencies=("pytest",))
    workspace = make_workspace(members=(member,))

    findings = lint_workspace(workspace)

    assert len(findings) == 2
    assert all(finding.path == "packages/alpha/pyproject.toml" for finding in findings)


# Allowlist


def test_allowlisted_dependency_is_exempt() -> None:
    workspace = make_workspace(dev_dependencies=("ruff>=0.15.21",), allowlist=("ruff",))

    assert lint_workspace(workspace) == []


def test_allowlist_names_are_canonicalized() -> None:
    member = make_member(dependencies=("legacy.pkg>=1",), allowlist=("Legacy-Pkg",))
    workspace = make_workspace(members=(member,))

    assert lint_workspace(workspace) == []


def test_stale_allowlist_entry_fails() -> None:
    workspace = make_workspace(dev_dependencies=("ruff>=0.15.21,<0.16",), allowlist=("ruff",))

    findings = lint_workspace(workspace)

    assert len(findings) == 1
    assert "exempts nothing" in findings[0].message


def test_allowlist_is_scoped_to_its_manifest() -> None:
    # The root allowlist does not cover a member's dependencies.
    member = make_member(dependencies=("requests>=2",))
    workspace = make_workspace(members=(member,), allowlist=("requests",))

    findings = lint_workspace(workspace)

    messages = [finding.message for finding in findings]
    assert any("no upper bound" in message for message in messages)
    assert any("exempts nothing" in message for message in messages)


# URL and invalid requirements


def test_url_requirements_fail_even_when_allowlisted() -> None:
    workspace = make_workspace(
        dev_dependencies=("weird @ https://example.com/weird-1.0.tar.gz",),
        allowlist=("weird",),
    )

    findings = lint_workspace(workspace)

    assert any("URL requirement" in finding.message for finding in findings)


def test_invalid_requirement_is_reported() -> None:
    workspace = make_workspace(dev_dependencies=(">=1.0",))

    findings = lint_workspace(workspace)

    assert len(findings) == 1
    assert "invalid requirement" in findings[0].message
