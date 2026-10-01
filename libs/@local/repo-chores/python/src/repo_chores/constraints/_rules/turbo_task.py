"""Keep Python checks as native member tasks."""

from repo_chores.constraints._engine import Package, Workspace

_PREFIX = ("uv", "run", "--active", "--frozen", "--all-packages")


def _deptry_command(package: Package) -> list[str]:
    root = package.module_root()
    paths = [root]
    scripts = package.directory / "scripts"
    if scripts.is_dir() and not scripts.is_relative_to(root):
        paths.append(scripts)

    command = [*_PREFIX, "deptry"]
    for path in paths:
        relative = path.relative_to(package.directory).as_posix()
        command.append("./" + relative if relative.startswith("-") else relative)

    return command


def enforce_turbo_task(workspace: Workspace) -> None:
    for package in workspace.members:
        try:
            commands = {
                "lint:deptry": _deptry_command(package),
                "lint:tach": [*_PREFIX, "tach", "check"],
                # An explicit member-relative path overrides workspace-wide testpaths.
                "test:unit": [*_PREFIX, "pytest", "."],
            }

            for name, command in commands.items():
                workspace.turbo(package).task(name).command = command
                workspace.turbo(workspace).task(f"{package.name}#{name}").command = None
        except ValueError as error:
            package.error(error)
