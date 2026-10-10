"""Workspace-wide manifest policies and their registration order."""

from collections.abc import Callable

from repo_chores.constraints._engine import Workspace
from repo_chores.constraints._rules.authors import enforce_authors
from repo_chores.constraints._rules.build_layout import enforce_build_layout
from repo_chores.constraints._rules.build_system import enforce_build_system
from repo_chores.constraints._rules.dependency_semver_versions import (
    enforce_dependency_semver_versions,
)
from repo_chores.constraints._rules.license import enforce_license
from repo_chores.constraints._rules.manifest_style import enforce_manifest_style
from repo_chores.constraints._rules.pinned_dependencies import enforce_pinned_dependencies
from repo_chores.constraints._rules.pytest_paths import enforce_pytest_paths
from repo_chores.constraints._rules.python_version import enforce_python_version
from repo_chores.constraints._rules.ruff import enforce_ruff_configuration
from repo_chores.constraints._rules.ruff_source_roots import enforce_ruff_source_roots
from repo_chores.constraints._rules.tach_paths import enforce_tach_paths
from repo_chores.constraints._rules.turbo_task import enforce_turbo_task
from repo_chores.constraints._rules.workspace_dev_dependencies import (
    enforce_workspace_dev_dependencies,
)
from repo_chores.constraints._rules.workspace_sources import enforce_workspace_sources

CONSTRAINTS: list[Callable[[Workspace], None]] = []


def rule(rule_fn: Callable[[Workspace], None]) -> Callable[[Workspace], None]:
    CONSTRAINTS.append(rule_fn)
    return rule_fn


enforce_python_version = rule(enforce_python_version)
enforce_pytest_paths = rule(enforce_pytest_paths)
enforce_ruff_source_roots = rule(enforce_ruff_source_roots)
enforce_tach_paths = rule(enforce_tach_paths)
enforce_dependency_semver_versions = rule(enforce_dependency_semver_versions)
enforce_license = rule(enforce_license)
enforce_authors = rule(enforce_authors)
enforce_build_system = rule(enforce_build_system)
enforce_manifest_style = rule(enforce_manifest_style)
enforce_ruff_configuration = rule(enforce_ruff_configuration)
enforce_build_layout = rule(enforce_build_layout)
enforce_workspace_sources = rule(enforce_workspace_sources)
enforce_pinned_dependency_versions = rule(enforce_pinned_dependencies)
enforce_workspace_dev_dependencies = rule(enforce_workspace_dev_dependencies)
enforce_turbo_task = rule(enforce_turbo_task)
