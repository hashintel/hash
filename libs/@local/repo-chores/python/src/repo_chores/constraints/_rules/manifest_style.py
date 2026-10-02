"""Repository policy for manifest presentation. The engine supplies the mechanics."""

from itertools import chain

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

from repo_chores.constraints._engine import Workspace


def _rank(path: tuple[str, ...]) -> tuple[int, str, tuple[str, ...]]:
    first = path[0]
    if first == "project":
        return 0, "", path

    if first == "build-system":
        return 1, "", path

    if first == "dependency-groups":
        return 2, "", path

    if first == "tool":
        return (
            3 if len(path) == 1 or path[1] == "uv" else 4,
            path[1] if len(path) > 1 else "",
            path,
        )

    return 5, first, path


def _requirement_name(requirement: Requirement) -> str:
    return canonicalize_name(requirement.name)


def enforce_manifest_style(workspace: Workspace) -> None:
    for package in chain((workspace,), workspace.members):
        # Converting authors can introduce the [project] header that sections then rank.
        package.inline_authors()
        package.sort_sections(key=_rank)
        for requirements in package.requirement_lists:
            requirements.sort(key=_requirement_name)
