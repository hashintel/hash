"""Keep deptry as a native member task, derived from production build layouts."""

import re
from collections.abc import Mapping
from itertools import chain
from pathlib import Path

from packaging.utils import NormalizedName, canonicalize_name

from repo_chores.constraints._engine import Package, Workspace

_PREFIX = ("uv", "run", "--active", "--frozen", "--all-packages", "deptry")

# deptry matches from the start of the package-relative path, not at any offset.
_TESTS = r"(^|.*[/\\])tests([/\\]|$)"


def _modules(package: Package) -> dict[str, Path]:
    build = package.build_system
    if not package.is_package or build is None or build.build_backend != "uv_build":
        raise ValueError("deptry needs a packaged uv_build production layout")

    layout = package.uv_build_layout
    modules: dict[str, Path] = {}
    for name in layout.names(package.name):
        if not all(part.isidentifier() for part in name.split(".")):
            raise ValueError(f"unsupported production module name {name!r}")

        directory = layout.module_directory(project=package.directory, name=name).resolve()
        if not directory.is_relative_to(package.directory) or directory == package.directory:
            raise ValueError(f"production module {name!r} must be inside its member")

        if not directory.is_dir() or (
            not layout.namespace and not (directory / layout.initializer(name)).is_file()
        ):
            raise ValueError(f"missing production module {name!r}: {directory}")

        modules[name] = directory

    if not modules:
        raise ValueError("deptry needs at least one production module")

    return modules


def _paths(package: Package, modules: Mapping[str, Path]) -> list[Path]:
    paths: list[Path] = []
    for path in sorted(set(modules.values()), key=lambda path: (len(path.parts), path)):
        if not any(path.is_relative_to(parent) for parent in paths):
            paths.append(path)

    paths.sort()

    scripts = package.directory / "scripts"
    if scripts.is_dir() and not any(scripts.is_relative_to(parent) for parent in paths):
        if not scripts.resolve().is_relative_to(package.directory):
            raise ValueError("production scripts must be inside their member")

        paths.append(scripts)

    return paths


def _exclusions(workspace: Workspace, package: Package, paths: list[Path]) -> list[str]:
    tests = {
        (owner.directory / path).resolve()
        for owner in (workspace, package)
        for path in owner.pytest.test_paths
    }

    for test in tests:
        if test.is_relative_to(package.directory) and any(
            character in test.relative_to(package.directory).as_posix() for character in "*?["
        ):
            raise ValueError("deptry needs literal pytest test paths, not glob patterns")

    exclusions = {_TESTS, *package.deptry.extend_exclude}
    for path in paths:
        relative = path.relative_to(package.directory)
        if "tests" in relative.parts or any(path.is_relative_to(test) for test in tests):
            raise ValueError(f"production selector {relative} is also a test root")

        for test in tests:
            if not test.is_relative_to(path):
                continue

            parts = test.relative_to(package.directory).parts
            exclusions.add(r"(^|[/\\])" + r"[/\\]".join(map(re.escape, parts)) + r"([/\\]|$)")

    # Validate user expressions now rather than emit a task that cannot run.
    for exclusion in exclusions:
        re.compile(exclusion)

    return sorted(exclusions)


def _aliases(workspace: Workspace, package: Package) -> dict[str, tuple[str, ...]]:
    members = {member.name: member for member in workspace.members}
    aliases: dict[str, tuple[str, ...]] = {}
    for name, modules in package.deptry.package_module_name_map.items():
        normalized = canonicalize_name(name, validate=True)
        if normalized in aliases:
            raise ValueError(f"duplicate normalized deptry mapping {normalized!r}")

        aliases[normalized] = modules

    runtime = chain(package.dependencies, *package.optional_dependencies.values())
    names = {canonicalize_name(requirement.name) for requirement in runtime} | aliases.keys()
    for name in sorted(names):
        member = members.get(name)
        if member is None:
            continue

        modules = tuple(sorted({module.split(".", maxsplit=1)[0] for module in _modules(member)}))
        if modules != (name.replace("-", "_"),) or name in aliases:
            aliases[name] = modules

    for name, modules in aliases.items():
        if not modules or any(
            not module or any(char in module for char in ",=|") for module in modules
        ):
            raise ValueError(f"deptry mapping {name!r} cannot be represented as CLI argv")

    return aliases


def _command(workspace: Workspace, package: Package) -> list[str]:
    modules = _modules(package)
    paths = _paths(package, modules)
    command = [*_PREFIX]
    for path in paths:
        relative = path.relative_to(package.directory).as_posix()
        command.append("./" + relative if relative.startswith("-") else relative)

    first_party = {name.split(".", maxsplit=1)[0] for name in modules}
    first_party.update(package.deptry.known_first_party)
    if (package.directory / "scripts/__init__.py").is_file():
        first_party.add("scripts")

    for name in sorted(first_party):
        command.extend(("--known-first-party", name))

    for exclusion in _exclusions(workspace, package, paths):
        command.extend(("--extend-exclude", exclusion))

    aliases = _aliases(workspace, package)
    if aliases:
        command.extend((
            "--package-module-name-map",
            ",".join(
                f"{name}={'|'.join(sorted(set(modules)))}"
                for name, modules in sorted(aliases.items())
            ),
        ))

    return command


def enforce_turbo_task(workspace: Workspace) -> None:
    for package in workspace.members:
        try:
            command = _command(workspace, package)
            workspace.turbo(package).task("lint:deptry").command = command
            name: NormalizedName | None = package.name
            workspace.turbo(workspace).task(f"{name}#lint:deptry").command = None
        except (ValueError, re.PatternError) as error:
            package.error(error)

        workspace.turbo(package).task("test:unit").depends_on = ["test"]
