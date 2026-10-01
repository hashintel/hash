"""Keep Python checks as native member tasks."""

from repo_chores.constraints._engine import Package, Workspace

_PREFIX = ("uv", "run", "--active", "--frozen", "--all-packages", "deptry")


def _command(package: Package) -> list[str]:
    root = package.module_root()
    paths = [root]
    scripts = package.directory / "scripts"
    if scripts.is_dir() and not scripts.is_relative_to(root):
        paths.append(scripts)

    command = [*_PREFIX]
    for path in paths:
        relative = path.relative_to(package.directory).as_posix()
        command.append("./" + relative if relative.startswith("-") else relative)

    return command


def enforce_turbo_task(workspace: Workspace) -> None:
    for package in workspace.members:
        try:
            workspace.turbo(package).task("lint:deptry").command = _command(package)
            workspace.turbo(workspace).task(f"{package.name}#lint:deptry").command = None
        except ValueError as error:
            package.error(error)

        workspace.turbo(package).task("test:unit").depends_on = ["test"]
