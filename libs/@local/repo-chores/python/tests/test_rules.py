import subprocess  # ruff: ignore[suspicious-subprocess-import] - Exercise the pinned deptry CLI without a shell.
import sys
from pathlib import Path

import pytest
from packaging.specifiers import SpecifierSet
from packaging.utils import canonicalize_name

from repo_chores.constraints._engine import CheckStatus, Engine, FixStatus, Package, Workspace
from repo_chores.constraints._engine.diagnostics import Diagnostics, RuleError, RuleWarning
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.workspace import WorkspaceInputs
from repo_chores.constraints.rules import (
    enforce_build_layout,
    enforce_dependency_semver_versions,
    enforce_manifest_style,
    enforce_pinned_dependency_versions,
    enforce_pytest_paths,
    enforce_turbo_task,
    enforce_workspace_dev_dependencies,
    enforce_workspace_sources,
)


@pytest.fixture
def workspace_directory(tmp_path: Path) -> Path:
    root = tmp_path.resolve()
    (root / "pyproject.toml").write_text(
        '[project]\nname = "test-root"\nversion = "0.1.0"\nrequires-python = ">=3.14"\n'
        '[tool.uv.workspace]\nmembers = ["packages/member"]\n'
    )
    member = root / "packages/member"
    member.mkdir(parents=True)
    (member / "pyproject.toml").write_text(
        '[project]\nname = "test-member"\nversion = "0.1.0"\nrequires-python = ">=3.14"\n'
    )
    return root


def package(directory: Path) -> Package:
    return Package(manifest=Manifest.load(directory), diagnostics=Diagnostics())


def test_dependency_policies_compose(workspace_directory: Path) -> None:
    root = workspace_directory / "pyproject.toml"
    member = workspace_directory / "packages/member/pyproject.toml"
    root.write_text(
        root.read_text()
        + """[dependency-groups]
dev = ["example>=1.2"]
[tool.uv]
constraint-dependencies = ["example[global]>=1.4,<1.8; python_version >= '3.14'"]
"""
    )
    member.write_text(
        member.read_text()
        + """dependencies = [
    "test-root @ https://example.invalid/root.whl", # internal
    "example[fast]>=1.5,!=1.6,<1.9; python_version >= '3.14'", # runtime
]
[dependency-groups]
base = ["example>=1.3"] # inherited dev requirement
dev = [{ include-group = "base" }]
[tool.uv.sources]
test-root = { path = "../wrong" }
"""
    )
    original = {path: path.read_bytes() for path in (root, member)}
    rules = (
        enforce_workspace_sources,
        enforce_dependency_semver_versions,
        enforce_pinned_dependency_versions,
        enforce_workspace_dev_dependencies,
        enforce_manifest_style,
    )
    engine = Engine(directory=workspace_directory)
    check = engine.check(rules)
    assert check.status is CheckStatus.CHANGES, str(check)
    assert {path: path.read_bytes() for path in original} == original
    assert engine.fix(rules).status is FixStatus.APPLIED
    assert any(isinstance(item, RuleWarning) for item in check.diagnostics)

    repaired = package(member.parent)
    dependency = repaired.dependencies.get("example")
    assert dependency is not None
    assert dependency.specifier == SpecifierSet(">=1.5,<1.8,!=1.6")
    assert dependency.extras == {"fast"}
    assert str(dependency.marker) == 'python_version >= "3.14"'
    [baseline] = repaired.dependency_groups.resolve("dev")
    assert baseline.specifier == dependency.specifier
    assert baseline.extras == set()
    assert baseline.marker is None
    assert list(repaired.dependency_group("dev")) == []
    internal = repaired.dependencies.get("test-root")
    assert internal is not None
    assert internal.url is None
    assert not internal.specifier
    assert repaired.sources[canonicalize_name("test-root")].is_workspace
    assert '# runtime\n    "test-root", # internal' in member.read_text()
    assert 'dev = [{ include-group = "base" }]' in member.read_text()
    workspace = Workspace(inputs=WorkspaceInputs.load(root.parent), diagnostics=Diagnostics())
    [constraint] = workspace.dependency_constraints
    assert constraint.specifier == dependency.specifier
    assert constraint.extras == set()
    assert constraint.marker is None
    assert engine.check(rules).status is CheckStatus.CLEAN
    assert engine.fix(rules).status is FixStatus.UNCHANGED


def test_incompatible_pins_block_writes(workspace_directory: Path) -> None:
    root = workspace_directory / "pyproject.toml"
    member = workspace_directory / "packages/member/pyproject.toml"
    root.write_text(root.read_text() + '[tool.uv]\nconstraint-dependencies = ["example>=2,<2.1"]\n')
    member.write_text(member.read_text() + 'dependencies = ["example>=2,!=2.0.*,<3"]\n')
    original = {path: path.read_bytes() for path in (root, member)}
    result = Engine(directory=workspace_directory).fix((
        enforce_manifest_style,
        enforce_pinned_dependency_versions,
    ))
    assert result.status is FixStatus.BLOCKED
    assert result.written == ()
    errors = [item for item in result.report.diagnostics if isinstance(item, RuleError)]
    assert {item.location.manifest for item in errors} == {root, member}
    assert all("Incompatible ranges" in str(item.error) for item in errors)
    assert {path: path.read_bytes() for path in original} == original


@pytest.mark.parametrize("layout_first", [False, True])
def test_layout_repairs_feed_derived_paths(
    workspace_directory: Path, *, layout_first: bool
) -> None:
    member = workspace_directory / "packages/member"
    manifest = member / "pyproject.toml"
    manifest.write_text(
        manifest.read_text()
        + '[build-system]\nbuild-backend = "uv_build"\nrequires = ["uv_build>=0.12"]\n'
        + '[tool.uv.build-backend]\nmodule-root = "missing"\n'
    )
    (member / "actual").mkdir()
    (member / "actual/__init__.py").touch()
    (member / "tests").mkdir()
    rules = (
        (enforce_build_layout, enforce_pytest_paths, enforce_turbo_task)
        if layout_first
        else (enforce_turbo_task, enforce_pytest_paths, enforce_build_layout)
    )
    engine = Engine(directory=workspace_directory)
    result = engine.fix(rules)
    assert result.status is FixStatus.APPLIED, str(result)
    assert result.report.passes == (2 if layout_first else 3)
    layout = package(member).uv_build_layout
    assert not layout.module_root
    assert list(layout.module_names or ()) == ["actual"]
    config = package(workspace_directory).pytest
    assert list(config.python_paths) == [Path("packages/member")]
    assert list(config.test_paths) == [Path("packages/member/tests")]
    inputs = WorkspaceInputs.load(workspace_directory)
    command = inputs.turbo(member).task("lint:deptry").command
    assert command is not None
    assert command[6] == "actual"
    assert "tests" not in command
    assert engine.fix(rules).status is FixStatus.UNCHANGED


@pytest.fixture
def deptry_workspace(workspace_directory: Path) -> Path:
    root = workspace_directory
    member = root / "packages/member"
    manifest = member / "pyproject.toml"
    manifest.write_text(
        manifest.read_text()
        + """dependencies = ["library-python"]
[build-system]
build-backend = "uv_build"
requires = ["uv_build>=0.12"]
[tool.uv.build-backend]
module-root = ""
module-name = "service"
[tool.pytest.ini_options]
testpaths = ["service/checks", "tests"]
[tool.deptry]
known_first_party = ["custom_local"]
extend_exclude = ["generated"]
package_module_name_map = { external = ["external_a", "external_b"], library_python = "stale" }
"""
    )
    library = root / "packages/library"
    library.mkdir()
    (library / "pyproject.toml").write_text("""[project]
name = "library-python"
version = "0.1.0"
[build-system]
build-backend = "uv_build"
requires = ["uv_build>=0.12"]
[tool.uv.build-backend]
module-name = ["namespace.child", "second"]
""")
    for directory in (
        member / "service",
        member / "scripts",
        library / "src/namespace/child",
        library / "src/second",
    ):
        directory.mkdir(parents=True)
        (directory / "__init__.py").touch()
    root_turbo = root / "turbo.json"
    root_turbo.write_text("""{"tasks": {
  "test-member#lint:deptry": {"command": "old", "cache": false},
  "departed#lint:deptry": {"command": "keep"}
}}
""")

    return root


@pytest.mark.parametrize("membership_first", [False, True])
def test_deptry_tracks_members_layouts_and_config(
    deptry_workspace: Path, *, membership_first: bool
) -> None:
    root = deptry_workspace
    member = root / "packages/member"
    manifest = member / "pyproject.toml"
    library = root / "packages/library"
    root_turbo = root / "turbo.json"

    def add_library(workspace: Workspace) -> None:
        if not any(package.name == "library-python" for package in workspace.members):
            workspace.members = (*workspace.members, Path("packages/library"))

    rules = (
        (add_library, enforce_turbo_task) if membership_first else (enforce_turbo_task, add_library)
    )
    engine = Engine(directory=root)
    original = {path: path.read_bytes() for path in (manifest, root / "pyproject.toml", root_turbo)}
    assert engine.check(rules).status is CheckStatus.CHANGES
    assert not (member / "turbo.json").exists()
    assert {path: path.read_bytes() for path in original} == original
    fixed = engine.fix(rules)
    assert fixed.status is FixStatus.APPLIED, str(fixed)
    inputs = WorkspaceInputs.load(root)
    command = inputs.turbo(member).task("lint:deptry").command
    assert command is not None
    assert command[6:8] == ["service", "scripts"]
    assert "custom_local" in command
    assert "generated" in command
    assert r"(^|[/\\])service[/\\]checks([/\\]|$)" in command
    assert "external=external_a|external_b,library-python=namespace|second" in command
    assert '"cache": false' in root_turbo.read_text()
    assert '"departed#lint:deptry": {"command": "keep"}' in root_turbo.read_text()
    assert inputs.turbo(root).task("test-member#lint:deptry").command is None
    assert engine.check(rules).status is CheckStatus.CLEAN
    assert engine.fix(rules).status is FixStatus.UNCHANGED

    # Physical script removal and a dependency layout change invalidate old argv.
    (member / "scripts/__init__.py").unlink()
    (member / "scripts").rmdir()
    library_manifest = library / "pyproject.toml"
    library_manifest.write_text(
        library_manifest.read_text().replace('["namespace.child", "second"]', '"second"')
    )
    assert engine.fix(rules).status is FixStatus.APPLIED
    changed = WorkspaceInputs.load(root).turbo(member).task("lint:deptry").command
    assert changed is not None
    assert "scripts" not in changed
    assert "external=external_a|external_b,library-python=second" in changed
    assert engine.check(rules).status is CheckStatus.CLEAN

    # Omitting a default-name alias would let the stale TOML setting take effect.
    default_module = library / "src/library_python"
    default_module.mkdir()
    (default_module / "__init__.py").touch()
    library_manifest.write_text(
        library_manifest.read_text().replace('"second"', '"library_python"')
    )
    manifest.write_text(
        manifest.read_text().replace('external = ["external_a", "external_b"], ', "")
    )
    assert engine.fix(rules).status is FixStatus.APPLIED
    command = WorkspaceInputs.load(root).turbo(member).task("lint:deptry").command
    assert command is not None
    assert command[-1] == "library-python=library_python"
    assert engine.fix(rules).status is FixStatus.UNCHANGED


def test_deptry_exclusions_have_a_firing_control(workspace_directory: Path) -> None:
    member = workspace_directory / "packages/member"
    manifest = member / "pyproject.toml"
    manifest.write_text(
        manifest.read_text()
        + """dependencies = []
[build-system]
build-backend = "uv_build"
requires = ["uv_build>=0.12"]
[tool.uv.build-backend]
module-name = "service"
[tool.pytest.ini_options]
testpaths = ["src/service/qa+cases"]
[tool.deptry]
exclude = []
extend_exclude = [".*/generated/"]
"""
    )
    source = member / "src/service"
    source.mkdir(parents=True)
    (source / "__init__.py").write_text("import os\n")
    for path in ("tests/ignore.py", "qa+cases/ignore.py", "generated/ignore.py"):
        excluded = source / path
        excluded.parent.mkdir()
        excluded.write_text("import excluded_missing_dependency\n")
    engine = Engine(directory=workspace_directory)
    assert engine.fix((enforce_turbo_task,)).status is FixStatus.APPLIED
    command = WorkspaceInputs.load(workspace_directory).turbo(member).task("lint:deptry").command
    assert command is not None
    argv = [sys.executable, "-m", "deptry", *command[6:]]
    clean = subprocess.run(argv, cwd=member, check=False, capture_output=True, text=True)
    assert clean.returncode == 0, clean.stderr
    (source / "production.py").write_text("import included_missing_dependency\n")
    failing = subprocess.run(argv, cwd=member, check=False, capture_output=True, text=True)
    assert failing.returncode == 1
    assert "DEP001" in failing.stderr
    assert "included_missing_dependency" in failing.stderr
    assert "excluded_missing_dependency" not in failing.stderr


@pytest.mark.parametrize("problem", ["backend", "missing", "test-root", "outside"])
def test_deptry_undecidable_layout_blocks_all_files(
    workspace_directory: Path, problem: str
) -> None:
    member = workspace_directory / "packages/member"
    source = member / "service"
    source.mkdir()
    (source / "__init__.py").touch()
    manifest = member / "pyproject.toml"
    settings = """[build-system]
build-backend = "uv_build"
requires = ["uv_build>=0.12"]
[tool.uv.build-backend]
module-root = ""
module-name = "service"
"""
    match problem:
        case "backend":
            settings = settings.replace('"uv_build"', '"other_backend"')
        case "missing":
            settings = settings.replace('"service"', '"missing"')
        case "test-root":
            settings += '[tool.pytest.ini_options]\ntestpaths = ["service"]\n'
        case "outside":
            settings = settings.replace('module-root = ""', 'module-root = "../../.."')
    manifest.write_text(manifest.read_text() + settings)
    original = manifest.read_bytes()
    report = Engine(directory=workspace_directory).fix((
        enforce_manifest_style,
        enforce_turbo_task,
    ))
    assert report.status is FixStatus.BLOCKED
    assert report.written == ()
    assert manifest.read_bytes() == original
    assert not (member / "turbo.json").exists()
