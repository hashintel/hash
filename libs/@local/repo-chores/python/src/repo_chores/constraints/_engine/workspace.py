import subprocess  # ruff: ignore[suspicious-subprocess-import] - Workspace discovery runs uv without a shell.
import tempfile
from collections.abc import Iterable
from contextlib import AbstractContextManager
from pathlib import Path
from typing import Self

from repo_chores.constraints._engine.configuration_files import ruff_configuration_files
from repo_chores.constraints._engine.dependencies import DependencySet
from repo_chores.constraints._engine.diagnostics import Diagnostics, ManifestError, WorkspaceError
from repo_chores.constraints._engine.document import MutationRecorder, mutation
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.package import Package
from repo_chores.constraints._engine.ruff import ManifestRuff, RuffConfiguration
from repo_chores.constraints._engine.source_file import SourceFile
from repo_chores.constraints._engine.strings import StringList
from repo_chores.constraints._engine.turbo import TurboConfiguration

_MEMBERS = ("tool", "uv", "workspace", "members")


class WorkspaceDiscovery:
    def __init__(self, directory: Path) -> None:
        self._directory = directory.resolve()

    def _query(self, arguments: tuple[str, ...]) -> str:
        try:
            completed = subprocess.run(  # ruff: ignore[subprocess-without-shell-equals-true]
                [  # ruff: ignore[start-process-with-partial-path] - binary from PATH is deliberate
                    "uv",
                    "--offline",
                    "--no-python-downloads",
                    "--color",
                    "never",
                    "--directory",
                    str(self._directory),
                    "workspace",
                    *arguments,
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as error:
            raise WorkspaceError(directory=self._directory, message=error.stderr.strip()) from error
        except OSError as error:
            raise WorkspaceError(directory=self._directory, message=str(error)) from error

        return completed.stdout

    def root(self) -> Path:
        result = self._query(("dir",)).strip()

        if not result or "\n" in result or not Path(result).is_absolute():
            raise WorkspaceError(
                directory=self._directory,
                message="uv returned an invalid workspace directory",
            )

        return Path(result).resolve()

    def members(self, root: Path) -> tuple[Path, ...]:
        result: set[Path] = set()
        for line in self._query(("list", "--paths")).splitlines():
            path = Path(line)
            if not line or not path.is_absolute():
                raise WorkspaceError(
                    directory=root, message="uv returned an invalid member directory"
                )

            path = path.resolve()
            if path != root:
                result.add(path)

        return tuple(sorted(result))


class WorkspaceInputs:
    def __init__(self, *, root: Manifest, members: tuple[Path, ...]) -> None:
        self.root = root
        self.members = members
        self.recorder = MutationRecorder()
        self._manifests = {root.path.parent: root}
        self._turbo: dict[Path, TurboConfiguration] = {}
        self._ruff_files: tuple[Path, ...] | None = None

        for directory in members:
            self.manifest(directory)

    @classmethod
    def load(cls, directory: Path) -> Self:
        discovery = WorkspaceDiscovery(directory)
        root = discovery.root()

        manifest = Manifest.load(root)
        members = discovery.members(root)
        manifest.verify()
        return cls(root=manifest, members=members)

    @property
    def manifests(self) -> Iterable[Manifest]:
        return self._manifests.values()

    def manifest(self, directory: Path) -> Manifest:
        directory = directory.resolve()
        if not directory.is_relative_to(self.root.path.parent):
            raise WorkspaceError(
                directory=directory,
                message="workspace member is outside the workspace root",
            )

        if directory not in self._manifests:
            self._manifests[directory] = Manifest.load(directory)

        return self._manifests[directory]

    @property
    def ruff_files(self) -> tuple[Path, ...]:
        if self._ruff_files is None:
            self._ruff_files = ruff_configuration_files(self.root.path.parent)
        return self._ruff_files

    def validate_members(self, directories: tuple[Path, ...], *, declaration: list[str]) -> None:
        root = self.root.path.parent
        for manifest in self._manifests.values():
            manifest.verify()

        # uv checks its own glob and exclusion semantics against the real directory tree.
        # Only the proposed root manifest lives in the temporary directory.
        with tempfile.TemporaryDirectory(prefix="repo-chores-members-") as temporary:
            projected = Path(temporary).resolve()
            for entry in root.iterdir():
                if entry.name != "pyproject.toml":
                    (projected / entry.name).symlink_to(entry, target_is_directory=entry.is_dir())
            candidate = Manifest(path=projected / "pyproject.toml", original=self.root.render())
            with MutationRecorder().activate():
                StringList(candidate.document, _MEMBERS).replace(declaration)
            candidate.path.write_bytes(candidate.render())
            actual = set(WorkspaceDiscovery(projected).members(projected))

        expected = set(directories)
        if actual != expected:
            raise WorkspaceError(
                directory=root,
                message=f"uv membership differs from the declaration: missing {expected - actual}, extra {actual - expected}",
            )

        for manifest in self._manifests.values():
            manifest.verify()

    @property
    def files(self) -> tuple[SourceFile, ...]:
        return (*self._manifests.values(), *self._turbo.values())

    def turbo(self, directory: Path) -> TurboConfiguration:
        if directory not in self._manifests:
            raise WorkspaceError(directory=directory, message="not a loaded package")

        if directory not in self._turbo:
            self._turbo[directory] = TurboConfiguration.load(directory)

        return self._turbo[directory]

    def fingerprint(self) -> tuple[tuple[Path, ...], tuple[tuple[Path, bytes | None], ...]]:
        return self.members, tuple(
            (source.path, source.render())
            for source in sorted(self.files, key=lambda source: source.path)
        )


class Workspace(Package):
    def __init__(self, *, inputs: WorkspaceInputs, diagnostics: Diagnostics) -> None:
        super().__init__(manifest=inputs.root, diagnostics=diagnostics)

        self._inputs = inputs
        self._dependency_constraints = self._dependencies(("tool", "uv", "constraint-dependencies"))
        self._members = self._packages(inputs.members)
        self._validate_names(self._members)

    def _packages(self, directories: Iterable[Path]) -> tuple[Package, ...]:
        return tuple(
            Package(manifest=self._inputs.manifest(directory), diagnostics=self._diagnostics)
            for directory in directories
        )

    def _validate_names(self, members: Iterable[Package]) -> None:
        named = {self.name: self.manifest.path} if self.name is not None else {}
        for member in members:
            if member.name is None:
                raise ManifestError(
                    path=member.directory / "pyproject.toml",
                    field=("project", "name"),
                    message="workspace members need a project name",
                )

            if member.name in named:
                raise ManifestError(
                    path=member.directory / "pyproject.toml",
                    field=("project", "name"),
                    message=f"duplicate name {member.name!r}, also declared in {named[member.name]}",
                )

            named[member.name] = member.directory / "pyproject.toml"

    def _declaration(self, directories: Iterable[Path]) -> list[str]:
        return [
            directory.relative_to(self.directory).as_posix() for directory in sorted(directories)
        ]

    @property
    def dependency_constraints(self) -> DependencySet:
        return self._dependency_constraints

    @property
    def members(self) -> Iterable[Package]:
        return self._members

    @members.setter
    def members(self, value: Iterable[Package | Path]) -> None:
        directories = tuple(
            ((self.directory / member) if isinstance(member, Path) else member.directory).resolve()
            for member in value
        )

        if self.directory in directories or len(set(directories)) != len(directories):
            raise WorkspaceError(
                directory=self.directory,
                message="member declarations cannot contain the root or duplicate directories",
            )

        if set(directories) == set(self._inputs.members):
            return

        candidates = self._packages(directories)
        self._validate_names(candidates)
        declaration = self._declaration(directories)
        self._inputs.validate_members(directories, declaration=declaration)
        StringList(self.manifest.document, _MEMBERS).replace(declaration)
        self._inputs.members = tuple(sorted(directories))
        self._members = self._packages(self._inputs.members)

    def turbo(self, package: Package) -> TurboConfiguration:
        return self._inputs.turbo(package.directory)

    def member_module_roots(self) -> list[Path]:
        return sorted({member.module_root() for member in self.members})

    @property
    def ruff_configurations(self) -> Iterable[RuffConfiguration]:
        packages = {package.directory: package for package in (self, *self._members)}
        configurations = [package.ruff for package in packages.values()]
        configurations.extend(
            ManifestRuff(manifest=self._inputs.manifest(path.parent), diagnostics=self._diagnostics)
            for path in self._inputs.ruff_files
            if path.name == "pyproject.toml" and path.parent not in packages
        )
        return tuple(configurations)

    @property
    def standalone_ruff_files(self) -> Iterable[Path]:
        return tuple(path for path in self._inputs.ruff_files if path.name != "pyproject.toml")

    @staticmethod
    def reason(reason: str) -> AbstractContextManager[None]:
        return mutation(reason=reason)
