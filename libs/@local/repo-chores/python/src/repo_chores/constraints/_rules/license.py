from dataclasses import dataclass

from license_expression import LicenseSymbol

from repo_chores.constraints._engine import Workspace


@dataclass(frozen=True, slots=True, kw_only=True)
class _ApprovedLicense:
    identifier: str
    file_name: str
    aliases: tuple[str, ...] = ()


_APPROVED_LICENSES = {
    approved.identifier: approved
    for approved in (
        _ApprovedLicense(
            identifier="AGPL-3.0-only", file_name="LICENSE-AGPL.md", aliases=("AGPL-3.0",)
        ),
        _ApprovedLicense(identifier="Apache-2.0", file_name="LICENSE-APACHE.md"),
        _ApprovedLicense(identifier="CC-BY-NC-SA-4.0", file_name="LICENSE-CC.md"),
        _ApprovedLicense(identifier="LicenseRef-HASH", file_name="LICENSE-HASH.md"),
        _ApprovedLicense(identifier="MIT", file_name="LICENSE-MIT.md"),
    )
}

_CANONICAL_IDENTIFIERS = {
    name.lower(): approved.identifier
    for approved in _APPROVED_LICENSES.values()
    for name in (approved.identifier, *approved.aliases)
}


def enforce_license(workspace: Workspace) -> None:
    """Require approved licenses, laid out as the repository's `LICENSE.md` describes.

    The package's `LICENSE.md` defines its license. With one license, it is that
    license's text. With several, it is an index and each text is a `LICENSE-*.md` file
    beside it, named as in `.github/licenses`.
    """
    root = workspace.directory / ".github/licenses"
    names = ", ".join(_APPROVED_LICENSES)

    for member in workspace.members:
        original = member.license_expression
        if original is None:
            member.error(exception=ValueError("License is required"))
            continue

        aliases = {
            leaf: LicenseSymbol(canonical)
            for leaf in original.symbols()
            if isinstance(leaf, LicenseSymbol)
            and (canonical := _CANONICAL_IDENTIFIERS.get(leaf.key.lower(), leaf.key)) != leaf.key
        }
        original.substitute(aliases)
        licenses = [str(leaf) for leaf in original.symbols()]
        unapproved = [declared for declared in licenses if declared not in _APPROVED_LICENSES]

        for declared in unapproved:
            member.error(exception=ValueError(f"License {declared} is not one of: {names}"))
        if unapproved:
            continue

        index = member.directory / "LICENSE.md"
        match licenses:
            case [declared]:
                source = root / _APPROVED_LICENSES[declared].file_name
                if not index.exists():
                    member.error(
                        exception=FileNotFoundError(
                            f"License {declared} requires its text in LICENSE.md, copy it from {source}"
                        )
                    )
            case _:
                if not index.exists():
                    member.error(
                        exception=FileNotFoundError(
                            f"License {original} requires LICENSE.md to describe how the licenses combine"
                        )
                    )

                for declared in licenses:
                    file_name = _APPROVED_LICENSES[declared].file_name
                    if not (member.directory / file_name).exists():
                        member.error(
                            exception=FileNotFoundError(
                                f"License {declared} requires {file_name}, copy it from {root / file_name}"
                            )
                        )
