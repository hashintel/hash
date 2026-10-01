"""Read the deptry settings whose CLI equivalents replace TOML values."""

from collections.abc import Mapping

from repo_chores.constraints._engine.document import DocumentTable
from repo_chores.constraints._engine.manifest import Manifest
from repo_chores.constraints._engine.strings import StringList

_FIELD = ("tool", "deptry")


class DeptryConfiguration:
    def __init__(self, manifest: Manifest) -> None:
        self._document = manifest.document

    @property
    def extend_exclude(self) -> tuple[str, ...]:
        return tuple(StringList(self._document, (*_FIELD, "extend_exclude")))

    @property
    def known_first_party(self) -> tuple[str, ...]:
        return tuple(StringList(self._document, (*_FIELD, "known_first_party")))

    @property
    def package_module_name_map(self) -> Mapping[str, tuple[str, ...]]:
        field = (*_FIELD, "package_module_name_map")
        table = self._document.expect(field, DocumentTable)
        return {
            name: tuple(StringList(self._document, (*field, name), scalar=True))
            for name in table or ()
        }
