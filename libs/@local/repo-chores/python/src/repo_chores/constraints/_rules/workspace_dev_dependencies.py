from repo_chores.constraints._engine import Workspace


def enforce_workspace_dev_dependencies(workspace: Workspace) -> None:
    groups = workspace.dependency_groups
    if "dev" not in groups.dependency_groups:
        workspace.error(exception=ValueError("No dev dependency group defined"))
        return

    required = groups.resolve("dev")
    for member in workspace.members:
        group = member.dependency_group(group="dev")

        for requirement in required:
            group.insert(requirement=requirement)
