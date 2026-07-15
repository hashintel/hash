"""Tests for the sync engine: check findings, fixes, and idempotency."""

import json
import tomllib
from pathlib import Path

from repo_chores.sync import assemble_package_json, synchronize
from repo_chores.workspace import Member


class TestCheck:
    def test_reports_every_deviation_without_writing(self, fixture_repo: Path) -> None:
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

    def test_unnamed_manifest_is_unfixable(self, fixture_repo: Path) -> None:
        findings = synchronize(fixture_repo, apply=False)
        unfixable = [finding for finding in findings if not finding.fixable]

        assert [finding.path for finding in unfixable] == ["packages/toolcfg/pyproject.toml"]

    def test_invalid_dev_requirement_is_an_unfixable_finding(self, fixture_repo: Path) -> None:
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


class TestFix:
    def test_fixes_are_applied_and_idempotent(self, fixture_repo: Path) -> None:
        synchronize(fixture_repo, apply=True)

        root_manifest = tomllib.loads((fixture_repo / "pyproject.toml").read_text())
        expected_members = ["outside/lib", "packages/alpha", "packages/beta"]
        assert root_manifest["tool"]["uv"]["workspace"]["members"] == expected_members
        assert root_manifest["tool"]["ruff"]["src"] == expected_members
        assert root_manifest["tool"]["tach"]["source_roots"] == expected_members
        assert root_manifest["tool"]["pytest"]["ini_options"]["testpaths"] == [
            "packages/alpha/tests"
        ]

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

    def test_root_manifest_comments_survive_fixes(self, fixture_repo: Path) -> None:
        manifest_path = fixture_repo / "pyproject.toml"
        manifest_path.write_text(
            manifest_path.read_text().replace(
                "[tool.uv.workspace]", "# Managed members list.\n[tool.uv.workspace]"
            )
        )

        synchronize(fixture_repo, apply=True)

        assert "# Managed members list." in manifest_path.read_text()

    def test_removes_stale_and_duplicate_member_entries(self, fixture_repo: Path) -> None:
        stale = (
            'members = [\n    "packages/ghost",\n    "packages/alpha",\n    "packages/alpha",\n]'
        )
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

    def test_non_string_member_entries_are_reported_not_clobbered(self, fixture_repo: Path) -> None:
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


class TestAssemblePackageJson:
    @staticmethod
    def make_member(
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

    @staticmethod
    def scripts_of(assembled: dict[str, object]) -> dict[str, str]:
        scripts = assembled["scripts"]
        assert isinstance(scripts, dict)
        checked = {
            key: value
            for key, value in scripts.items()
            if isinstance(key, str) and isinstance(value, str)
        }
        assert len(checked) == len(scripts)
        return checked

    def test_preserves_custom_scripts_and_extra_keys(self) -> None:
        existing = {
            "description": "Hand-written description",
            "scripts": {"custom:thing": "echo hi"},
        }

        assembled = assemble_package_json(self.make_member(), existing)

        assert assembled["description"] == "Hand-written description"
        assert self.scripts_of(assembled)["custom:thing"] == "echo hi"
        assert "lint:ruff" in self.scripts_of(assembled)
        assert "fix:ruff" in self.scripts_of(assembled)

    def test_manages_identity_scripts_and_dependencies(self) -> None:
        member = self.make_member(workspace_dependencies=("alpha-core",), has_tests=True)

        assembled = assemble_package_json(member, {"name": "@python/stale", "license": "MIT"})

        assert assembled["name"] == "@python/alpha", "stale names are overwritten"
        assert assembled["license"] == "MIT", "hand-set licenses are preserved"
        assert "test:unit" in self.scripts_of(assembled)
        assert assembled["dependencies"] == {"@python/alpha-core": "workspace:*"}

    def test_omits_empty_dependencies(self) -> None:
        assembled = assemble_package_json(self.make_member(), {"dependencies": {"x": "1"}})

        assert "dependencies" not in assembled
