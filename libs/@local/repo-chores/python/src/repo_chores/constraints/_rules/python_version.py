from repo_chores.constraints._engine import Workspace


def enforce_python_version(workspace: Workspace) -> None:
    python_version = workspace.python_version
    if python_version is None:
        workspace.error(exception=ValueError("The workspace must set a python version"))
        return

    for member in workspace.members:
        member.python_version = python_version
