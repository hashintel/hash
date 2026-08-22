"""Keep filesystem capabilities inside relation-evaluation effect owners.

Tach owns package and third-party dependency direction, but it intentionally
does not classify Python's standard library. This checker closes that gap for
filesystem modules and for filesystem entry points such as ``open`` and
``io.open``.
"""

import argparse
import ast
import sys
from collections import defaultdict
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

DEFAULT_ROOT = Path("atlas_tools/relation/evaluation")

# Importing one of these modules transfers filesystem capability into the
# importing subsystem. Modules with both pure and effectful APIs, notably
# ``io``, are checked at the symbol level instead.
_FILESYSTEM_MODULES = frozenset(
    {
        "dbm",
        "fcntl",
        "fileinput",
        "glob",
        "mmap",
        "os",
        "pathlib",
        "shelve",
        "shutil",
        "sqlite3",
        "tempfile",
    }
)
_FILESYSTEM_OWNERS = frozenset({"application", "storage"})
_FILESYSTEM_SYMBOLS = frozenset({"builtins.open", "io.open"})

type ViolationKind = Literal["import", "access"]
type BindingTarget = str | None
type ScopeKind = Literal["module", "class", "function"]


@dataclass(frozen=True, slots=True)
class ImportViolation:
    """A filesystem capability used outside an effect-owning subsystem."""

    path: Path
    line: int
    column: int
    imported_module: str
    owner: str
    kind: ViolationKind = "import"

    def render(self, *, root: Path) -> str:
        """Render a stable compiler-style diagnostic relative to ``root``."""
        relative_path = self.path.relative_to(root)
        noun = "import" if self.kind == "import" else "access"
        code = "EVAL001" if self.kind == "import" else "EVAL002"
        return (
            f"{relative_path}:{self.line}:{self.column}: {code} filesystem {noun} "
            f"'{self.imported_module}' belongs in application or storage; "
            f"found in {self.owner}"
        )


@dataclass(frozen=True, slots=True)
class _Scope:
    """Lexical bindings needed to distinguish built-ins from local names."""

    parent: _Scope | None
    bindings: dict[str, BindingTarget]
    kind: ScopeKind

    def resolve(self, name: str) -> tuple[bool, BindingTarget]:
        """Return whether ``name`` is bound and its known import target."""
        scope: _Scope | None = self
        while scope is not None:
            if name in scope.bindings:
                return True, scope.bindings[name]
            scope = scope.parent
        return False, None


class _BindingCollector(ast.NodeVisitor):
    """Collect bindings from one lexical scope without entering child scopes."""

    def __init__(self) -> None:
        self._targets: defaultdict[str, set[BindingTarget]] = defaultdict(set)
        self._outer_names: set[str] = set()

    def collect(
        self,
        body: Sequence[ast.stmt],
        *,
        arguments: ast.arguments | None = None,
    ) -> dict[str, BindingTarget]:
        """Return names bound by ``body`` and their unambiguous import targets."""
        if arguments is not None:
            for argument in (
                *arguments.posonlyargs,
                *arguments.args,
                *arguments.kwonlyargs,
            ):
                self._bind(argument.arg, None)
            if arguments.vararg is not None:
                self._bind(arguments.vararg.arg, None)
            if arguments.kwarg is not None:
                self._bind(arguments.kwarg.arg, None)

        for statement in body:
            self.visit(statement)

        return {
            name: next(iter(targets)) if len(targets) == 1 else None
            for name, targets in self._targets.items()
            if name not in self._outer_names
        }

    def _bind(self, name: str, target: BindingTarget) -> None:
        self._targets[name].add(target)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._bind(node.name, None)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._bind(node.name, None)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._bind(node.name, None)

    def visit_Global(self, node: ast.Global) -> None:
        self._outer_names.update(node.names)

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            bound_name = alias.asname or alias.name.partition(".")[0]
            target = alias.name if alias.asname else alias.name.partition(".")[0]
            self._bind(bound_name, target)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.level != 0 or node.module is None:
            for alias in node.names:
                if alias.name != "*":
                    self._bind(alias.asname or alias.name, None)
            return

        for alias in node.names:
            if alias.name != "*":
                self._bind(alias.asname or alias.name, f"{node.module}.{alias.name}")

    def visit_Lambda(self, node: ast.Lambda) -> None:
        _ = node

    def visit_MatchAs(self, node: ast.MatchAs) -> None:
        if node.name is not None:
            self._bind(node.name, None)
        if node.pattern is not None:
            self.visit(node.pattern)

    def visit_MatchStar(self, node: ast.MatchStar) -> None:
        if node.name is not None:
            self._bind(node.name, None)

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            self._bind(node.id, None)

    def visit_Nonlocal(self, node: ast.Nonlocal) -> None:
        self._outer_names.update(node.names)


def _imported_modules(tree: ast.AST) -> Iterator[tuple[ast.Import | ast.ImportFrom, str]]:
    for node in ast.walk(tree):
        match node:
            case ast.Import(names=names):
                for alias in names:
                    yield node, alias.name.partition(".")[0]
            case ast.ImportFrom(module=module, level=0) if module is not None:
                imported_root = module.partition(".")[0]
                if imported_root in _FILESYSTEM_MODULES:
                    yield node, imported_root
                    continue
                for alias in node.names:
                    qualified_name = f"{module}.{alias.name}"
                    if qualified_name in _FILESYSTEM_SYMBOLS:
                        yield node, qualified_name
            case _:
                continue


class _FilesystemAccessVisitor(ast.NodeVisitor):
    """Find symbol-level filesystem capabilities while respecting shadowing."""

    def __init__(self, *, path: Path, owner: str) -> None:
        self._path = path
        self._owner = owner
        self._scope: _Scope | None = None
        self.violations: list[ImportViolation] = []

    def check(self, tree: ast.Module) -> tuple[ImportViolation, ...]:
        """Inspect ``tree`` and return filesystem-symbol violations."""
        self._visit_scope(tree.body, kind="module")
        return tuple(self.violations)

    def _visit_scope(
        self,
        body: Sequence[ast.stmt],
        *,
        arguments: ast.arguments | None = None,
        kind: ScopeKind,
    ) -> None:
        parent = self._scope
        if kind != "module":
            while parent is not None and parent.kind == "class":
                parent = parent.parent
        bindings = _BindingCollector().collect(body, arguments=arguments)
        self._scope = _Scope(parent=parent, bindings=bindings, kind=kind)
        for statement in body:
            self.visit(statement)
        self._scope = parent

    def _resolve(self, name: str) -> tuple[bool, BindingTarget]:
        if self._scope is None:
            return False, None
        return self._scope.resolve(name)

    def _record(self, node: ast.expr, symbol: str) -> None:
        self.violations.append(
            ImportViolation(
                path=self._path,
                line=node.lineno,
                column=node.col_offset + 1,
                imported_module=symbol,
                owner=self._owner,
                kind="access",
            )
        )

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._visit_function(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visit_function(node)

    def _visit_function(self, node: ast.AsyncFunctionDef | ast.FunctionDef) -> None:
        for decorator in node.decorator_list:
            self.visit(decorator)
        for default in (*node.args.defaults, *node.args.kw_defaults):
            if default is not None:
                self.visit(default)
        if node.returns is not None:
            self.visit(node.returns)
        self._visit_scope(node.body, arguments=node.args, kind="function")

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        for decorator in node.decorator_list:
            self.visit(decorator)
        for base in node.bases:
            self.visit(base)
        for keyword in node.keywords:
            self.visit(keyword.value)
        self._visit_scope(node.body, kind="class")

    def visit_Lambda(self, node: ast.Lambda) -> None:
        for default in (*node.args.defaults, *node.args.kw_defaults):
            if default is not None:
                self.visit(default)

        parent = self._scope
        while parent is not None and parent.kind == "class":
            parent = parent.parent
        bindings = _BindingCollector().collect((), arguments=node.args)
        self._scope = _Scope(parent=parent, bindings=bindings, kind="function")
        self.visit(node.body)
        self._scope = parent

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr == "open" and isinstance(node.value, ast.Name):
            is_bound, target = self._resolve(node.value.id)
            if is_bound and target in {"builtins", "io"}:
                self._record(node, f"{target}.open")
                return
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if not isinstance(node.ctx, ast.Load):
            return

        is_bound, target = self._resolve(node.id)
        if node.id == "open" and not is_bound:
            self._record(node, "builtins.open")
        elif is_bound and target in _FILESYSTEM_SYMBOLS:
            # The import itself already provides a more useful location.
            return


def _owner(path: Path, *, root: Path) -> str:
    relative = path.relative_to(root)
    if len(relative.parts) == 1:
        return "package root"
    return relative.parts[0]


def check_filesystem_imports(root: Path) -> tuple[ImportViolation, ...]:
    """Find filesystem capabilities outside their owning subsystems.

    Imports and accesses nested below conditionals and functions are checked as
    well as module-level operations. ``application`` and ``storage`` own these
    effects; every other evaluation subsystem remains filesystem-independent.

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
            if (
                imported_module.partition(".")[0] in _FILESYSTEM_MODULES
                or imported_module in _FILESYSTEM_SYMBOLS
            ):
                violations.append(
                    ImportViolation(
                        path=path,
                        line=node.lineno,
                        column=node.col_offset + 1,
                        imported_module=imported_module,
                        owner=owner,
                    )
                )
        violations.extend(_FilesystemAccessVisitor(path=path, owner=owner).check(tree))

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
        description="Check relation evaluation filesystem ownership.",
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
