"""Keep local Ruff exceptions on top of the workspace's lint baseline."""

import json
import subprocess  # ruff: ignore[suspicious-subprocess-import] - Query the installed Ruff rule catalog.

from ruff import find_ruff_bin

from repo_chores.constraints._engine import Workspace


def ruff_rule_selectors() -> frozenset[str]:
    result = subprocess.run(  # ruff: ignore[subprocess-without-shell-equals-true] - Ruff's installed binary and fixed arguments.
        [str(find_ruff_bin()), "rule", "--all", "--output-format", "json"],
        check=True,
        capture_output=True,
        text=True,
    )

    payload: object = json.loads(result.stdout)
    if not isinstance(payload, list):
        raise TypeError("Ruff returned a rule catalog that is not an array")

    if not payload:
        raise ValueError("Ruff returned an empty rule catalog")

    selectors: set[str] = set()
    for entry in payload:
        if not isinstance(entry, dict):
            raise TypeError("Ruff returned an invalid rule")

        name = entry.get("name")
        code = entry.get("code")
        if not isinstance(name, str):
            raise TypeError("Ruff returned a rule name that is not a string")

        if not name:
            raise ValueError("Ruff returned a rule without a name")

        selectors.add(name)
        # New rules can have a descriptive name without a letter-and-number code.
        if code is not None:
            if not isinstance(code, str):
                raise TypeError("Ruff returned a rule code that is not a string")

            if not code:
                raise ValueError("Ruff returned an empty rule code")

            selectors.add(code)

    return frozenset(selectors)


def enforce_ruff_configuration(workspace: Workspace) -> None:
    for path in workspace.standalone_ruff_files:
        workspace.error(
            ValueError(
                f"Move {path.relative_to(workspace.directory)} into tool.ruff in its pyproject.toml; standalone Ruff configuration is forbidden"
            )
        )

    workspace.ruff.select = ("ALL",)

    try:
        selectors = ruff_rule_selectors()
    except (OSError, subprocess.CalledProcessError, TypeError, ValueError) as error:
        workspace.ruff.error(error)
        return

    for configuration in workspace.ruff_configurations:
        if not configuration.is_configured:
            continue

        if configuration.directory != workspace.directory:
            configuration.select = None
            configuration.target_version = None
            configuration.per_file_target_versions = None
            if configuration.has_options:
                configuration.extend = workspace.directory / "pyproject.toml"
            else:
                configuration.is_configured = False

        for ignored in configuration.ignored_rules:
            for selector in ignored.selectors:
                if selector not in selectors:
                    ignored.error(
                        ValueError(
                            f"Ignored selector {selector!r} must name one exact Ruff rule, not a prefix or ALL"
                        )
                    )
