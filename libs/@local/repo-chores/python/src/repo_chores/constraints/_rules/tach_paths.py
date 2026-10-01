from pathlib import Path

from repo_chores.constraints._engine import Workspace


def enforce_tach_paths(workspace: Workspace) -> None:
    roots = workspace.member_module_roots()
    modules: list[Path] = []

    for member in workspace.members:
        build = member.build_system
        if member.is_package and build is not None and build.build_backend == "uv_build":
            layout = member.uv_build_layout
            modules.extend(
                layout.module_directory(project=member.directory, name=name)
                for name in layout.names(member.name)
            )

    excluded: set[Path] = set()
    for member in workspace.members:
        for name in ("tests", "scripts"):
            path = member.directory / name
            if (
                path.is_dir()
                and any(path.is_relative_to(root) for root in roots)
                and not any(module.is_relative_to(path) for module in modules)
            ):
                excluded.add(path)

    workspace.tach.source_roots = roots
    workspace.tach.excluded_paths = sorted(excluded)
