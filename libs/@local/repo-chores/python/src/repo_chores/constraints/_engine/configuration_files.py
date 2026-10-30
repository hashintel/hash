import subprocess  # ruff: ignore[suspicious-subprocess-import] - Git supplies the repository's maintained-file inventory.
from pathlib import Path

from repo_chores.constraints._engine.diagnostics import WorkspaceError

_RUFF_FILES = frozenset({"pyproject.toml", "ruff.toml", ".ruff.toml"})
_GENERATED_DIRECTORIES = frozenset({
    ".git",
    ".venv",
    "venv",
    ".tox",
    ".nox",
    "__pycache__",
    "node_modules",
    "build",
    "dist",
    "target",
})


def ruff_configuration_files(root: Path) -> tuple[Path, ...]:
    if any((directory / ".git").exists() for directory in (root, *root.parents)):
        try:
            result = subprocess.run(  # ruff: ignore[subprocess-without-shell-equals-true] - Fixed read-only command, no shell.
                [  # ruff: ignore[start-process-with-partial-path] - Use the Git installation on the caller's PATH.
                    "git",
                    "-C",
                    str(root),
                    "ls-files",
                    "--cached",
                    "--others",
                    "--exclude-standard",
                    "-z",
                    "--",
                    *(f":(glob)**/{name}" for name in sorted(_RUFF_FILES)),
                ],
                check=True,
                capture_output=True,
            )
        except (OSError, subprocess.CalledProcessError) as error:
            raise WorkspaceError(
                directory=root, message=f"Could not discover Ruff configurations: {error}"
            ) from error

        return tuple(
            sorted({
                root / path.decode("utf-8")
                for path in result.stdout.split(b"\0")
                if path and (root / path.decode("utf-8")).exists()
            })
        )

    files: list[Path] = []

    def fail(error: OSError) -> None:
        raise WorkspaceError(directory=root, message=str(error)) from error

    for directory, directories, names in root.walk(on_error=fail):
        directories[:] = [name for name in directories if name not in _GENERATED_DIRECTORIES]
        files.extend(directory / name for name in names if name in _RUFF_FILES)

    return tuple(sorted(files))
