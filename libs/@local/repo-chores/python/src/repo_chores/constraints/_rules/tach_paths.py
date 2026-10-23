from pathlib import Path

from repo_chores.constraints._engine import Workspace


def enforce_tach_paths(workspace: Workspace) -> None:
    for member in workspace.members:
        root = member.module_root()
        modules: list[Path] = []

        build = member.build_system
        if member.is_package and build is not None and build.build_backend == "uv_build":
            layout = member.uv_build_layout
            modules = [
                layout.module_directory(project=member.directory, name=name)
                for name in layout.names(member.name)
            ]

        excluded = []
        for name in ("tests", "scripts"):
            path = member.directory / name
            if (
                path.is_dir()
                and path.is_relative_to(root)
                and not any(module.is_relative_to(path) for module in modules)
            ):
                excluded.append(path)

        member.tach.source_roots = [root]
        member.tach.excluded_paths = sorted(excluded)
