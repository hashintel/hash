import copy
import os
from collections.abc import Callable
from pathlib import Path
from typing import Never

import pytest
import tomlkit
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.utils import canonicalize_name

from repo_chores.constraints._engine import (
    CheckStatus,
    Engine,
    FixStatus,
    OperationKind,
)
from repo_chores.constraints._engine.dependencies import ManifestRequirement
from repo_chores.constraints._engine.diagnostics import (
    ConcurrentManifestChangeError,
    ConvergenceError,
    Diagnostics,
    FixError,
    ManifestError,
    RuleError,
    RuleWarning,
)
from repo_chores.constraints._engine.document import (
    DocumentArray,
    DocumentTable,
    DocumentValue,
    MutationRecorder,
)
from repo_chores.constraints._engine.location import LocationPath
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.package import Package
from repo_chores.constraints._engine.workspace import Workspace, WorkspaceDiscovery
from repo_chores.constraints._engine.writes import ManifestWrites

ROOT = """[project]
name = "test-root"
version = "0.1.0"
requires-python = ">=3.14"
dependencies = ["root-dependency>=1"]

[tool.uv.workspace]
members = ["packages/*"]
"""
MEMBER = """[project]
name = "test-member"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = ["example>=1"]
"""


def _call_with_invalid_positionals(function: Callable[..., object], *arguments: object) -> object:
    """Exercise keyword-only rejection with real positional arguments at runtime."""
    return function(*arguments)


class EngineCase:
    def __init__(self, *, root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        self.root = root.resolve()
        self.member = self.root / "packages/member"
        self.member.mkdir(parents=True)
        self.root_manifest = self.root / "pyproject.toml"
        self.member_manifest = self.member / "pyproject.toml"
        self.root_manifest.write_text(ROOT, encoding="utf-8")
        self.member_manifest.write_text(MEMBER, encoding="utf-8")

        def locate_root(discovery: WorkspaceDiscovery) -> Path:
            assert discovery._directory == self.root
            return self.root

        def locate_members(discovery: WorkspaceDiscovery, root: Path) -> tuple[Path, ...]:
            assert discovery._directory == root == self.root
            return (self.member,)

        monkeypatch.setattr(WorkspaceDiscovery, "root", locate_root)
        monkeypatch.setattr(WorkspaceDiscovery, "members", locate_members)
        self.engine = Engine(directory=self.root)

    def member_package(self) -> Package:
        return Package(manifest=Manifest.load(self.member), diagnostics=Diagnostics())


@pytest.fixture
def engine_case(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> EngineCase:
    return EngineCase(root=tmp_path, monkeypatch=monkeypatch)


class MembershipCase:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.original = ROOT.replace('members = ["packages/*"]', 'members = ["packages/member"]')
        self.root_manifest = self.root / "pyproject.toml"
        self.root_manifest.write_text(self.original, encoding="utf-8")
        for name in ("member", "new"):
            directory = self.root / "packages" / name
            directory.mkdir(parents=True)
            (directory / "pyproject.toml").write_text(
                MEMBER.replace('name = "test-member"', f'name = "test-{name}"'),
                encoding="utf-8",
            )


@pytest.fixture
def membership_case(tmp_path: Path) -> MembershipCase:
    return MembershipCase(tmp_path)


class RemovalCase:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root_manifest = self.root / "pyproject.toml"
        self.original = ROOT.replace(
            'members = ["packages/*"]', 'members = ["packages/member", "packages/new"]'
        )
        self.root_manifest.write_text(self.original, encoding="utf-8")
        self.paths = tuple(self.root / "packages" / name for name in ("member", "new"))
        for directory, name in zip(self.paths, ("member", "new"), strict=True):
            directory.mkdir(parents=True)
            (directory / "pyproject.toml").write_text(
                MEMBER.replace('name = "test-member"', f'name = "test-{name}"'),
                encoding="utf-8",
            )

    @staticmethod
    def remove_new(workspace: Workspace) -> None:
        workspace.members = tuple(
            member for member in workspace.members if member.name != "test-new"
        )


@pytest.fixture
def removal_case(tmp_path: Path) -> RemovalCase:
    return RemovalCase(tmp_path)


def test_no_op(engine_case: EngineCase) -> None:
    before = engine_case.member_manifest.read_bytes()
    check = engine_case.engine.check(())
    assert check.status is CheckStatus.CLEAN
    assert (check.operations, check.diffs, check.diagnostics) == ((), (), ())
    fix = engine_case.engine.fix(())
    assert fix.status is FixStatus.UNCHANGED
    assert fix.written == ()
    assert engine_case.member_manifest.read_bytes() == before


def test_lazy_domain_reads(engine_case: EngineCase) -> None:
    source = """[project]
name = "test-member"
requires-python = "not a specifier"
license = "not a license"
dependencies = ["not a requirement ???"]
authors = [{ name = 42 }]
[tool.uv.sources]
example = { workspace = 42 }
[tool.pytest]
testpaths = []
ini_options = { testpaths = [] }
"""
    engine_case.member_manifest.write_text(source)
    assert engine_case.engine.check(()).status is CheckStatus.CLEAN
    package = engine_case.member_package()
    version = package.python_version
    license_expression = package.license_expression
    [requirement] = package.dependencies
    [author] = package.authors
    [dependency_source] = package.sources.values()
    pytest_config = package.pytest
    assert version is not None
    assert license_expression is not None

    reads: tuple[tuple[Callable[[], object], LocationPath], ...] = (
        (lambda: str(version), ("project", "requires-python")),
        (lambda: str(license_expression), ("project", "license")),
        (lambda: requirement.name, ("project", "dependencies", 0)),
        (lambda: author.name, ("project", "authors", 0, "name")),
        (lambda: dependency_source.is_workspace, ("tool", "uv", "sources", "example", "workspace")),
        (lambda: pytest_config.test_paths, ("tool", "pytest")),
    )
    for read, field in reads:
        with pytest.raises(ManifestError) as caught:
            read()
        assert (caught.value.path, caught.value.field) == (engine_case.member_manifest, field)
    assert package.manifest.render().decode() == source
    assert engine_case.member_manifest.read_text() == source


@pytest.mark.parametrize("bad_requirement", ['"not a requirement ???"', "42"])
def test_replace_malformed_fields(engine_case: EngineCase, bad_requirement: str) -> None:
    engine_case.root_manifest.write_text(
        ROOT + '\n[build-system]\nbuild-backend = "backend"\nrequires = ["builder>=1"]\n'
    )
    source = """[project]
name = "test-member"
requires-python = 'not a specifier' # version
license = "not a license"
authors = [{}] # identity
[build-system]
build-backend = "backend"
requires = ["not a requirement ???"]
[tool.uv.build-backend]
module-name = [42]
module-root = false
[tool.uv.sources]
example = 42 # source
"""
    source = source.replace('"not a requirement ???"', bad_requirement)
    engine_case.member_manifest.write_text(source)

    def repair(workspace: Workspace) -> None:
        member = next(iter(workspace.members))
        member.python_version = SpecifierSet(">=3.14")
        member.authors[0].name = "HASH"
        member.sources.use_workspace("example")
        member.uv_build_layout.module_names = ("module",)
        member.uv_build_layout.module_root = "src"
        assert workspace.build_system is not None
        member.build_system = workspace.build_system

    check = engine_case.engine.check((repair,))
    assert check.status is CheckStatus.CHANGES
    assert check.diagnostics == ()
    assert engine_case.member_manifest.read_text() == source
    assert engine_case.engine.fix((repair,)).status is FixStatus.APPLIED
    assert engine_case.member_manifest.read_text() == (
        source
        .replace("not a specifier", ">=3.14")
        .replace("[{}]", '[{name = "HASH"}]')
        .replace(f"requires = [{bad_requirement}]", 'requires = ["builder>=1"]')
        .replace("[tool.uv.build-backend]", "\n[tool.uv.build-backend]")
        .replace("module-name = [42]", 'module-name = "module"')
        .replace("module-root = false", 'module-root = "src"')
        .replace("example = 42", "example = {workspace = true}")
    )
    assert engine_case.engine.fix((repair,)).status is FixStatus.UNCHANGED


def test_check_specifier(engine_case: EngineCase) -> None:
    before = engine_case.member_manifest.read_bytes()

    def require_new_python(workspace: Workspace) -> None:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")

    report = engine_case.engine.check((require_new_python,))
    assert report.status is CheckStatus.CHANGES
    [operation] = report.operations
    assert operation.location.manifest == engine_case.member_manifest
    assert operation.location.path == ("project", "requires-python")
    assert (operation.kind, operation.before, operation.after) == (
        OperationKind.SET,
        ">=3.13",
        ">=3.14",
    )
    assert (operation.rule, operation.pass_number) == (
        "test_check_specifier.<locals>.require_new_python",
        1,
    )
    [diff] = report.diffs
    assert diff.path == engine_case.member_manifest
    assert '-requires-python = ">=3.13"\n+requires-python = ">=3.14"' in diff.unified()
    assert engine_case.member_manifest.read_bytes() == before


def test_live_reads_and_attribution(engine_case: EngineCase) -> None:
    observed: list[str] = []

    def repair(workspace: Workspace) -> None:
        member = next(iter(workspace.members))
        with workspace.reason("shared baseline"):
            member.python_version = SpecifierSet(">=3.14")
            member.dependencies.insert(Requirement("example>=2"))

    def observe(workspace: Workspace) -> None:
        member = next(iter(workspace.members))
        observed.append(str(member.python_version))
        # An equal value with another spelling records nothing and keeps the bytes.
        member.python_version = SpecifierSet(">=3.14,>=3.14")

    report = engine_case.engine.check((repair, observe))
    assert report.status is CheckStatus.CHANGES, str(report)
    assert report.passes == 2
    assert observed == [">=3.14", ">=3.14"]
    assert [
        (operation.location.path, operation.rule.rsplit(".", 1)[-1], operation.reason)
        for operation in report.operations
    ] == [
        (("project", "requires-python"), "repair", "shared baseline"),
        (("project", "dependencies", 0), "repair", "shared baseline"),
    ]


@pytest.mark.parametrize("cancel", [False, True])
def test_conflicting_writers(engine_case: EngineCase, *, cancel: bool) -> None:

    def first(workspace: Workspace) -> None:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")

    def second(workspace: Workspace) -> None:
        # Restoring the original makes the pass end on the bytes it started from.
        version = ">=3.13" if cancel else ">=3.15"
        next(iter(workspace.members)).python_version = SpecifierSet(version)

    before = engine_case.member_manifest.read_bytes()
    report = engine_case.engine.fix((first, second))
    assert report.status is FixStatus.BLOCKED, str(report)
    assert report.report.passes == (1 if cancel else 2)
    assert "revisited pass" in str(report)
    assert len(report.report.operations) == (2 if cancel else 4)
    assert report.written == ()
    assert engine_case.member_manifest.read_bytes() == before


def test_unexpected_exception(engine_case: EngineCase) -> None:

    def edit_then_fail(workspace: Workspace) -> Never:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")
        raise ValueError("rule failed")

    before = engine_case.member_manifest.read_bytes()
    with pytest.raises(ValueError, match="rule failed"):
        engine_case.engine.fix((edit_then_fail,))
    assert engine_case.member_manifest.read_bytes() == before


def test_reported_error(engine_case: EngineCase) -> None:

    def edit_then_report(workspace: Workspace) -> None:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")
        workspace.error(ValueError("rule reported failure"))

    before = engine_case.member_manifest.read_bytes()
    report = engine_case.engine.fix((edit_then_report,))
    assert report.status is FixStatus.BLOCKED
    assert any(isinstance(item, RuleError) for item in report.report.diagnostics)
    assert report.written == ()
    assert engine_case.member_manifest.read_bytes() == before


def test_fix_then_no_op(engine_case: EngineCase) -> None:

    def update(workspace: Workspace) -> None:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")

    first = engine_case.engine.fix((update,))
    assert first.status is FixStatus.APPLIED
    assert first.written == (engine_case.member_manifest,)
    assert (
        tomlkit.loads(engine_case.member_manifest.read_text())["project"]["requires-python"]
        == ">=3.14"
    )
    second = engine_case.engine.fix((update,))
    assert second.status is FixStatus.UNCHANGED
    assert second.written == ()


def test_later_prerequisite(engine_case: EngineCase) -> None:

    def require_new_python(workspace: Workspace) -> None:
        if str(next(iter(workspace.members)).python_version) != ">=3.14":
            workspace.error(ValueError("needs newer Python"))

    def update(workspace: Workspace) -> None:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")

    report = engine_case.engine.check((require_new_python, update))
    assert report.status is CheckStatus.CHANGES
    assert report.passes == 2
    assert report.diagnostics == ()
    assert len(report.operations) == 1
    assert engine_case.member_manifest.read_text() == MEMBER


def test_pass_limit(engine_case: EngineCase) -> None:

    def update(workspace: Workspace) -> None:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")

    report = Engine(directory=engine_case.root, max_passes=1).fix((update,))
    assert report.status is FixStatus.BLOCKED
    assert report.report.passes == 1
    assert any(
        isinstance(item.error, ConvergenceError)
        for item in report.report.diagnostics
        if isinstance(item, RuleError)
    )
    assert report.written == ()
    assert engine_case.member_manifest.read_text() == MEMBER


def test_reverted_child(engine_case: EngineCase) -> None:
    original_child = MEMBER.replace(
        'dependencies = ["example>=1"]', "dependencies = ['example>=1']"
    )
    engine_case.member_manifest.write_text(original_child, encoding="utf-8")

    def converge(workspace: Workspace) -> None:
        member = next(iter(workspace.members))
        if workspace.authors:
            member.dependencies.insert(Requirement("example>=1"))
        else:
            workspace.authors.append(name="Ada")
            member.dependencies.insert(Requirement("example>=2"))

    report = engine_case.engine.fix((converge,))
    assert report.status is FixStatus.APPLIED
    assert report.report.passes == 3
    assert [
        (operation.location.manifest, operation.location.path, operation.pass_number)
        for operation in report.report.operations
    ] == [
        (engine_case.root_manifest, ("project", "authors"), 1),
        (engine_case.member_manifest, ("project", "dependencies", 0), 1),
        (engine_case.member_manifest, ("project", "dependencies", 0), 2),
    ]
    # String writes retain the original quote style without replaying source bytes.
    assert report.written == (engine_case.root_manifest,)
    assert engine_case.member_manifest.read_text() == original_child


def test_replacement_symlink(engine_case: EngineCase, monkeypatch: pytest.MonkeyPatch) -> None:

    def update(workspace: Workspace) -> None:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")

    original_bytes = engine_case.member_manifest.read_bytes()
    target = engine_case.root / "original-member.toml"
    target.write_bytes(original_bytes)
    apply = ManifestWrites.apply

    def replace_with_symlink_before_apply(writes: ManifestWrites) -> tuple[Path, ...]:
        engine_case.member_manifest.unlink()
        engine_case.member_manifest.symlink_to(target)
        return apply(writes)

    with monkeypatch.context() as patcher:
        patcher.setattr(ManifestWrites, "apply", replace_with_symlink_before_apply)
        with pytest.raises(ConcurrentManifestChangeError) as caught:
            engine_case.engine.fix((update,))
    assert caught.value.path == engine_case.member_manifest
    assert engine_case.member_manifest.is_symlink()
    assert target.read_bytes() == original_bytes


def test_stale_manifest(engine_case: EngineCase, monkeypatch: pytest.MonkeyPatch) -> None:

    def update(workspace: Workspace) -> None:
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")

    apply = ManifestWrites.apply

    def change_before_apply(writes: ManifestWrites) -> tuple[Path, ...]:
        engine_case.member_manifest.write_text(MEMBER + "# external writer\n", encoding="utf-8")
        return apply(writes)

    with monkeypatch.context() as patcher:
        patcher.setattr(ManifestWrites, "apply", change_before_apply)
        with pytest.raises(ConcurrentManifestChangeError):
            engine_case.engine.fix((update,))
    assert engine_case.member_manifest.read_text() == MEMBER + "# external writer\n"


def test_turbo_creation_and_live_views(engine_case: EngineCase) -> None:
    target = engine_case.member / "turbo.json"

    def update(workspace: Workspace) -> None:
        member = next(iter(workspace.members))
        member.python_version = SpecifierSet(">=3.14")
        config = workspace.turbo(member)
        first = config.task("lint:deptry")
        second = config.task("lint:deptry")
        first.command = ["uv", "deptry", "src"]
        assert second.command == ["uv", "deptry", "src"]
        # Reading a missing root file, or deleting an absent override, creates nothing.
        workspace.turbo(workspace).task("test-member#lint:deptry").command = None

    check = engine_case.engine.check((update,))
    assert check.status is CheckStatus.CHANGES
    assert not target.exists()
    assert engine_case.member_manifest.read_text() == MEMBER
    created = next(diff for diff in check.diffs if diff.path == target)
    assert created.before is None
    assert created.unified().startswith("--- /dev/null\n")
    assert engine_case.engine.fix((update,)).status is FixStatus.APPLIED
    assert target.is_file()
    assert not (engine_case.root / "turbo.json").exists()
    assert engine_case.engine.check((update,)).status is CheckStatus.CLEAN
    assert engine_case.engine.fix((update,)).status is FixStatus.UNCHANGED


def test_turbo_cycle_blocks_all_writes(engine_case: EngineCase) -> None:
    target = engine_case.member / "turbo.json"
    original = '{"tasks":{"lint:deptry":{"command":["left"]}}}'
    target.write_text(original)

    def alternate(workspace: Workspace) -> None:
        member = next(iter(workspace.members))
        member.python_version = SpecifierSet(">=3.14")
        task = workspace.turbo(member).task("lint:deptry")
        task.command = ["right"] if task.command == ["left"] else ["left"]

    report = engine_case.engine.fix((alternate,))
    assert report.status is FixStatus.BLOCKED
    assert report.written == ()
    assert target.read_text() == original
    assert engine_case.member_manifest.read_text() == MEMBER


@pytest.mark.parametrize("symlink", [False, True])
def test_unchanged_turbo_input_verified(
    engine_case: EngineCase, monkeypatch: pytest.MonkeyPatch, *, symlink: bool
) -> None:
    target = engine_case.root / "turbo.json"
    target.write_text("{}")
    apply = ManifestWrites.apply

    def update(workspace: Workspace) -> None:
        assert workspace.turbo(workspace).task("unused").command is None
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.14")

    def change_before_apply(writes: ManifestWrites) -> tuple[Path, ...]:
        if symlink:
            target.unlink()
            target.symlink_to(engine_case.root / "missing.json")
        else:
            target.write_text('{"external": true}')
        return apply(writes)

    monkeypatch.setattr(ManifestWrites, "apply", change_before_apply)
    with pytest.raises(ConcurrentManifestChangeError):
        engine_case.engine.fix((update,))
    assert engine_case.member_manifest.read_text() == MEMBER


def test_turbo_concurrent_creation_cannot_be_overwritten(
    engine_case: EngineCase, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = engine_case.member / "turbo.json"
    link = os.link

    def update(workspace: Workspace) -> None:
        workspace.turbo(next(iter(workspace.members))).task("test").command = ["echo", "hello"]

    def create_before_link(source: Path, destination: Path) -> None:
        assert destination == target
        destination.write_text('{"external": true}', encoding="utf-8")
        link(source, destination)

    monkeypatch.setattr(os, "link", create_before_link)
    with pytest.raises(FixError) as caught:
        engine_case.engine.fix((update,))
    assert caught.value.written == ()
    assert target.read_text() == '{"external": true}'
    assert not tuple(target.parent.glob(".turbo.json.*.tmp"))


def test_retained_configuration_views(engine_case: EngineCase) -> None:
    package = engine_case.member_package()
    version = package.python_version
    roots = package.ruff.source_roots
    assert version is not None
    assert not list(roots)
    with MutationRecorder().activate():
        package.python_version = SpecifierSet(">=3.14")
        package.ruff.source_roots = (Path("src"),)
    assert str(version) == ">=3.14"
    assert list(roots) == [Path("src")]
    assert engine_case.member_manifest.read_text() == MEMBER


def test_source_field_views(engine_case: EngineCase) -> None:
    engine_case.member_manifest.write_text(
        MEMBER + "\n[tool.uv.sources]\nMixed_Name = { workspace = false } # source\n"
    )
    package = engine_case.member_package()
    first = package.sources[canonicalize_name("mixed-name")]
    second = package.sources[canonicalize_name("Mixed_Name")]
    assert isinstance(first.definition, DocumentTable)
    flag = first.definition.expect(("workspace",), DocumentValue)
    assert flag is not None
    recorder = MutationRecorder()
    with recorder.activate():
        first.definition.set_boolean(("workspace",), value=True)
        package.sources.use_workspace("mixed-name")
    assert second.is_workspace
    assert flag.boolean
    assert len(recorder.operations) == 1
    assert "Mixed_Name = { workspace = true } # source" in package.manifest.render().decode()


def test_layout_and_path_views(engine_case: EngineCase) -> None:
    original = (
        MEMBER + "\n[tool.uv.build-backend]\nmodule-name = [ 'module' ] # keep the representation\n"
    )
    engine_case.member_manifest.write_text(original)

    def update(workspace: Workspace) -> None:
        member = next(iter(workspace.members))
        layout = member.uv_build_layout
        tests = member.pytest.test_paths
        roots = workspace.tach.source_roots
        layout.module_names = ("module",)
        layout.module_root = "lib"
        member.pytest.test_paths = (member.directory / "tests",)
        workspace.tach.source_roots = (workspace.directory / "lib",)
        assert list(layout.module_names or ()) == ["module"]
        assert layout.module_root == "lib"
        assert list(tests) == [Path("tests")]
        assert list(roots) == [Path("lib")]

    report = engine_case.engine.check((update,))
    assert report.status is CheckStatus.CHANGES
    assert report.passes == 2
    assert all(
        operation.location.path != ("tool", "uv", "build-backend", "module-name")
        for operation in report.operations
    )
    assert engine_case.member_manifest.read_text() == original


def test_author_table_removal(engine_case: EngineCase) -> None:
    source = (
        MEMBER
        + "\n[[project.authors]] # first\nname = 'First'\n\n# sibling\n[tool.other]\nvalue = 1\n\n# second\n[[project.authors]]\nname = 'Second'\n\n# tail\n[tool.tail]\nvalue = 2\n"
    )
    engine_case.member_manifest.write_text(source)
    package = engine_case.member_package()
    first, second = package.authors
    with MutationRecorder().activate():
        del package.authors[0]
        second.name = "Retained"
        with pytest.raises(LookupError, match="removed"):
            first.name = "must not write"
        with pytest.raises(ValueError, match="name or an email"):
            second.name = None
    rendered = package.manifest.render().decode()
    assert package.authors[0].name == "Retained"
    assert "# second" in rendered
    assert "# first" not in rendered
    assert "# sibling\n[tool.other]\nvalue = 1" in rendered
    assert "# tail\n[tool.tail]\nvalue = 2" in rendered


def test_author_assignment_keeps_comments() -> None:
    source = (
        "[tool.z]\nvalue = 'z'\n[project]\nname = 'p'\n"
        "\n# identity explanation\n[[project.authors]] # author explanation\n"
        "name = 'Other' # name explanation\n"
    )
    package = Package(
        manifest=Manifest(path=Path("pyproject.toml"), original=source.encode()),
        diagnostics=Diagnostics(),
    )
    with MutationRecorder().activate():
        package.authors[0].name = "HASH"
        package.authors.inline()
        package.sort_sections(key=lambda path: path[0] != "project")
    assert package.manifest.render().decode() == (
        "[project]\nname = 'p'\n\n# identity explanation\nauthors = [\n"
        "    # author explanation\n    # name explanation\n    { name = 'HASH' },\n]\n"
        "[tool.z]\nvalue = 'z'\n"
    )


def test_partial_write(engine_case: EngineCase, monkeypatch: pytest.MonkeyPatch) -> None:

    def update(workspace: Workspace) -> None:
        workspace.python_version = SpecifierSet(">=3.15")
        next(iter(workspace.members)).python_version = SpecifierSet(">=3.15")

    engine_case.member_manifest.chmod(0o640)
    replace = Path.replace

    def fail_root(source: Path, target: Path) -> Path:
        if target == engine_case.root_manifest:
            raise OSError("disk full")
        return replace(source, target)

    monkeypatch.setattr(Path, "replace", fail_root)
    with pytest.raises(FixError) as caught:
        engine_case.engine.fix((update,))
    assert caught.value.path == engine_case.root_manifest
    assert caught.value.written == (engine_case.member_manifest,)
    assert engine_case.root_manifest.read_text() == ROOT
    assert 'requires-python = ">=3.15"' in engine_case.member_manifest.read_text()
    assert engine_case.member_manifest.stat().st_mode & 0o777 == 0o640
    assert not list(engine_case.root.rglob(".pyproject.toml.*.tmp"))


def test_array_shape_errors(engine_case: EngineCase) -> None:
    engine_case.member_manifest.write_text(
        MEMBER.replace('dependencies = ["example>=1"]', 'dependencies = "example>=1"'),
        encoding="utf-8",
    )
    manifest = Manifest.load(engine_case.member)
    with pytest.raises(ManifestError) as caught:
        manifest.document.expect(("project", "dependencies"), DocumentArray)
    assert (caught.value.path, caught.value.field) == (
        engine_case.member_manifest,
        ("project", "dependencies"),
    )
    engine_case.member_manifest.write_text(
        MEMBER.replace('dependencies = ["example>=1"]', "dependencies = [42]"),
        encoding="utf-8",
    )
    package = engine_case.member_package()
    with pytest.raises(ManifestError) as caught:
        list(package.dependencies)
    assert (caught.value.path, caught.value.field) == (
        engine_case.member_manifest,
        ("project", "dependencies"),
    )


def test_group_included_insertion(engine_case: EngineCase) -> None:
    original = (
        MEMBER
        + """
[dependency-groups]
base = ["base-lib>=1"]
"""
        + 'dev = [{ include-group = "base" }, "pytest>=8"]\n'
    )
    engine_case.member_manifest.write_text(original, encoding="utf-8")

    def update(workspace: Workspace) -> None:
        next(iter(workspace.members)).dependency_group("dev").insert(Requirement("base-lib>=3"))

    check = engine_case.engine.check((update,))
    assert check.status is CheckStatus.CHANGES, str(check)
    assert [operation.location.path for operation in check.operations] == [
        ("dependency-groups", "base", 0)
    ]
    assert engine_case.member_manifest.read_text() == original
    result = engine_case.engine.fix((update,))
    assert result.status is FixStatus.APPLIED, str(result)
    groups = tomlkit.loads(engine_case.member_manifest.read_text())["dependency-groups"]
    assert groups["base"][:] == ["base-lib>=3"]
    assert groups["dev"][0]["include-group"] == "base"
    assert groups["dev"][1] == "pytest>=8"
    assert len(groups["dev"]) == 2


@pytest.mark.parametrize(
    "definition",
    [
        "bad = [42]\n",
        'bad = [{ include-group = "missing" }]\n',
    ],
)
def test_group_entry_errors(engine_case: EngineCase, definition: str) -> None:
    engine_case.member_manifest.write_text(
        MEMBER + "\n[dependency-groups]\n" + definition, encoding="utf-8"
    )
    package = engine_case.member_package()
    with pytest.raises(ManifestError) as caught:
        package.dependency_groups.resolve("bad")
    assert caught.value.path == engine_case.member_manifest
    assert caught.value.field[:1] == ("dependency-groups",)


def test_duplicate_dependency_indices(engine_case: EngineCase) -> None:
    engine_case.member_manifest.write_text(
        MEMBER.replace(
            'dependencies = ["example>=1"]',
            'dependencies = ["example[a]>=1", "example[b]>=1"]',
        ),
        encoding="utf-8",
    )

    def update(workspace: Workspace) -> None:
        deps = next(iter(workspace.members)).dependencies
        deps.insert(Requirement("example[a]>=2"))
        deps.insert(Requirement("example[b]>=3"))

    report = engine_case.engine.check((update,))
    assert report.status is CheckStatus.CHANGES
    assert [(operation.location.path[-1], operation.after) for operation in report.operations] == [
        (0, "example[a]>=2"),
        (1, "example[b]>=3"),
    ]


def test_duplicate_declaration_warning(engine_case: EngineCase) -> None:
    engine_case.member_manifest.write_text(
        MEMBER.replace(
            'dependencies = ["example>=1"]',
            'dependencies = ["example>=1", "example>=2"]',
        ),
        encoding="utf-8",
    )

    def update(workspace: Workspace) -> None:
        next(iter(workspace.members)).dependencies.insert(Requirement("example>=3"))

    before = engine_case.member_manifest.read_bytes()
    check = engine_case.engine.check((update,))
    assert check.status is CheckStatus.CHANGES, str(check)
    assert engine_case.member_manifest.read_bytes() == before
    assert {operation.location.path[-1] for operation in check.operations} == {0, 1}
    assert any(isinstance(item, RuleWarning) for item in check.diagnostics)
    result = engine_case.engine.fix((update,))
    assert result.status is FixStatus.APPLIED, str(result)
    assert tomlkit.loads(engine_case.member_manifest.read_text())["project"]["dependencies"][:] == [
        "example>=3",
        "example>=3",
    ]


def sort_requirements(workspace: Workspace) -> None:
    for package in (workspace, *workspace.members):
        for requirements in package.requirement_lists:
            requirements.sort(key=lambda requirement: canonicalize_name(requirement.name))


@pytest.mark.parametrize("sort_first", [False, True])
def test_insertion_keeps_array_footer(engine_case: EngineCase, *, sort_first: bool) -> None:
    engine_case.root_manifest.write_text(
        ROOT.replace(
            'dependencies = ["root-dependency>=1"]',
            "dependencies = [ # ARRAY opening\n    'Zulu', # Zulu\n    'Alpha' # Alpha\n"
            "    # ARRAY closing\n]",
        ),
        encoding="utf-8",
    )

    def insert(workspace: Workspace) -> None:
        workspace.dependencies.insert(Requirement("Beta"))

    rules = (sort_requirements, insert) if sort_first else (insert, sort_requirements)
    assert engine_case.engine.fix(rules).status is FixStatus.APPLIED
    assert (
        "dependencies = [ # ARRAY opening\n    'Alpha', # Alpha\n    \"Beta\",\n"
        "    'Zulu' # Zulu\n    # ARRAY closing\n]\n"
    ) in engine_case.root_manifest.read_text()
    assert engine_case.engine.fix(rules).status is FixStatus.UNCHANGED


def test_sort_keeps_include_boundaries(engine_case: EngineCase) -> None:
    groups = """
[dependency-groups]
dev = [
    'z0', 'a0', 'z0', # first run
    { include-group = "nested" }, # include
    'z1', 'a1',
]
nested = ['nz', 'na']
"""
    engine_case.member_manifest.write_text(MEMBER + groups, encoding="utf-8")
    assert engine_case.engine.fix((sort_requirements,)).status is FixStatus.APPLIED
    # The line comment belongs to the second z0, and equal names keep their order.
    assert engine_case.member_manifest.read_text() == MEMBER + groups.replace(
        "'z0', 'a0', 'z0', # first run\n", "'a0', 'z0', 'z0', # first run\n"
    ).replace("'z1', 'a1'", "'a1', 'z1'").replace("'nz', 'na'", "'na', 'nz'")


@pytest.mark.parametrize("sort_first", [False, True])
def test_edit_after_sort(engine_case: EngineCase, *, sort_first: bool) -> None:
    engine_case.root_manifest.write_text(
        ROOT.replace(
            'dependencies = ["root-dependency>=1"]',
            "dependencies = [\n    'Zulu>=1', # Zulu\n    'Alpha>=2', # Alpha\n]",
        ),
        encoding="utf-8",
    )

    def edit_after_sort(workspace: Workspace) -> None:
        if next(iter(workspace.dependencies)).name == "Alpha":
            zulu = workspace.dependencies.get("Zulu")
            assert zulu is not None
            zulu.specifier = SpecifierSet(">=9")

    rules = (
        (sort_requirements, edit_after_sort) if sort_first else (edit_after_sort, sort_requirements)
    )
    report = engine_case.engine.fix(rules)
    assert report.status is FixStatus.APPLIED, str(report)
    # The edit sees the sorted list in the same pass, or in the next one.
    assert report.report.passes == (2 if sort_first else 3)
    assert (
        "dependencies = [\n    'Alpha>=2', # Alpha\n    'Zulu>=9', # Zulu\n]\n"
    ) in engine_case.root_manifest.read_text()


def test_build_requirements_are_live(engine_case: EngineCase) -> None:
    engine_case.member_manifest.write_text(
        MEMBER + "[build-system]\nrequires = [\n    'Z-build>=1', # Z build\n"
        "    'A-build>=1', # A build\n]\n",
        encoding="utf-8",
    )

    def update(workspace: Workspace) -> None:
        build = next(iter(workspace.members)).build_system
        assert build is not None
        assert build.requires is not None
        if build.build_backend is not None:
            return
        zulu = build.requires[0]
        build.requires.sort_by(lambda requirement: requirement.name)
        zulu.specifier = SpecifierSet(">=2")
        build.build_backend = "backend"
        workspace.build_system = build
        # Copying a table must not give two manifests the same mutable nodes.
        zulu.specifier = SpecifierSet(">=3")
        copied = workspace.build_system
        assert copied is not None
        assert copied.requires is not None
        assert copied.requires[1].specifier == SpecifierSet(">=2")
        assert build.requires[1].specifier == SpecifierSet(">=3")

    assert engine_case.engine.fix((update,)).status is FixStatus.APPLIED
    assert engine_case.member_manifest.read_text() == MEMBER + (
        "[build-system]\nrequires = [\n    'A-build>=1', # A build\n"
        "    'Z-build>=3', # Z build\n]\nbuild-backend = \"backend\"\n"
    )
    assert engine_case.engine.fix((update,)).status is FixStatus.UNCHANGED


def test_requirement_views_share_the_live_entry(engine_case: EngineCase) -> None:

    def update(workspace: Workspace) -> None:
        dependencies = next(iter(workspace.members)).dependencies
        first = next(iter(dependencies))
        second = next(iter(dependencies))
        if first.specifier != SpecifierSet(">=2"):
            second.specifier = SpecifierSet(">=3")
            assert first.specifier == SpecifierSet(">=3")
            first.specifier = SpecifierSet(">=2")
            assert second.specifier == SpecifierSet(">=2")

    report = engine_case.engine.fix((update,))
    assert report.status is FixStatus.APPLIED
    assert len(report.report.operations) == 2
    assert 'dependencies = ["example>=2"]' in engine_case.member_manifest.read_text()


def test_requirement_view_copy(engine_case: EngineCase) -> None:
    package = engine_case.member_package()
    view = next(iter(package.dependencies))
    assert isinstance(view, ManifestRequirement)
    copied = copy.deepcopy(view)
    assert type(copied) is Requirement
    assert copied == view
    copied.specifier = SpecifierSet(">=9")
    assert package.manifest.render().decode() == MEMBER


def test_requirement_view_assignment(engine_case: EngineCase) -> None:

    def normalize(workspace: Workspace) -> None:
        requirement = next(iter(next(iter(workspace.members)).dependencies))
        requirement.specifier = SpecifierSet(">=2,<3")

    report = engine_case.engine.fix((normalize,))
    assert report.status is FixStatus.APPLIED
    assert Requirement(
        tomlkit.loads(engine_case.member_manifest.read_text())["project"]["dependencies"][0]
    ).specifier == SpecifierSet(">=2,<3")


def test_requirement_view_diagnostics(engine_case: EngineCase) -> None:

    def report_from_requirement(workspace: Workspace) -> None:
        requirement = next(iter(next(iter(workspace.members)).dependencies))
        requirement.warning(UserWarning("notice"))
        requirement.error(ValueError("bad requirement"))

    result = engine_case.engine.check((report_from_requirement,))
    assert result.status is CheckStatus.BLOCKED
    assert len(result.diagnostics) == 2
    assert any(isinstance(item, RuleWarning) for item in result.diagnostics)
    assert any(isinstance(item, RuleError) for item in result.diagnostics)
    rendered = str(result)
    assert "warning in" in rendered
    assert "error in" in rendered
    assert "notice" in rendered
    assert "bad requirement" in rendered
    for item in result.diagnostics:
        assert item.location.manifest == engine_case.member_manifest
        assert item.location.path == ("project", "dependencies", 0)


def test_duplicate_name_locations(engine_case: EngineCase) -> None:
    engine_case.member_manifest.write_text(
        MEMBER.replace('name = "test-member"', 'name = "test-root"'), encoding="utf-8"
    )
    with pytest.raises(ManifestError) as caught:
        engine_case.engine.check(())
    assert caught.value.path == engine_case.member_manifest
    assert str(engine_case.root_manifest) in str(caught.value)
    assert str(engine_case.member_manifest) in str(caught.value)


def test_member_addition_uv_validation(membership_case: MembershipCase) -> None:

    def add_member(workspace: Workspace) -> None:
        if not any(member.name == "test-new" for member in workspace.members):
            workspace.members = (*workspace.members, Path("packages/new"))

    report = Engine(directory=membership_case.root).check((add_member,))
    assert report.status is CheckStatus.CHANGES, str(report)
    assert report.diagnostics == ()
    [operation] = report.operations
    assert operation.location.path == ("tool", "uv", "workspace", "members")
    assert operation.after == '["packages/member", "packages/new"]'
    assert membership_case.root_manifest.read_text() == membership_case.original


def test_new_member_same_pass(membership_case: MembershipCase) -> None:
    new_manifest = membership_case.root / "packages/new/pyproject.toml"
    original_new = new_manifest.read_bytes()

    def add_and_update(workspace: Workspace) -> None:
        if not any(member.name == "test-new" for member in workspace.members):
            workspace.members = (*workspace.members, Path("packages/new"))
        for member in workspace.members:
            if member.name == "test-new":
                member.python_version = SpecifierSet(">=3.14")

    report = Engine(directory=membership_case.root).check((add_and_update,))
    assert report.status is CheckStatus.CHANGES, str(report)
    # A new member participates as soon as the assignment returns.
    assert report.passes == 2
    assert {(item.location.manifest, item.location.path) for item in report.operations} == {
        (membership_case.root_manifest, ("tool", "uv", "workspace", "members")),
        (new_manifest, ("project", "requires-python")),
    }
    assert membership_case.root_manifest.read_text() == membership_case.original
    assert new_manifest.read_bytes() == original_new


def test_member_reordering(membership_case: MembershipCase) -> None:
    membership_case.root_manifest.write_text(
        membership_case.original.replace(
            'members = ["packages/member"]',
            'members = ["packages/member", "packages/new"]',
        ),
        encoding="utf-8",
    )

    def reverse(workspace: Workspace) -> None:
        workspace.members = tuple(reversed(tuple(workspace.members)))

    report = Engine(directory=membership_case.root).check((reverse,))
    assert report.status is CheckStatus.CLEAN, str(report)
    assert report.operations == ()


def test_invalid_member_path(membership_case: MembershipCase) -> None:

    def add_missing(workspace: Workspace) -> None:
        workspace.members = (*workspace.members, Path("packages/missing"))

    with pytest.raises(ManifestError) as caught:
        Engine(directory=membership_case.root).fix((add_missing,))
    assert caught.value.path == membership_case.root / "packages/missing/pyproject.toml"
    assert membership_case.root_manifest.read_text() == membership_case.original


def test_member_removal(removal_case: RemovalCase) -> None:
    removed_manifest = removal_case.paths[1] / "pyproject.toml"
    removed_before = removed_manifest.read_bytes()
    engine = Engine(directory=removal_case.root)
    report = engine.fix((removal_case.remove_new,))
    assert report.status is FixStatus.APPLIED
    assert report.written == (removal_case.root_manifest,)
    assert removed_manifest.read_bytes() == removed_before
    assert tuple(WorkspaceDiscovery(removal_case.root).members(removal_case.root)) == (
        removal_case.paths[0],
    )
    assert engine.check(()).status is CheckStatus.CLEAN


def test_removal_completeness_error(removal_case: RemovalCase) -> None:

    def completeness(workspace: Workspace) -> None:
        present = {member.directory for member in workspace.members}
        if any(path not in present for path in removal_case.paths):
            workspace.error(ValueError("physical member missing"))

    before = {path: (path / "pyproject.toml").read_bytes() for path in removal_case.paths}
    engine = Engine(directory=removal_case.root)
    check = engine.check((removal_case.remove_new, completeness))
    assert check.status is CheckStatus.BLOCKED
    assert check.diagnostics
    fixed = engine.fix((removal_case.remove_new, completeness))
    assert fixed.status is FixStatus.BLOCKED
    assert fixed.written == ()
    assert removal_case.root_manifest.read_text() == removal_case.original
    assert {path: (path / "pyproject.toml").read_bytes() for path in removal_case.paths} == before


@pytest.mark.parametrize("remove_first", [True, False])
def test_opposing_membership(removal_case: RemovalCase, *, remove_first: bool) -> None:

    def restore_all(workspace: Workspace) -> None:
        workspace.members = removal_case.paths

    rules = (
        (removal_case.remove_new, restore_all)
        if remove_first
        else (restore_all, removal_case.remove_new)
    )
    engine = Engine(directory=removal_case.root)
    report = engine.fix(rules)
    assert report.status is FixStatus.BLOCKED, str(report)
    assert report.written == ()
    assert removal_case.root_manifest.read_text() == removal_case.original
    assert tuple(WorkspaceDiscovery(removal_case.root).members(removal_case.root)) == (
        removal_case.paths
    )
