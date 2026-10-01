from collections.abc import Callable, Iterable, Iterator, Mapping
from contextlib import suppress
from pathlib import Path
from typing import TYPE_CHECKING

from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.utils import NormalizedName, canonicalize_name

from repo_chores.constraints._engine.author import AuthorList
from repo_chores.constraints._engine.build_layout import UvBuildLayout
from repo_chores.constraints._engine.build_system import BuildSystem
from repo_chores.constraints._engine.dependencies import (
    DependencyMap,
    DependencySet,
    ManifestDependencies,
)
from repo_chores.constraints._engine.diagnostics import (
    Diagnostics,
    LocatedDiagnostics,
    ManifestError,
)
from repo_chores.constraints._engine.document import DocumentArray, DocumentString, DocumentTable
from repo_chores.constraints._engine.groups import DependencyGroups
from repo_chores.constraints._engine.location import Location, LocationPath
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.metadata import LicenseExpression, PythonVersion
from repo_chores.constraints._engine.pytest import ManifestPytest, PytestConfiguration
from repo_chores.constraints._engine.ruff import ManifestRuff, RuffConfiguration
from repo_chores.constraints._engine.sources import DependencySources, ManifestSources

if TYPE_CHECKING:
    from _typeshed import SupportsRichComparison


class Package(LocatedDiagnostics):
    """Typed views of one live manifest."""

    def __init__(self, *, manifest: Manifest, diagnostics: Diagnostics) -> None:
        super().__init__(
            location=Location(manifest=manifest.path, path=()), diagnostics=diagnostics
        )

        self.manifest = manifest
        self._document = manifest.document
        self._diagnostics = diagnostics
        self._sources = ManifestSources(manifest)
        self._pytest = ManifestPytest(manifest=manifest, diagnostics=diagnostics)
        self._ruff = ManifestRuff(manifest=manifest, diagnostics=diagnostics)

    @property
    def directory(self) -> Path:
        return self.manifest.path.parent

    @property
    def name(self) -> NormalizedName | None:
        value = self._document.expect(("project", "name"), DocumentString)
        if value is None:
            return None

        try:
            return canonicalize_name(value.item, validate=True)
        except ValueError as error:
            raise ManifestError(
                path=self.manifest.path, field=value.location.path, message=str(error)
            ) from error

    @property
    def python_version(self) -> PythonVersion | None:
        value = self._document.expect(("project", "requires-python"), DocumentString)
        return PythonVersion(value) if value is not None else None

    @python_version.setter
    def python_version(self, value: SpecifierSet | PythonVersion) -> None:
        field = ("project", "requires-python")
        location = Location(manifest=self.manifest.path, path=field)

        try:
            version = (
                value
                if isinstance(value, PythonVersion)
                else PythonVersion.from_specifiers(value, location=location)
            )

            # A malformed old value must not prevent its replacement.
            with suppress(ManifestError):
                if self.python_version == version:
                    return

            self._document.assign(field=field, value=version.value())
        except (TypeError, ValueError) as error:
            self._diagnostics.error(location=location, exception=error)

    @property
    def license_expression(self) -> LicenseExpression | None:
        value = self._document.expect(("project", "license"), DocumentString)
        return LicenseExpression(value) if value is not None else None

    @property
    def authors(self) -> AuthorList:
        return AuthorList(self._document, ("project", "authors"))

    def inline_authors(self) -> None:
        try:
            self._document.inline_array_of_tables(("project", "authors"))
        except (TypeError, ValueError) as error:
            self._diagnostics.error(
                location=Location(manifest=self.manifest.path, path=("project", "authors")),
                exception=error,
            )

    def sort_sections(self, *, key: Callable[[tuple[str, ...]], SupportsRichComparison]) -> None:
        self._document.sort_sections(key)

    @property
    def sources(self) -> DependencySources:
        return self._sources

    @property
    def build_system(self) -> BuildSystem | None:
        return BuildSystem.read(self.manifest)

    @build_system.setter
    def build_system(self, value: BuildSystem) -> None:
        with suppress(ManifestError):
            if self.build_system == value:
                return

        self._document.assign(field=("build-system",), value=value.value())

    @property
    def is_package(self) -> bool:
        value = self._document.boolean(("tool", "uv", "package"))
        return self.build_system is not None if value is None else value

    @property
    def uv_build_layout(self) -> UvBuildLayout:
        return UvBuildLayout(self._document)

    def module_root(self) -> Path:
        build = self.build_system

        if self.is_package and build is not None and build.build_backend == "uv_build":
            return self.directory / self.uv_build_layout.module_root

        source = self.directory / "src"
        return source if source.is_dir() else self.directory

    def _group(self, group: str) -> ManifestDependencies:
        normalized = canonicalize_name(group)
        table = self._document.expect(("dependency-groups",), DocumentTable)
        name = next((name for name in table or () if canonicalize_name(name) == normalized), group)

        return ManifestDependencies(
            manifest=self.manifest,
            field=("dependency-groups", name),
            diagnostics=self._diagnostics,
            groups=self._group,
        )

    def _dependencies(self, field: LocationPath) -> ManifestDependencies:
        return ManifestDependencies(
            manifest=self.manifest,
            field=field,
            diagnostics=self._diagnostics,
            groups=self._group if field[0] == "dependency-groups" else None,
        )

    @property
    def dependencies(self) -> DependencySet:
        return self._dependencies(("project", "dependencies"))

    @property
    def optional_dependencies(self) -> Mapping[str, DependencySet]:
        return DependencyMap(
            manifest=self.manifest,
            field=("project", "optional-dependencies"),
            diagnostics=self._diagnostics,
        )

    @property
    def dependency_groups(self) -> DependencyGroups:
        return DependencyGroups(self._document)

    def dependency_group(self, group: str) -> DependencySet:
        return self._group(group)

    def _requirement_fields(self) -> Iterator[LocationPath]:
        yield ("project", "dependencies")
        yield ("build-system", "requires")
        yield ("tool", "uv", "constraint-dependencies")
        for parent in (("project", "optional-dependencies"), ("dependency-groups",)):
            table = self._document.expect(parent, DocumentTable)
            for name in table or ():
                yield (*parent, name)

    @property
    def requirement_lists(self) -> Iterable[DependencySet]:
        return (
            self._dependencies(field)
            for field in self._requirement_fields()
            if self._document.expect(field, DocumentArray) is not None
        )

    def requirements(self) -> Iterator[Requirement]:
        yield from self.dependencies
        for dependencies in self.optional_dependencies.values():
            yield from dependencies

        for group in self.dependency_groups.dependency_groups:
            yield from self.dependency_group(group)

        if (build := self.build_system) is not None:
            yield from build.requires or ()

    @property
    def pytest(self) -> PytestConfiguration:
        return self._pytest

    @property
    def ruff(self) -> RuffConfiguration:
        return self._ruff
