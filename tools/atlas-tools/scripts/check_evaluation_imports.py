"""Enforce ownership of filesystem imports in relation evaluation.

Tach checks project and third-party dependency boundaries, but intentionally
does not classify standard-library modules as external dependencies. This
check closes that gap without duplicating Tach's dependency graph.
"""

import argparse
import ast
import sys
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

DEFAULT_ROOT = Path("atlas_tools/relation/evaluation")

_FILESYSTEM_MODULES = frozenset(
    {
        "fcntl",
        "fileinput",
        "mmap",
        "os",
        "pathlib",
        "shutil",
        "tempfile",
    }
)
_FILESYSTEM_OWNERS = frozenset({"application", "storage"})


@dataclass(frozen=True, slots=True)
class ImportViolation:
    """A filesystem import placed outside an effect-owning subsystem."""

    path: Path
    line: int
    column: int
    imported_module: str
    owner: str

    def render(self, *, root: Path) -> str:
        """Render a stable compiler-style diagnostic relative to `root`."""
        relative_path = self.path.relative_to(root)
        return (
            f"{relative_path}:{self.line}:{self.column}: EVAL001 filesystem import "
            f"'{self.imported_module}' belongs in application or storage; "
            f"found in {self.owner}"
        )


def _imported_modules(tree: ast.AST) -> Iterator[tuple[ast.Import | ast.ImportFrom, str]]:
    for node in ast.walk(tree):
        match node:
            case ast.Import(names=names):
                for alias in names:
                    yield node, alias.name.partition(".")[0]
            case ast.ImportFrom(module=module, level=0) if module is not None:
                yield node, module.partition(".")[0]
            case _:
                continue


def _owner(path: Path, *, root: Path) -> str:
    relative = path.relative_to(root)
    if len(relative.parts) == 1:
        return "package root"
    return relative.parts[0]


def check_filesystem_imports(root: Path) -> tuple[ImportViolation, ...]:
    """Find filesystem imports outside the subsystems that own file effects.

    Imports nested below conditionals and functions are checked as well as
    module-level imports. Files are parsed once and diagnostics are returned in
    path and source order.

    Raises:
        OSError: A source file cannot be read.
        SyntaxError: A source file cannot be parsed.

    """
    violations: list[ImportViolation] = []
    for path in root.rglob("*.py"):
        owner = _owner(path, root=root)
        if owner in _FILESYSTEM_OWNERS:
            continue

        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node, imported_module in _imported_modules(tree):
            if imported_module in _FILESYSTEM_MODULES:
                violations.append(
                    ImportViolation(
                        path=path,
                        line=node.lineno,
                        column=node.col_offset + 1,
                        imported_module=imported_module,
                        owner=owner,
                    )
                )

    return tuple(
        sorted(
            violations,
            key=lambda violation: (
                violation.path.as_posix(),
                violation.line,
                violation.column,
                violation.imported_module,
            ),
        )
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Check relation evaluation filesystem-import ownership.",
    )
    parser.add_argument(
        "root",
        default=DEFAULT_ROOT,
        nargs="?",
        type=Path,
        help=f"evaluation package root (default: {DEFAULT_ROOT})",
    )
    return parser


def _write_lines(lines: Iterable[str]) -> None:
    for line in lines:
        sys.stdout.write(f"{line}\n")


def main(argv: Sequence[str] | None = None) -> int:
    """Check a package tree and return a process exit status.

    A clean tree returns zero without output. Boundary violations return one
    and emit stable source locations. Missing, unreadable, or invalid source
    trees return two.

    """
    root: Path = _parser().parse_args(argv).root
    if not root.is_dir():
        sys.stderr.write(f"error: evaluation package root does not exist: {root}\n")
        return 2

    try:
        violations = check_filesystem_imports(root)
    except (OSError, SyntaxError) as error:
        sys.stderr.write(f"error: cannot check evaluation imports: {error}\n")
        return 2

    _write_lines(violation.render(root=root) for violation in violations)
    return int(bool(violations))


if __name__ == "__main__":
    raise SystemExit(main())
