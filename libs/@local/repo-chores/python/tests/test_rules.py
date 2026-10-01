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
    assert baseline.extras == set() and baseline.marker is None
    assert list(repaired.dependency_group("dev")) == []
    internal = repaired.dependencies.get("test-root")
    assert internal is not None and internal.url is None and not internal.specifier
    assert repaired.sources[canonicalize_name("test-root")].is_workspace
    assert '# runtime\n    "test-root", # internal' in member.read_text()
    assert 'dev = [{ include-group = "base" }]' in member.read_text()
    workspace = Workspace(inputs=WorkspaceInputs.load(root.parent), diagnostics=Diagnostics())
    [constraint] = workspace.dependency_constraints
    assert constraint.specifier == dependency.specifier
    assert constraint.extras == set() and constraint.marker is None
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
        (enforce_build_layout, enforce_pytest_paths)
        if layout_first
        else (enforce_pytest_paths, enforce_build_layout)
    )
    engine = Engine(directory=workspace_directory)
    result = engine.fix(rules)
    assert result.status is FixStatus.APPLIED, str(result)
    assert result.report.passes == (2 if layout_first else 3)
    layout = package(member).uv_build_layout
    assert layout.module_root == ""
    assert list(layout.module_names or ()) == ["actual"]
    config = package(workspace_directory).pytest
    assert list(config.python_paths) == [Path("packages/member")]
    assert list(config.test_paths) == [Path("packages/member/tests")]
    assert engine.fix(rules).status is FixStatus.UNCHANGED
