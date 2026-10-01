from packaging.utils import canonicalize_name

from repo_chores.constraints._engine import Workspace


def enforce_workspace_sources(workspace: Workspace) -> None:
    packages = (workspace, *workspace.members)
    internal = {package.name for package in packages if package.name is not None}

    for package in packages:
        names = set()

        for requirement in package.requirements():
            name = canonicalize_name(requirement.name)
            if name not in internal:
                continue

            names.add(name)

            if requirement.url is not None:
                package.warning(
                    UserWarning(f"Replacing direct URL for {name} with the workspace member")
                )
                requirement.url = None

        for name in sorted(names):
            existing = package.sources.get(name)
            inherited = workspace.sources.get(name)
            if existing is None and inherited is not None and inherited.is_workspace:
                continue

            if existing is not None and not existing.is_workspace:
                package.warning(
                    UserWarning(f"Replacing source override for {name} with the workspace member")
                )

            package.sources.use_workspace(name)
