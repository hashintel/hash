from collections.abc import Iterator, Mapping
from typing import Self

from license_expression import (
    AND,
    OR,
    ExpressionError,
    LicenseSymbol,
    LicenseWithExceptionSymbol,
    Licensing,
)
from packaging.licenses import canonicalize_license_expression
from packaging.specifiers import SpecifierSet

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import DocumentString
from repo_chores.constraints._engine.location import Location


class PythonVersion:
    __slots__ = ("_value",)

    def __init__(self, value: DocumentString) -> None:
        self._value = value

    def _read(self) -> SpecifierSet:
        try:
            return SpecifierSet(self._value.item)
        except ValueError as error:
            raise ManifestError(
                path=self._value.location.manifest,
                field=self._value.location.path,
                message=str(error),
            ) from error

    @classmethod
    def from_specifiers(cls, value: SpecifierSet, *, location: Location) -> Self:
        text = str(value)
        if SpecifierSet(text).to_range() != value.to_range():
            raise ValueError("requires-python cannot represent a runtime prerelease policy")

        return cls(DocumentString.from_str(text, location=location))

    def value(self) -> DocumentString:
        return self._value

    def __str__(self) -> str:
        return str(self._read())

    def __eq__(self, other: object) -> bool:
        match other:
            case PythonVersion():
                return self._read() == other._read()
            case SpecifierSet():
                return self._read().to_range() == other.to_range()
            case _:
                return NotImplemented


type LicenseTree = LicenseSymbol | LicenseWithExceptionSymbol | AND | OR
_LICENSING = Licensing()


class LicenseExpression:
    __slots__ = ("_value",)

    def _read(self) -> LicenseTree:
        try:
            return _LICENSING.parse(canonicalize_license_expression(self._value.item))
        except (ValueError, ExpressionError) as error:
            raise ManifestError(
                path=self._value.location.manifest,
                field=self._value.location.path,
                message=str(error),
            ) from error

    def __init__(self, value: DocumentString) -> None:
        self._value = value

    def __str__(self) -> str:
        return str(self._read())

    def symbols(self) -> Iterator[object]:
        return iter(_LICENSING.license_symbols(self._read(), unique=False, decompose=False))

    def substitute(self, replacements: Mapping[LicenseSymbol, LicenseSymbol]) -> None:
        current = self._read()
        updated = current.subs(replacements)

        if updated != current:
            self._value.set(canonicalize_license_expression(str(updated)))
