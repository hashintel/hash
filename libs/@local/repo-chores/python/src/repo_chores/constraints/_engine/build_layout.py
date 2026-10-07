from collections.abc import Iterable
from contextlib import suppress
from pathlib import Path

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import DocumentString, DocumentTable
from repo_chores.constraints._engine.document_native import NativeTable
from repo_chores.constraints._engine.strings import StringList

_FIELD = ("tool", "uv", "build-backend")


class UvBuildLayout:
    """The live uv build-backend configuration with uv's defaults on absent fields."""

    def __init__(self, document: DocumentTable[NativeTable]) -> None:
        self._document = document

    @property
    def module_names(self) -> StringList | None:
        names = StringList(self._document, (*_FIELD, "module-name"), scalar=True)
        return names if names.exists else None

    @property
    def module_root(self) -> str:
        root = self._document.expect((*_FIELD, "module-root"), DocumentString)
        return root.item if root is not None else "src"

    @module_root.setter
    def module_root(self, value: str) -> None:
        with suppress(ManifestError):
            if value == self.module_root:
                return

        self._document.set_string((*_FIELD, "module-root"), value)

    @property
    def namespace(self) -> bool:
        value = self._document.boolean((*_FIELD, "namespace"))
        return value if value is not None else False

    @module_names.setter
    def module_names(self, names: Iterable[str]) -> None:
        StringList(self._document, (*_FIELD, "module-name"), scalar=True).replace(names)

    @staticmethod
    def initializer(name: str) -> str:
        return (
            "__init__.pyi" if name.split(".", maxsplit=1)[0].endswith("-stubs") else "__init__.py"
        )

    def names(self, project_name: str | None) -> StringList | tuple[str, ...]:
        if (names := self.module_names) is not None:
            return names

        if project_name is None:
            return ()

        if project_name.endswith("-stubs"):
            return (project_name[:-6].replace("-", "_").replace(".", "_") + "-stubs",)

        return (project_name.replace("-", "_").replace(".", "_"),)

    def module_directory(self, *, project: Path, name: str) -> Path:
        return project / self.module_root / Path(*name.split("."))
