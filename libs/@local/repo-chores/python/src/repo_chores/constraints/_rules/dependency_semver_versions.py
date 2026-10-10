from itertools import chain

from packaging.utils import canonicalize_name

from repo_chores.constraints._engine import Workspace
from repo_chores.constraints.version_ranges import bounded_range


def enforce_dependency_semver_versions(workspace: Workspace) -> None:
    internal = {package.name for package in chain((workspace,), workspace.members)}
    for member in workspace.members:
        for requirement in member.dependencies:
            if (
                not requirement.specifier
                and requirement.url is None
                and canonicalize_name(requirement.name) in internal
            ):
                continue

            if (semver := bounded_range(requirement.specifier)) is not None:
                requirement.specifier = semver
            else:
                requirement.error(
                    exception=ValueError(f"Unsupported specifier: {requirement.specifier}")
                )
