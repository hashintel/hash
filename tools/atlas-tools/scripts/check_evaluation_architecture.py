"""Run every mandatory relation-evaluation architecture check."""

import argparse
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path

from scripts.check_evaluation_imports import main as check_filesystem_imports

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVALUATION_ROOT = Path("atlas_tools/relation/evaluation")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Check relation-evaluation dependency and filesystem boundaries.",
    )
    parser.add_argument(
        "project_root",
        default=PROJECT_ROOT,
        nargs="?",
        type=Path,
        help=f"project containing tach.toml (default: {PROJECT_ROOT})",
    )
    parser.add_argument(
        "--evaluation-root",
        default=DEFAULT_EVALUATION_ROOT,
        type=Path,
        help=(
            "evaluation package path relative to the project root "
            f"(default: {DEFAULT_EVALUATION_ROOT})"
        ),
    )
    return parser


def _run_tach(project_root: Path, arguments: Sequence[str]) -> int:
    tach = Path(sys.executable).with_name("tach")
    if not tach.is_file():
        sys.stderr.write(f"error: tach executable does not exist: {tach}\n")
        return 2

    result = subprocess.run(  # noqa: S603 -- the executable belongs to this Python environment.
        [tach, *arguments],
        cwd=project_root,
        check=False,
        capture_output=True,
        text=True,
    )
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    return result.returncode


def main(argv: Sequence[str] | None = None) -> int:
    """Check the complete architecture contract and return a process status.

    Tach owns package and third-party dependency direction. The AST checker
    owns standard-library filesystem effects, which Tach does not model. Both
    checks run on every invocation so one violation cannot hide another.

    """
    arguments = _parser().parse_args(argv)
    project_root = arguments.project_root.resolve()
    if not project_root.is_dir():
        sys.stderr.write(f"error: project root does not exist: {project_root}\n")
        return 2

    dependency_status = _run_tach(project_root, ("check", "--exact"))
    external_status = _run_tach(project_root, ("check-external",))
    filesystem_status = check_filesystem_imports([str(project_root / arguments.evaluation_root)])
    return max(dependency_status, external_status, filesystem_status)


if __name__ == "__main__":
    raise SystemExit(main())
