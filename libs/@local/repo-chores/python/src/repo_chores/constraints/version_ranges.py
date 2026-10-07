"""Version bounds selected from declared requirement ranges."""

from packaging.specifiers import SpecifierSet
from packaging.version import InvalidVersion, Version


def declared_version(specifier: SpecifierSet) -> Version | None:
    if specifier.to_range().is_empty:
        return None

    versions: list[Version] = []
    for part in specifier:
        if part.operator not in {"==", "===", ">=", ">", "~="}:
            continue

        value = part.version.removesuffix(".*") if part.operator == "==" else part.version
        try:
            versions.append(Version(value))
        except InvalidVersion:
            continue

    return max(versions, default=None)


def bounded_range(specifier: SpecifierSet) -> SpecifierSet | None:
    lower = declared_version(specifier)
    if lower is None:
        return None

    if any(part.operator in {"==", "==="} for part in specifier):
        return specifier

    major, minor, patch = (*lower.release, 0, 0)[:3]
    if major > 0:
        upper = f"{major + 1}.0.0"
    elif minor > 0:
        upper = f"0.{minor + 1}.0"
    else:
        upper = f"0.0.{patch + 1}"
    if lower.epoch:
        upper = f"{lower.epoch}!{upper}"

    bounded = specifier & SpecifierSet(f"<{upper}")
    return bounded.to_range().to_specifier_set() or bounded
