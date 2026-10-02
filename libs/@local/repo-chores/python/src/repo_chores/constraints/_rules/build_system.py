from repo_chores.constraints._engine import Workspace


def enforce_build_system(workspace: Workspace) -> None:
    build_system = workspace.build_system
    if build_system is None or build_system.requires is None or build_system.build_backend is None:
        workspace.error(
            ValueError(
                "The workspace must declare build-system.requires and build-system.build-backend"
            )
        )
        return

    for member in workspace.members:
        member.build_system = build_system
