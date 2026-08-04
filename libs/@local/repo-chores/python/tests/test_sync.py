"""Tests for the sync engine: check findings, fixes, and idempotency."""

import json
import tomllib
from pathlib import Path

import pytest

from repo_chores import sync
from repo_chores.sync import PYTEST_SCRIPT, assemble_package_json, synchronize
from repo_chores.workspace import Finding, Member, WorkspaceError

# Check mode


def test_check_reports_every_deviation_without_writing(fixture_repo: Path) -> None:
    before = {path: path.read_text() for path in fixture_repo.rglob("*") if path.is_file()}

    findings = synchronize(fixture_repo, apply=False)
    messages = "\n".join(f"{finding.path}: {finding.message}" for finding in findings)

    assert "workspace members must list every member" in messages
    assert "ruff src roots must list every member" in messages
    assert "pytest testpaths must list every member" in messages
    assert "tach source roots must list every member" in messages
    assert "outside/lib is not covered by workspaces.packages" in messages
    assert 'packages/alpha/pyproject.toml: requires-python must be ">=3.14,<3.15"' in messages
    assert 'dev group must pin "ruff>=0.15.21"' in messages
    assert 'dev group must pin "pytest>=8.0"' in messages
    assert "packages/alpha/package.json: turbo wiring is missing" in messages
    assert "packages/beta/package.json: turbo wiring is missing" in messages
    assert "packages/toolcfg/pyproject.toml: manifest has no [project] name" in messages

    after = {path: path.read_text() for path in fixture_repo.rglob("*") if path.is_file()}
    assert before == after, "check mode must not write"


def test_single_segment_globs_do_not_cover_nested_members(fixture_repo: Path) -> None:
    # fnmatch's `*` crosses path separators and would falsely treat the
    # nested member as covered; yarn's `*` stays within one segment.
    package_json_path = fixture_repo / "package.json"
    data = json.loads(package_json_path.read_text())
    data["workspaces"]["packages"] = ["!**/node_modules", "outside/*", "packages/*"]
    package_json_path.write_text(json.dumps(data, indent=2) + "\n")

    nested = fixture_repo / "packages" / "group" / "deep"
    nested.mkdir(parents=True)
    (nested / "pyproject.toml").write_text(
        '[project]\nname = "deep"\nversion = "0.1.0"\nrequires-python = ">=3.14,<3.15"\n'
    )

    findings = synchronize(fixture_repo, apply=False)

    messages = [finding.message for finding in findings]
    assert any("packages/group/deep is not covered" in message for message in messages)
    assert not any("packages/alpha is not covered" in message for message in messages)
    assert not any("outside/lib is not covered" in message for message in messages)


def test_unnamed_manifest_is_unfixable(fixture_repo: Path) -> None:
    findings = synchronize(fixture_repo, apply=False)
    unfixable = [finding for finding in findings if not finding.fixable]

    assert [finding.path for finding in unfixable] == ["packages/toolcfg/pyproject.toml"]


def test_invalid_dev_requirement_is_an_unfixable_finding(fixture_repo: Path) -> None:
    manifest_path = fixture_repo / "packages" / "alpha" / "pyproject.toml"
    manifest_path.write_text(
        manifest_path.read_text().replace('"pytest>=7.0"', '">=not-a-requirement"')
    )

    findings = synchronize(fixture_repo, apply=False)

    assert any(
        finding.path == "packages/alpha/pyproject.toml"
        and "invalid dev requirement" in finding.message
        and not finding.fixable
        for finding in findings
    )


# Fix mode


def test_fixes_are_applied_and_idempotent(fixture_repo: Path) -> None:
    synchronize(fixture_repo, apply=True)

    root_manifest = tomllib.loads((fixture_repo / "pyproject.toml").read_text())
    expected_members = ["outside/lib", "packages/alpha", "packages/beta"]
    assert root_manifest["tool"]["uv"]["workspace"]["members"] == expected_members
    assert root_manifest["tool"]["ruff"]["src"] == expected_members
    assert root_manifest["tool"]["tach"]["source_roots"] == expected_members
    test_options = root_manifest["tool"]["pytest"]["ini_options"]
    assert test_options["testpaths"] == ["packages/alpha/tests"]
    assert test_options["pythonpath"] == ["packages/alpha"]

    root_package_json = json.loads((fixture_repo / "package.json").read_text())
    assert "outside/lib" in root_package_json["workspaces"]["packages"]

    alpha_manifest = tomllib.loads(
        (fixture_repo / "packages" / "alpha" / "pyproject.toml").read_text()
    )
    assert alpha_manifest["project"]["requires-python"] == ">=3.14,<3.15"
    assert alpha_manifest["dependency-groups"]["dev"] == ["pytest>=8.0", "ruff>=0.15.21"]

    alpha_package_json = json.loads(
        (fixture_repo / "packages" / "alpha" / "package.json").read_text()
    )
    assert alpha_package_json["name"] == "@python/alpha"
    assert alpha_package_json["license"] == "AGPL-3"
    assert "test:unit" in alpha_package_json["scripts"]

    beta_package_json = json.loads(
        (fixture_repo / "packages" / "beta" / "package.json").read_text()
    )
    assert beta_package_json["name"] == "@python/beta"
    assert beta_package_json["dependencies"] == {"@python/alpha": "workspace:*"}
    assert "test:unit" not in beta_package_json["scripts"]

    # Only the unfixable finding remains; a second apply changes nothing.
    remaining = synchronize(fixture_repo, apply=True)
    assert [finding.fixable for finding in remaining] == [False]


def test_root_manifest_comments_survive_fixes(fixture_repo: Path) -> None:
    manifest_path = fixture_repo / "pyproject.toml"
    manifest_path.write_text(
        manifest_path.read_text().replace(
            "[tool.uv.workspace]", "# Managed members list.\n[tool.uv.workspace]"
        )
    )

    synchronize(fixture_repo, apply=True)

    assert "# Managed members list." in manifest_path.read_text()


def test_fix_removes_stale_and_duplicate_member_entries(fixture_repo: Path) -> None:
    stale = 'members = [\n    "packages/ghost",\n    "packages/alpha",\n    "packages/alpha",\n]'
    manifest_path = fixture_repo / "pyproject.toml"
    manifest_path.write_text(
        manifest_path.read_text().replace('members = [\n    "packages/alpha",\n]', stale)
    )

    synchronize(fixture_repo, apply=True)

    root_manifest = tomllib.loads(manifest_path.read_text())
    assert root_manifest["tool"]["uv"]["workspace"]["members"] == [
        "outside/lib",
        "packages/alpha",
        "packages/beta",
    ]


def test_fix_sorts_a_reordered_member_list(fixture_repo: Path) -> None:
    # A member list holding the right entries in the wrong order used to be a
    # deviation apply mode could not clear: it reported a fix, wrote nothing,
    # and left `--check` red on every following run.
    synchronize(fixture_repo, apply=True)
    manifest_path = fixture_repo / "pyproject.toml"
    sorted_members = (
        'members = [\n    "outside/lib",\n    "packages/alpha",\n    "packages/beta",\n]'
    )
    reordered = 'members = [\n    "packages/beta",\n    "outside/lib",\n    "packages/alpha",\n]'
    manifest_path.write_text(manifest_path.read_text().replace(sorted_members, reordered))

    findings = synchronize(fixture_repo, apply=True)

    assert any("workspace members must list every member, sorted" in f.message for f in findings)
    root_manifest = tomllib.loads(manifest_path.read_text())
    assert root_manifest["tool"]["uv"]["workspace"]["members"] == [
        "outside/lib",
        "packages/alpha",
        "packages/beta",
    ]
    # The deviation is gone for good: check mode sees only the unfixable one.
    assert [finding.fixable for finding in synchronize(fixture_repo, apply=False)] == [False]


def test_a_comment_line_follows_the_member_it_documents(fixture_repo: Path) -> None:
    manifest_path = fixture_repo / "pyproject.toml"
    annotated = 'members = [\n    # the flagship package\n    "packages/alpha",\n]'
    manifest_path.write_text(
        manifest_path.read_text().replace('members = [\n    "packages/alpha",\n]', annotated)
    )

    synchronize(fixture_repo, apply=True)

    # Two members sort ahead of it, so the comment has to move with its own line.
    assert (
        "members = [\n"
        '    "outside/lib",\n'
        "    # the flagship package\n"
        '    "packages/alpha",\n'
        '    "packages/beta",\n'
        "]"
    ) in manifest_path.read_text()
    assert [finding.fixable for finding in synchronize(fixture_repo, apply=False)] == [False]


def test_write_refuses_to_claim_a_fix_that_changed_nothing(tmp_path: Path) -> None:
    path = tmp_path / "pyproject.toml"
    path.write_text("unchanged")

    with pytest.raises(WorkspaceError, match="changed nothing"):
        sync._write(
            path=path,
            original="unchanged",
            content="unchanged",
            findings=[Finding(path="pyproject.toml", message="a deviation")],
            apply=True,
        )


def test_unfixable_findings_alone_do_not_trip_the_write_check(tmp_path: Path) -> None:
    path = tmp_path / "pyproject.toml"
    path.write_text("unchanged")

    sync._write(
        path=path,
        original="unchanged",
        content="unchanged",
        findings=[Finding(path="pyproject.toml", message="a deviation", fixable=False)],
        apply=True,
    )

    assert path.read_text() == "unchanged"


def test_workspaces_declared_as_a_bare_list_is_covered(fixture_repo: Path) -> None:
    package_json_path = fixture_repo / "package.json"
    data = json.loads(package_json_path.read_text())
    data["workspaces"] = ["!**/node_modules", "packages/**"]
    package_json_path.write_text(json.dumps(data, indent=2) + "\n")

    synchronize(fixture_repo, apply=True)

    assert json.loads(package_json_path.read_text())["workspaces"] == [
        "!**/node_modules",
        "outside/lib",
        "packages/**",
    ]


def test_a_root_manifest_without_workspaces_is_a_loud_error(fixture_repo: Path) -> None:
    package_json_path = fixture_repo / "package.json"
    data = json.loads(package_json_path.read_text())
    del data["workspaces"]
    package_json_path.write_text(json.dumps(data, indent=2) + "\n")

    with pytest.raises(WorkspaceError, match="declares no yarn workspaces list"):
        synchronize(fixture_repo, apply=False)


def test_non_string_member_entries_are_reported_not_clobbered(fixture_repo: Path) -> None:
    manifest_path = fixture_repo / "pyproject.toml"
    manifest_path.write_text(
        manifest_path.read_text().replace(
            'members = [\n    "packages/alpha",\n]',
            'members = [\n    "packages/alpha",\n    42,\n]',
        )
    )

    findings = synchronize(fixture_repo, apply=True)

    assert any(
        "workspace members must only contain strings" in finding.message and not finding.fixable
        for finding in findings
    )
    root_manifest = tomllib.loads(manifest_path.read_text())
    assert root_manifest["tool"]["uv"]["workspace"]["members"] == ["packages/alpha", 42]


# assemble_package_json


def _make_member(
    *,
    workspace_dependencies: tuple[str, ...] = (),
    has_tests: bool = False,
) -> Member:
    return Member(
        directory="packages/alpha",
        name="alpha",
        requires_python=">=3.14,<3.15",
        dependencies=(),
        dev_dependencies=(),
        workspace_dependencies=workspace_dependencies,
        insecure_bounds_allowlist=(),
        has_tests=has_tests,
    )


def _scripts_of(assembled: dict[str, object]) -> dict[str, str]:
    scripts = assembled["scripts"]
    assert isinstance(scripts, dict)
    checked = {
        key: value
        for key, value in scripts.items()
        if isinstance(key, str) and isinstance(value, str)
    }
    assert len(checked) == len(scripts)
    return checked


def test_assemble_preserves_custom_scripts_and_extra_keys() -> None:
    existing = {
        "description": "Hand-written description",
        "scripts": {"custom:thing": "echo hi"},
    }

    assembled = assemble_package_json(_make_member(), existing)

    assert assembled["description"] == "Hand-written description"
    assert _scripts_of(assembled)["custom:thing"] == "echo hi"
    assert "lint:ruff" in _scripts_of(assembled)
    assert "fix:ruff" in _scripts_of(assembled)


def test_assemble_manages_identity_scripts_and_dependencies() -> None:
    member = _make_member(workspace_dependencies=("alpha-core",), has_tests=True)

    assembled = assemble_package_json(member, {"name": "@python/stale", "license": "MIT"})

    assert assembled["name"] == "@python/alpha", "stale names are overwritten"
    assert assembled["license"] == "MIT", "hand-set licenses are preserved"
    assert "test:unit" in _scripts_of(assembled)
    assert assembled["dependencies"] == {"@python/alpha-core": "workspace:*"}


def test_assemble_keeps_dependencies_outside_the_python_scope() -> None:
    # A Python package's image can bake in a built JavaScript package; the turbo
    # edge that rebuilds the image when that package changes is the dependency
    # declared here, and only the `@python` scope is the sync tool's to own.
    member = _make_member(workspace_dependencies=("alpha-core",))
    existing = {
        "dependencies": {
            "@hashintel/some-cli": "workspace:*",
            "@python/withdrawn": "workspace:*",
        }
    }

    assembled = assemble_package_json(member, existing)

    assert assembled["dependencies"] == {
        "@hashintel/some-cli": "workspace:*",
        "@python/alpha-core": "workspace:*",
    }


def test_assemble_keeps_a_foreign_dependency_when_no_python_source_remains() -> None:
    existing = {"dependencies": {"@hashintel/some-cli": "workspace:*"}}

    assembled = assemble_package_json(_make_member(), existing)

    assert assembled["dependencies"] == {"@hashintel/some-cli": "workspace:*"}


def test_assemble_removes_managed_pytest_script_when_tests_are_gone() -> None:
    existing = {"scripts": {"test:unit": PYTEST_SCRIPT, "custom:thing": "echo hi"}}

    assembled = assemble_package_json(_make_member(has_tests=False), existing)

    assert "test:unit" not in _scripts_of(assembled)
    assert _scripts_of(assembled)["custom:thing"] == "echo hi"


def test_assemble_preserves_hand_written_test_script_without_tests_directory() -> None:
    existing = {"scripts": {"test:unit": "vitest run"}}

    assembled = assemble_package_json(_make_member(has_tests=False), existing)

    assert _scripts_of(assembled)["test:unit"] == "vitest run"


def test_assemble_omits_dependencies_left_with_nothing_to_declare() -> None:
    # The last managed edge going takes the key with it, rather than leaving an
    # empty object behind; an unmanaged edge would keep the key (above).
    existing = {"dependencies": {"@python/withdrawn": "workspace:*"}}

    assembled = assemble_package_json(_make_member(), existing)

    assert "dependencies" not in assembled
