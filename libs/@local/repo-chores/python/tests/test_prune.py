"""Tests for the turbo workspace prune module."""

from pathlib import Path

from repo_chores import prune


class TestParseScopes:
    def test_splits_on_spaces_and_newlines(self) -> None:
        assert prune.parse_scopes("@apps/a @apps/b\n@apps/c") == frozenset({
            "@apps/a",
            "@apps/b",
            "@apps/c",
        })

    def test_ignores_blank_lines_and_extra_whitespace(self) -> None:
        assert prune.parse_scopes("\n  @apps/a  \n\n\t@apps/b\n") == frozenset({
            "@apps/a",
            "@apps/b",
        })


class TestExpandScopes:
    def test_no_rule_matches(self) -> None:
        assert prune.expand_scopes({"@apps/hash-frontend"}) == frozenset()

    def test_prefix_trigger(self) -> None:
        # Rules trigger on name prefixes: a child crate pulls in the whole family.
        assert "@rust/darwin-kperf-codegen" in prune.expand_scopes({"@rust/darwin-kperf-sys"})


class TestFixpointExpand:
    def test_expands_rules_triggered_by_dependencies(self) -> None:
        dependencies = {"@apps/hash-graph": frozenset({"@rust/hashql-ast"})}
        scopes = prune.fixpoint_expand({"@apps/hash-graph"}, dependencies)
        assert scopes == frozenset({"@apps/hash-graph", "@rust/hashql-compiletest"})

    def test_expansion_reaches_fixpoint_through_added_scopes(self) -> None:
        # The scope added by the first rule has dependencies that trigger another rule.
        dependencies = {
            "@rust/hashql-compiletest": frozenset({"@rust/hash-graph-types"}),
        }
        scopes = prune.fixpoint_expand({"@rust/hashql-ast"}, dependencies)
        assert scopes == frozenset({
            "@rust/hashql-ast",
            "@rust/hashql-compiletest",
            "@rust/hash-graph-test-data",
        })

    def test_terminates_on_cyclic_dependency_maps(self) -> None:
        dependencies = {
            "@apps/a": frozenset({"@apps/b"}),
            "@apps/b": frozenset({"@apps/a"}),
        }
        scopes = prune.fixpoint_expand({"@apps/a"}, dependencies)
        assert scopes == frozenset({"@apps/a"})


class TestResolveCargoMembers:
    def test_resolves_globs_and_literal_members(self, tmp_path: Path) -> None:
        (tmp_path / "Cargo.toml").write_text('[workspace]\nmembers = ["crates/*", "standalone"]\n')
        for member in ("crates/a", "crates/b", "standalone"):
            (tmp_path / member).mkdir(parents=True)
            (tmp_path / member / "Cargo.toml").write_text(
                f'[package]\nname = "{member.replace("/", "-")}"\n'
            )
        # A directory matching the glob but without a manifest is not a member.
        (tmp_path / "crates" / "not-a-crate").mkdir()

        members = prune.resolve_cargo_members(tmp_path)

        assert sorted(path.relative_to(tmp_path).as_posix() for path in members) == [
            "crates/a/Cargo.toml",
            "crates/b/Cargo.toml",
            "standalone/Cargo.toml",
        ]


class TestStubMissingCargoMembers:
    @staticmethod
    def make_workspace(root: Path) -> None:
        (root / "Cargo.toml").write_text('[workspace]\nmembers = ["crates/*"]\n')
        for name in ("kept", "pruned"):
            (root / "crates" / name).mkdir(parents=True)
            (root / "crates" / name / "Cargo.toml").write_text(f'[package]\nname = "{name}"\n')

    def test_stubs_only_missing_members(self, tmp_path: Path) -> None:
        self.make_workspace(tmp_path)
        out = tmp_path / "out"
        kept_manifest = out / "crates" / "kept" / "Cargo.toml"
        kept_manifest.parent.mkdir(parents=True)
        kept_manifest.write_text("untouched")

        prune.stub_missing_cargo_members(tmp_path, out)

        assert kept_manifest.read_text() == "untouched"
        stub = out / "crates" / "pruned" / "Cargo.toml"
        assert 'name = "pruned"' in stub.read_text()
        assert (out / "crates" / "pruned" / "src" / "lib.rs").exists()

    def test_skips_manifests_without_a_package_name(self, tmp_path: Path) -> None:
        (tmp_path / "Cargo.toml").write_text('[workspace]\nmembers = ["virtual"]\n')
        (tmp_path / "virtual").mkdir()
        (tmp_path / "virtual" / "Cargo.toml").write_text("[workspace]\n")

        prune.stub_missing_cargo_members(tmp_path, tmp_path / "out")

        assert not (tmp_path / "out" / "virtual" / "Cargo.toml").exists()

    def test_dry_run_writes_nothing(self, tmp_path: Path) -> None:
        self.make_workspace(tmp_path)
        out = tmp_path / "out"

        prune.stub_missing_cargo_members(tmp_path, out, dry_run=True)

        assert not out.exists()


class TestResolveUvMembers:
    def test_missing_root_pyproject(self, tmp_path: Path) -> None:
        assert prune.resolve_uv_members(tmp_path) == []

    def test_pyproject_without_workspace(self, tmp_path: Path) -> None:
        (tmp_path / "pyproject.toml").write_text('[project]\nname = "root"\n')
        assert prune.resolve_uv_members(tmp_path) == []

    def test_resolves_member_globs(self, tmp_path: Path) -> None:
        (tmp_path / "pyproject.toml").write_text(
            '[tool.uv.workspace]\nmembers = ["tools/*", "single"]\n'
        )
        for member in ("tools/a", "tools/b", "single"):
            (tmp_path / member).mkdir(parents=True)
            (tmp_path / member / "pyproject.toml").write_text("[project]\n")
        (tmp_path / "tools" / "not-a-package").mkdir()

        members = prune.resolve_uv_members(tmp_path)

        assert sorted(path.relative_to(tmp_path).as_posix() for path in members) == [
            "single/pyproject.toml",
            "tools/a/pyproject.toml",
            "tools/b/pyproject.toml",
        ]

    def test_respects_workspace_excludes(self, tmp_path: Path) -> None:
        (tmp_path / "pyproject.toml").write_text(
            '[tool.uv.workspace]\nmembers = ["tools/*"]\nexclude = ["tools/skipped"]\n'
        )
        for member in ("tools/a", "tools/skipped"):
            (tmp_path / member).mkdir(parents=True)
            (tmp_path / member / "pyproject.toml").write_text("[project]\n")

        members = prune.resolve_uv_members(tmp_path)

        assert [path.relative_to(tmp_path).as_posix() for path in members] == [
            "tools/a/pyproject.toml"
        ]


class TestStubMissingUvMembers:
    @staticmethod
    def make_workspace(root: Path) -> None:
        (root / "pyproject.toml").write_text('[tool.uv.workspace]\nmembers = ["tools/*"]\n')
        for name in ("kept", "pruned"):
            (root / "tools" / name).mkdir(parents=True)
            (root / "tools" / name / "pyproject.toml").write_text(
                f'[project]\nname = "{name}"\nversion = "1.2.3"\ndependencies = ["numpy>=2"]\n'
            )

    def test_copies_manifests_of_missing_members(self, tmp_path: Path) -> None:
        self.make_workspace(tmp_path)
        out = tmp_path / "out"
        kept_manifest = out / "tools" / "kept" / "pyproject.toml"
        kept_manifest.parent.mkdir(parents=True)
        kept_manifest.write_text("untouched")

        prune.stub_missing_uv_members(tmp_path, out)

        assert kept_manifest.read_text() == "untouched"
        # The stub is a byte-for-byte manifest copy: uv validates the workspace
        # graph (including each member's dependencies) against uv.lock.
        stub = out / "tools" / "pruned" / "pyproject.toml"
        assert stub.read_bytes() == (tmp_path / "tools" / "pruned" / "pyproject.toml").read_bytes()

    def test_dry_run_writes_nothing(self, tmp_path: Path) -> None:
        self.make_workspace(tmp_path)
        out = tmp_path / "out"

        prune.stub_missing_uv_members(tmp_path, out, dry_run=True)

        assert not out.exists()
