"""Tests for workspace discovery and parsing."""

from pathlib import Path

import pytest

from repo_chores.workspace import (
    WorkspaceError,
    find_member_manifests,
    find_workspace_root,
    load_workspace,
)


def test_find_member_manifests_skips_pruned_and_root(fixture_repo: Path) -> None:
    manifests = find_member_manifests(fixture_repo)
    directories = [manifest.parent.relative_to(fixture_repo).as_posix() for manifest in manifests]

    assert directories == [
        "outside/lib",
        "packages/alpha",
        "packages/beta",
        "packages/toolcfg",
    ]


def test_find_workspace_root_walks_up_from_member(fixture_repo: Path) -> None:
    assert find_workspace_root(fixture_repo / "packages" / "alpha") == fixture_repo


def test_find_workspace_root_errors_when_no_workspace_exists(tmp_path: Path) -> None:
    with pytest.raises(WorkspaceError, match=r"tool\.uv\.workspace"):
        find_workspace_root(tmp_path)


def test_load_workspace_parses_root_and_members(fixture_repo: Path) -> None:
    workspace = load_workspace(fixture_repo)

    assert workspace.requires_python == ">=3.14,<3.15"
    assert workspace.declared_members == ("packages/alpha",)

    members = {member.directory: member for member in workspace.members}
    assert members["packages/alpha"].has_tests
    assert members["packages/alpha"].requires_python == ">=3.13"
    assert members["packages/beta"].workspace_dependencies == ("alpha",)
    assert not members["packages/beta"].has_tests
    assert members["packages/toolcfg"].name is None
