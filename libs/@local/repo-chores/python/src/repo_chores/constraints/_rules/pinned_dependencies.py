from collections.abc import Iterator
from dataclasses import dataclass, field

from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet
from packaging.utils import NormalizedName, canonicalize_name
from packaging.version import Version

from repo_chores.constraints._engine import (
    DependencyRequirement,
    Package,
    Workspace,
)
from repo_chores.constraints._engine.diagnostics import ExceptionSink
from repo_chores.constraints.version_ranges import bounded_range, declared_version


@dataclass(frozen=True, slots=True, kw_only=True)
class _PinSource:
    requirement: Requirement
    diagnostics: ExceptionSink

    def declared_version(self) -> Version | None:
        if self.requirement.url is not None:
            self.diagnostics.error(
                ValueError(
                    f"Cannot infer a registry version for direct URL dependency {self.requirement.name}"
                )
            )
            return None

        return declared_version(self.requirement.specifier)


@dataclass(slots=True, kw_only=True)
class _DependencyPin:
    name: NormalizedName
    pins: list[DependencyRequirement] = field(default_factory=list)
    declarations: list[_PinSource] = field(default_factory=list)

    def sources(self) -> Iterator[_PinSource]:
        for pin in self.pins:
            yield _PinSource(requirement=pin, diagnostics=pin)
        yield from self.declarations

    def _error(self, message: str) -> None:
        for source in self.sources():
            if source.requirement.url is None:
                source.diagnostics.error(ValueError(message))

    def select(self) -> SpecifierSet | None:
        sources = tuple((source, source.declared_version()) for source in self.sources())
        greatest = max((floor for _, floor in sources if floor is not None), default=None)
        if greatest is None:
            self._error(
                f"No declared lower or exact version for {self.name}; cannot infer a shared pin"
            )
            return None

        selected = SpecifierSet()
        for source, floor in sources:
            if floor == greatest:
                bounded = bounded_range(source.requirement.specifier)
                if bounded is not None:
                    selected &= bounded

        newest = selected.to_range()
        for source, floor in sources:
            specifier = source.requirement.specifier
            if floor == greatest or source.requirement.url is not None:
                continue

            if specifier.to_range().is_empty or any(part.operator == "===" for part in specifier):
                continue

            if floor is not None and specifier.to_range().is_disjoint(newest):
                continue

            selected &= specifier

        if selected.to_range().is_empty:
            self._error(
                f"Incompatible ranges for {self.name} at newest declared version {greatest}: {selected}"
            )

            return None

        return selected.to_range().to_specifier_set() or selected

    def update_pins(self, *, workspace: Workspace, selected: SpecifierSet) -> None:
        if not self.pins:
            pin = Requirement(self.name)
            pin.specifier = selected
            workspace.dependency_constraints.insert(pin)
            return

        if len(self.pins) > 1:
            self.pins[-1].warning(
                UserWarning(f"Multiple shared pins for {self.name}; using {selected}")
            )

        for pin in self.pins:
            if pin.url is not None:
                continue

            if pin.extras or pin.marker:
                pin.warning(
                    UserWarning(f"Removing extras and marker from the shared pin for {self.name}")
                )
                pin.extras = set()
                pin.marker = None
            pin.specifier = selected

    def apply(self, workspace: Workspace) -> None:
        selected = self.select()
        if selected is None:
            return

        self.update_pins(workspace=workspace, selected=selected)
        for source in self.declarations:
            if source.requirement.url is None:
                source.requirement.specifier = selected


@staticmethod
def _sources(package: Package) -> Iterator[_PinSource]:
    for requirement in package.dependencies:
        yield _PinSource(requirement=requirement, diagnostics=requirement)

    if (build_system := package.build_system) is not None:
        for requirement in build_system.requires or ():
            yield _PinSource(requirement=requirement, diagnostics=package)

    for dependencies in package.optional_dependencies.values():
        for requirement in dependencies:
            yield _PinSource(requirement=requirement, diagnostics=requirement)

    for group in package.dependency_groups.dependency_groups:
        for requirement in package.dependency_group(group):
            yield _PinSource(requirement=requirement, diagnostics=requirement)


@staticmethod
def _collect(
    *,
    workspace: Workspace,
    packages: tuple[Package, ...],
) -> dict[NormalizedName, _DependencyPin]:
    internal = {package.name for package in packages if package.name is not None}
    pins: dict[NormalizedName, _DependencyPin] = {}
    for requirement in workspace.dependency_constraints:
        name = canonicalize_name(requirement.name)
        pins.setdefault(name, _DependencyPin(name=name)).pins.append(requirement)

    for package in packages:
        for source in _sources(package):
            name = canonicalize_name(source.requirement.name)
            if name not in internal or name in pins:
                pins.setdefault(name, _DependencyPin(name=name)).declarations.append(source)

    return pins


def enforce_pinned_dependencies(workspace: Workspace) -> None:
    packages = (workspace, *workspace.members)

    for pin in _collect(workspace=workspace, packages=packages).values():
        with workspace.reason(f"shared pin for {pin.name}"):
            pin.apply(workspace)
