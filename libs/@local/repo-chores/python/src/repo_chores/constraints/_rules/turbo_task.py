"""Keep Python checks as native member tasks."""

from repo_chores.constraints._engine import Package, Workspace

_PREFIX = ("uv", "run", "--active", "--frozen", "--all-packages")
_TEST_ENV = (
    "$TURBO_EXTENDS$",
    "PYTHONHOME",
    "PYTHONPATH",
    "UV_BUILD_CONSTRAINT",
    "UV_COMPILE_BYTECODE",
    "UV_CONFIG_FILE",
    "UV_CONSTRAINT",
    "UV_ENV_FILE",
    "UV_EXCLUDE",
    "UV_FORK_STRATEGY",
    "UV_GIT_LFS",
    "UV_ISOLATED",
    "UV_LINK_MODE",
    "UV_NO_BINARY",
    "UV_NO_BINARY_PACKAGE",
    "UV_NO_BUILD",
    "UV_NO_BUILD_ISOLATION",
    "UV_NO_BUILD_ISOLATION_PACKAGE",
    "UV_NO_BUILD_PACKAGE",
    "UV_NO_CONFIG",
    "UV_NO_DEFAULT_GROUPS",
    "UV_NO_DEV",
    "UV_NO_EDITABLE",
    "UV_NO_ENV_FILE",
    "UV_NO_GROUP",
    "UV_NO_PROJECT",
    "UV_NO_SOURCES",
    "UV_NO_SOURCES_PACKAGE",
    "UV_NO_SYNC",
    "UV_NO_SYSTEM_CONFIG",
    "UV_OFFLINE",
    "UV_OVERRIDE",
    "UV_PROJECT",
    "UV_PROJECT_ENVIRONMENT",
    "UV_WORKING_DIR",
    "VIRTUAL_ENV",
)
_TEST_PASS_THROUGH_ENV = (
    "$TURBO_EXTENDS$",
    "PIP_EXTRA_INDEX_URL",
    "PIP_INDEX_URL",
    "UV_CACHE_DIR",
    "UV_DEFAULT_INDEX",
    "UV_EXCLUDE_NEWER",
    "UV_EXTRA_INDEX_URL",
    "UV_FIND_LINKS",
    "UV_INDEX",
    "UV_INDEX_STRATEGY",
    "UV_INDEX_URL",
    "UV_INSECURE_HOST",
    "UV_MANAGED_PYTHON",
    "UV_NO_MANAGED_PYTHON",
    "UV_PRERELEASE",
    "UV_PYTHON",
    "UV_PYTHON_DOWNLOADS",
    "UV_PYTHON_PREFERENCE",
    "UV_RESOLUTION",
    "UV_SYSTEM_CERTS",
    "XDG_CONFIG_HOME",
)


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


def _enforce_member_tasks(workspace: Workspace, package: Package) -> None:
    commands = {
        "lint:deptry": _deptry_command(package),
        "lint:tach": [*_PREFIX, "tach", "check"],
        # An explicit member-relative path overrides workspace-wide testpaths.
        "test:unit": [*_PREFIX, "pytest", "."],
    }

    for name, command in commands.items():
        workspace.turbo(package).task(name).command = command
        workspace.turbo(workspace).task(f"{package.name}#{name}").command = None

    test = workspace.turbo(package).task("test:unit")
    test.env = _TEST_ENV
    test.pass_through_env = _TEST_PASS_THROUGH_ENV


def enforce_turbo_task(workspace: Workspace) -> None:
    for package in workspace.members:
        try:
            _enforce_member_tasks(workspace, package)
        except ValueError as error:
            package.error(error)
