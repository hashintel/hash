from collections.abc import Iterable
from typing import Self, override

from repo_chores.constraints._engine.document import DocumentArray, DocumentString, DocumentTable
from repo_chores.constraints._engine.document_native import NativeTable
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.requirement import RequirementList
from repo_chores.constraints._engine.strings import StringList

_FIELD = ("build-system",)


class BuildSystem:
    """The live build-system table, including its mutable requirement list."""

    __hash__ = None

    def __init__(self, value: DocumentTable[NativeTable]) -> None:
        self._value = value

    @classmethod
    def read(cls, manifest: Manifest) -> Self | None:
        value = manifest.document.expect(_FIELD, DocumentTable)
        return cls(value) if value is not None else None

    def value(self) -> DocumentTable[NativeTable]:
        return self._value

    @property
    def requires(self) -> RequirementList | None:
        value = self._value.expect(("requires",), DocumentArray)
        return RequirementList(value) if value is not None else None

    @property
    def build_backend(self) -> str | None:
        value = self._value.expect(("build-backend",), DocumentString)
        return value.item if value is not None else None

    @build_backend.setter
    def build_backend(self, value: str | None) -> None:
        self._value.set_string(("build-backend",), value)

    @property
    def backend_path(self) -> StringList | None:
        paths = StringList(self._value, ("backend-path",))
        return paths if paths.exists else None

    @backend_path.setter
    def backend_path(self, value: Iterable[str] | None) -> None:
        paths = StringList(self._value, ("backend-path",))

        if value is None:
            paths.remove()
        else:
            paths.replace(value)

    @override
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, BuildSystem):
            return NotImplemented

        if self.build_backend != other.build_backend:
            return False

        for left, right in (
            (self.requires, other.requires),
            (self.backend_path, other.backend_path),
        ):
            if left is None or right is None:
                if left is not right:
                    return False
            elif len(left) != len(right) or any(
                first != second for first, second in zip(left, right, strict=True)
            ):
                return False

        return True
