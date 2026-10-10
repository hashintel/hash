import shutil
import subprocess  # ruff: ignore[suspicious-subprocess-import] - Exercise check tools without a shell.
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
    enforce_tach_paths,
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
def test_layout_path_convergence(workspace_directory: Path, *, layout_first: bool) -> None:
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
        (enforce_build_layout, enforce_pytest_paths, enforce_tach_paths, enforce_turbo_task)
        if layout_first
        else (enforce_turbo_task, enforce_tach_paths, enforce_pytest_paths, enforce_build_layout)
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
    assert list(package(member).tach.source_roots) == [Path()]
    assert list(package(member).tach.excluded_paths) == [Path("tests")]
    assert "[tool.tach]" not in (workspace_directory / "pyproject.toml").read_text()
    inputs = WorkspaceInputs.load(workspace_directory)
    command = inputs.turbo(member).task("lint:deptry").command
    assert command is not None
    assert command[6:] == ["."]
    assert engine.fix(rules).status is FixStatus.UNCHANGED


@pytest.fixture
def deptry_workspace(workspace_directory: Path) -> Path:
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
[tool.deptry]
known_first_party = ["custom_local"]
extend_exclude = ["^src/service/tests/", ".*/qa\\\\+cases/", ".*/generated/"]
[tool.deptry.package_module_name_map]
external = ["external_a", "external_b"] # native mapping
"""
    )
    source = member / "src/service"
    source.mkdir(parents=True)
    (source / "__init__.py").write_text("import os\n")
    (member / "scripts").mkdir()
    (workspace_directory / "turbo.json").write_text("""{"tasks": {
  "test-member#lint:deptry": {"command": "old", "cache": false},
  "departed#lint:deptry": {"command": "keep"}
}}
""")
    return workspace_directory


@pytest.mark.parametrize("root", ["src", ""])
@pytest.mark.parametrize("existing_task", [False, True])
def test_deptry_task_source_roots(
    deptry_workspace: Path, root: str, *, existing_task: bool
) -> None:
    member = deptry_workspace / "packages/member"
    manifest = member / "pyproject.toml"
    manifest.write_text(
        manifest.read_text().replace('module-name = "service"', f'module-root = "{root}"')
    )
    member_turbo = member / "turbo.json"
    if existing_task:
        member_turbo.write_text(
            '{"extends":["//"],"tasks":{"lint:deptry":{"command":"old","cache":false}}}\n'
        )
    root_turbo = deptry_workspace / "turbo.json"
    original = {path: path.read_bytes() for path in (manifest, root_turbo)}
    engine = Engine(directory=deptry_workspace)
    rules = (enforce_turbo_task,)
    assert engine.check(rules).status is CheckStatus.CHANGES
    assert {path: path.read_bytes() for path in original} == original
    assert member_turbo.exists() is existing_task
    assert engine.fix(rules).status is FixStatus.APPLIED
    inputs = WorkspaceInputs.load(deptry_workspace)
    command = inputs.turbo(member).task("lint:deptry").command
    assert command == [
        "uv",
        "run",
        "--active",
        "--frozen",
        "--all-packages",
        "deptry",
        *(["src", "scripts"] if root else ["."]),
    ]
    assert manifest.read_bytes() == original[manifest]
    if existing_task:
        assert '"cache":false' in member_turbo.read_text()
    assert '"cache": false' in root_turbo.read_text()
    assert '"departed#lint:deptry": {"command": "keep"}' in root_turbo.read_text()
    assert inputs.turbo(deptry_workspace).task("test-member#lint:deptry").command is None
    assert engine.check(rules).status is CheckStatus.CLEAN
    assert engine.fix(rules).status is FixStatus.UNCHANGED

    (member / "scripts").rmdir()
    assert engine.fix(rules).status is (FixStatus.APPLIED if root else FixStatus.UNCHANGED)
    command = WorkspaceInputs.load(deptry_workspace).turbo(member).task("lint:deptry").command
    assert command is not None
    assert command[6:] == [root or "."]
    assert engine.fix(rules).status is FixStatus.UNCHANGED


@pytest.mark.parametrize("production_root", ["src/service", "scripts"])
def test_deptry_native_config_firing_control(deptry_workspace: Path, production_root: str) -> None:
    copied = deptry_workspace.with_name(deptry_workspace.name + "-copy")
    shutil.copytree(deptry_workspace, copied)
    member = copied / "packages/member"
    source = member / "src/service"
    for path in ("tests/ignore.py", "qa+cases/ignore.py", "generated/ignore.py"):
        excluded = source / path
        excluded.parent.mkdir()
        excluded.write_text("import excluded_missing_dependency\n")
    engine = Engine(directory=copied)
    assert engine.fix((enforce_turbo_task,)).status is FixStatus.APPLIED
    command = WorkspaceInputs.load(copied).turbo(member).task("lint:deptry").command
    assert command is not None
    argv = [sys.executable, "-m", "deptry", *command[6:]]
    clean = subprocess.run(argv, cwd=member, check=False, capture_output=True, text=True)
    assert clean.returncode == 0, clean.stderr
    (member / production_root / "production.py").write_text("import included_missing_dependency\n")
    failing = subprocess.run(argv, cwd=member, check=False, capture_output=True, text=True)
    assert failing.returncode == 1
    assert "DEP001" in failing.stderr
    assert "included_missing_dependency" in failing.stderr
    assert "excluded_missing_dependency" not in failing.stderr


@pytest.mark.parametrize(
    ("root", "module", "excluded"),
    [
        ("src", "service", []),
        ("", "service", ["scripts", "tests"]),
        ("", "scripts", ["tests"]),
        ("", "tests", ["scripts"]),
    ],
)
def test_member_tach_production_exclusions(
    workspace_directory: Path, root: str, module: str, *, excluded: list[str]
) -> None:
    member = workspace_directory / "packages/member"
    manifest = member / "pyproject.toml"
    manifest.write_text(
        manifest.read_text()
        + '[build-system]\nbuild-backend = "uv_build"\nrequires = ["uv_build>=0.12"]\n'
        + f'[tool.uv.build-backend]\nmodule-root = "{root}"\nmodule-name = "{module}"\n'
        + '[tool.tach]\nsource_roots = ["stale"]\nexclude = ["stale/"]\nexact = true # strict\n'
    )
    source = member / root / module
    source.mkdir(parents=True)
    (source / "__init__.py").touch()
    for name in ("tests", "scripts"):
        (member / name).mkdir(exist_ok=True)
    original = manifest.read_bytes()
    engine = Engine(directory=workspace_directory)
    rules = (enforce_tach_paths,)
    assert engine.check(rules).status is CheckStatus.CHANGES
    assert manifest.read_bytes() == original
    assert engine.fix(rules).status is FixStatus.APPLIED
    view = package(member).tach
    assert list(view.source_roots) == [Path(root or ".")]
    assert list(view.excluded_paths) == [Path(path) for path in excluded]
    assert "exact = true # strict" in manifest.read_text()
    assert engine.check(rules).status is CheckStatus.CLEAN
    assert engine.fix(rules).status is FixStatus.UNCHANGED


def test_tach_paths_new_member(workspace_directory: Path) -> None:
    new = workspace_directory / "packages/new"
    new.mkdir()
    (new / "pyproject.toml").write_text('[project]\nname = "new-member"\nversion = "0.1.0"\n')
    (new / "src").mkdir()

    def add_member(workspace: Workspace) -> None:
        workspace.members = [Path("packages/member"), Path("packages/new")]

    engine = Engine(directory=workspace_directory)
    rules = (enforce_tach_paths, add_member)
    result = engine.fix(rules)
    assert result.status is FixStatus.APPLIED, str(result)
    assert result.report.passes == 3
    assert list(package(new).tach.source_roots) == [Path("src")]
    assert list(package(workspace_directory / "packages/member").tach.source_roots) == [Path()]
    assert "[tool.tach]" not in (workspace_directory / "pyproject.toml").read_text()
    assert engine.check(rules).status is CheckStatus.CLEAN
    assert engine.fix(rules).status is FixStatus.UNCHANGED
