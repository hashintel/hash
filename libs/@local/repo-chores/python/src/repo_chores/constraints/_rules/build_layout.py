from itertools import chain
from pathlib import Path

from repo_chores.constraints._engine import Package, UvBuildLayout, Workspace
from repo_chores.constraints._engine.diagnostics import ManifestError


def _missing(*, package: Package, layout: UvBuildLayout) -> tuple[Path, ...]:
    missing: list[Path] = []
    for name in layout.names(package.name):
        directory = layout.module_directory(project=package.directory, name=name)
        expected = directory if layout.namespace else directory / layout.initializer(name)

        if not (expected.is_dir() if layout.namespace else expected.is_file()):
            missing.append(expected)
    return tuple(missing)


def _inferred_module(package: Package) -> Path | None:
    layout = package.uv_build_layout
    roots = dict.fromkeys(
        "" if Path(root) == Path() else Path(root).as_posix()
        for root in (layout.module_root, "src", "")
    )

    for root in roots:
        directory = package.directory / root
        if not directory.is_dir():
            continue

        if (
            directory != package.directory
            and (directory / layout.initializer(directory.name)).is_file()
        ):
            return directory

        candidates = [
            child
            for child in directory.iterdir()
            if child.is_dir()
            and not child.name.startswith(".")
            and (child / layout.initializer(child.name)).is_file()
        ]

        if candidates:
            return candidates[0] if len(candidates) == 1 else None

    return None


def enforce_build_layout(workspace: Workspace) -> None:
    for package in chain((workspace,), workspace.members):
        build = package.build_system
        if not package.is_package or build is None or build.build_backend != "uv_build":
            continue

        layout = package.uv_build_layout
        if layout.module_names is None and package.name is None:
            package.error(ValueError("uv_build needs project.name or an explicit module-name"))
            continue

        missing = _missing(package=package, layout=layout)
        if not missing:
            continue

        module = _inferred_module(package)
        if module is not None:
            parent = module.parent.relative_to(package.directory)
            layout.module_root = "" if parent == Path() else parent.as_posix()
            layout.module_names = (module.name,)
            continue

        paths = ", ".join(
            str(path.relative_to(package.directory, walk_up=True)) for path in missing
        )
        package.error(
            ManifestError(
                path=package.directory / "pyproject.toml",
                field=("tool", "uv", "build-backend", "module-name"),
                message=f"Missing module paths: {paths}. Existing source directories do not identify a single layout to use. You must manually set tool.uv.build-backend.module-name/module-root.",
            )
        )
