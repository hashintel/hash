"""Live, located proxies for TOML nodes and their mutations."""

from collections.abc import Callable, Iterable, Iterator, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from enum import StrEnum
from itertools import pairwise
from pathlib import Path
from typing import TYPE_CHECKING, Self

from tomlkit import parse
from tomlkit.container import Container, OutOfOrderTableProxy
from tomlkit.exceptions import InvalidStringError
from tomlkit.items import (
    AoT,
    Array,
    Bool,
    Comment,
    InlineTable,
    Item,
    Null,
    String,
    Table,
    Trivia,
    Whitespace,
    _ArrayItemGroup,
    item,
)

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document_native import (
    Body,
    NativeItem,
    NativeTable,
    SectionLayout,
    assign_native,
    copy_native,
    description,
    equivalent,
    native,
    order_sections,
    prepend_assignment,
    rebuild,
    remove_native,
    section_paths,
)
from repo_chores.constraints._engine.location import Location, LocationPath

if TYPE_CHECKING:
    from _typeshed import SupportsRichComparison


class OperationKind(StrEnum):
    SET = "set"
    DELETE = "delete"
    INSERT = "insert"
    SORT = "sort"
    SECTIONS = "sort sections"
    INLINE = "inline"


@dataclass(frozen=True, slots=True, kw_only=True)
class Operation:
    location: Location
    kind: OperationKind
    rule: str
    reason: str | None
    pass_number: int
    before: object
    after: object


_RECORDER: ContextVar[MutationRecorder] = ContextVar("mutation_recorder")


class MutationRecorder:
    def __init__(self) -> None:
        self.rule = "<engine>"
        self.pass_number = 0
        self.current_reason: str | None = None
        self.operations: list[Operation] = []

    @contextmanager
    def activate(self) -> Iterator[None]:
        token = _RECORDER.set(self)
        try:
            yield
        finally:
            _RECORDER.reset(token)

    @staticmethod
    def current() -> MutationRecorder:
        return _RECORDER.get()

    def record(
        self, *, location: Location, operation: OperationKind, before: object, after: object
    ) -> None:
        self.operations.append(
            Operation(
                location=location,
                kind=operation,
                before=before,
                after=after,
                rule=self.rule,
                reason=self.current_reason,
                pass_number=self.pass_number,
            )
        )


@contextmanager
def mutation(*, reason: str | None = None) -> Iterator[None]:
    recorder = MutationRecorder.current()
    previous = recorder.current_reason
    recorder.current_reason = reason
    try:
        yield
    finally:
        recorder.current_reason = previous


class PathError(ValueError):
    def __init__(self, depth: int) -> None:
        self.depth = depth
        super().__init__("expected a table or array at this path")


class DocumentNode[Native: NativeItem]:
    def __init__(
        self,
        value: Native,
        *,
        location: Location | Callable[[], Location],
        read: Callable[[], Native] | None = None,
        root: Container | None = None,
    ) -> None:
        self._native = value
        self._location = location
        self._read = read
        self._root = root

    @property
    def location(self) -> Location:
        return self._location if isinstance(self._location, Location) else self._location()

    @property
    def item(self) -> Native:
        return self._read() if self._read is not None else self._native

    def copy_native(self) -> Item:
        value = self.item
        if self._root is None or not isinstance(value, Table | AoT | OutOfOrderTableProxy):
            return copy_native(value)

        # A parsed table's trailing block belongs to the following section.
        layout = SectionLayout(self._root)

        try:
            copied = copy_native(self.item)
            if isinstance(value, Table) and isinstance(copied, Table):
                copied.trivia.indent = (
                    "".join(trivia.as_string() for _, trivia in layout.leading.get(id(value), ()))
                    + copied.trivia.indent
                )
            return copied
        finally:
            layout.restore()


type DocumentItem = DocumentString | DocumentValue | DocumentArray | DocumentTables | DocumentTable


class DocumentString(DocumentNode[String]):
    def __init__(
        self,
        value: String,
        *,
        location: Location | Callable[[], Location],
        read: Callable[[], String] | None = None,
        write: Callable[[Item], None] | None = None,
        root: Container | None = None,
    ) -> None:
        super().__init__(value, location=location, read=read, root=root)
        self._write_node = write

    @classmethod
    def from_str(cls, value: str, *, location: Location) -> Self:
        return cls(String.from_raw(value), location=location)

    @property
    def trivia(self) -> Trivia:
        return self.item.trivia

    def set(self, value: str) -> None:
        current = self.item
        if value == current:
            return

        try:
            replacement = String.from_raw(value, type_=current.type)
        except InvalidStringError:
            replacement = String.from_raw(value)

        replacement._trivia = current.trivia
        if self._write_node is None:
            self._native = replacement
        else:
            self._write_node(replacement)


class DocumentValue(DocumentNode[Item]):
    @classmethod
    def from_bool(cls, value: bool, *, location: Location) -> Self:
        return cls(item(value), location=location)

    @property
    def boolean(self) -> bool:
        value = self.item
        if not isinstance(value, Bool):
            raise ManifestError(
                path=self.location.manifest, field=self.location.path, message="expected a boolean"
            )

        return value.value


class DocumentArray(DocumentNode[Array], Iterable[DocumentItem]):
    def __init__(
        self,
        value: Array,
        *,
        location: Location | Callable[[], Location],
        read: Callable[[], Array] | None = None,
        root: Container | None = None,
    ) -> None:
        super().__init__(value, location=location, read=read, root=root)
        self._items: dict[_ArrayItemGroup, DocumentItem] = {}

    @classmethod
    def from_items(cls, values: Iterable[DocumentItem], *, location: Location) -> Self:
        array = Array([], Trivia())
        for value in values:
            array.append(value.copy_native())

        return cls(array, location=location)

    @classmethod
    def from_strings(cls, values: Iterable[str], *, location: Location) -> Self:
        array = Array([], Trivia())
        for value in values:
            array.append(value)

        return cls(array, location=location)

    def __len__(self) -> int:
        return len(self.item)

    def __iter__(self) -> Iterator[DocumentItem]:
        return (self.get(index) for index in range(len(self)))

    def _group(self, index: int) -> _ArrayItemGroup:
        if index < 0:
            index += len(self)

        if not 0 <= index < len(self):
            raise IndexError(index)

        return self.item._value[self.item._index_map[index]]

    def _position(self, group: _ArrayItemGroup) -> int:
        for index, position in self.item._index_map.items():
            if self.item._value[position] is group:
                return index

        raise LookupError(f"An entry in {self.location} was removed after it was read")

    def _write_group(self, group: _ArrayItemGroup, value: Item, *, keep_view: bool = False) -> None:
        index = self._position(group)
        previous = self.item.item(index)
        if equivalent(previous, value):
            return

        recorder = MutationRecorder.current()
        before = description(previous)

        self.item[index] = value
        if not keep_view:
            self._items.pop(group, None)

        recorder.record(
            location=self.location.descend(index),
            operation=OperationKind.SET,
            before=before,
            after=description(value),
        )

    def get(self, index: int) -> DocumentItem:
        group = self._group(index)
        if group not in self._items:

            def read() -> NativeItem:
                self._position(group)
                if self._items.get(group) is not view or group.value is None:
                    raise LookupError(
                        f"An entry in {self.location} was removed or replaced after it was read"
                    )
                return group.value

            view = _wrap(
                read_node=self.item.item(index),
                location=lambda: self.location.descend(self._position(group)),
                read=read,
                write=lambda value: self._write_group(group, value, keep_view=True),
                root=self._root,
            )
            self._items[group] = view

        return self._items[group]

    def strings(self) -> Iterator[DocumentString]:
        for value in self:
            if not isinstance(value, DocumentString):
                raise ManifestError(
                    path=value.location.manifest,
                    field=value.location.path,
                    message="expected a string",
                )

            yield value

    def tables(self) -> Iterator[DocumentTable]:
        for value in self:
            if not isinstance(value, DocumentTable):
                raise ManifestError(
                    path=value.location.manifest,
                    field=value.location.path,
                    message="expected a table",
                )

            yield value

    def set(self, index: int, value: DocumentItem) -> None:
        match self.get(index), value:
            case DocumentString() as previous, DocumentString():
                previous.set(value.item)
            case DocumentValue() as previous, DocumentValue() if type(previous.item) is type(
                value.item
            ):
                self._write_group(self._group(index), value.copy_native(), keep_view=True)
            case _:
                self._write_group(self._group(index), value.copy_native())

    def _entries(
        self,
    ) -> tuple[list[_ArrayItemGroup], list[list[_ArrayItemGroup]], list[_ArrayItemGroup]]:
        header: list[_ArrayItemGroup] = []
        entries: list[list[_ArrayItemGroup]] = []
        pending: list[_ArrayItemGroup] = []

        for group in self.item._value:
            if group.value is not None and not isinstance(group.value, Null):
                entries.append([*pending, group])
                pending = []
            elif (
                not entries
                and not pending
                and group.comment is not None
                and (group.indent is None or "\n" not in group.indent.s)
            ):
                header.append(group)
            else:
                pending.append(group)

        return header, entries, pending

    def _insert_native(self, index: int, value: Item) -> None:
        array = self.item
        source = array.as_string()

        header, entries, footer = self._entries()
        if index == len(self):
            comma = entries[-1][-1].comma if entries else None
            array._value[:] = (
                [*header, *(group for entry in entries for group in entry)] if entries else []
            )
            array.insert(index, value)

            group = array._value[array._index_map[index]]
            group.comma = comma

            if "\n" in source:
                indent = group.indent.s if group.indent is not None else "    "
                if "\n" not in indent:
                    group.indent = Whitespace("\n" + indent)

            if not entries:
                array._value[:0] = header

            array._value.extend(footer)
        else:
            prefix = entries[index][:-1]
            array.insert(index, value)

            if prefix:
                group = array._value.pop(array._index_map[index])
                position = next(
                    position
                    for position, current in enumerate(array._value)
                    if current is prefix[0]
                )

                group.indent = prefix[0].indent

                array._value.insert(position, group)

        array._reindex()

    def insert(self, index: int, value: DocumentItem) -> None:
        native_value = value.copy_native()

        recorder = MutationRecorder.current()
        index = min(max(index if index >= 0 else len(self) + index, 0), len(self))

        self._insert_native(index, native_value)

        recorder.record(
            location=self.location.descend(index),
            operation=OperationKind.INSERT,
            before=None,
            after=description(native_value),
        )

    def delete(self, index: int) -> None:
        group = self._group(index)
        index = self._position(group)

        recorder = MutationRecorder.current()

        before = description(self.item.item(index))
        _, entries, _ = self._entries()

        leading = entries[index][:-1]
        del self.item[index]

        self.item._value[:] = [
            current
            for current in self.item._value
            if all(current is not trivia for trivia in leading)
        ]

        self.item._reindex()
        self._items.pop(group, None)

        recorder.record(
            location=self.location.descend(index),
            operation=OperationKind.DELETE,
            before=before,
            after=None,
        )

    def permute(self, order: Sequence[int]) -> None:
        header, entries, footer = self._entries()
        if sorted(order) != list(range(len(entries))):
            raise ValueError("expected a permutation of the array's indices")

        if list(order) == list(range(len(entries))):
            return

        recorder = MutationRecorder.current()

        array = self.item
        before = array.as_string()
        separators = [(entry[-1].indent, entry[-1].comma) for entry in entries]
        prefixes = [[group for group in entry if group.is_whitespace()] for entry in entries]

        reordered = [
            [group for group in entries[index] if not group.is_whitespace()] for index in order
        ]

        for entry, prefix, (indent, comma) in zip(reordered, prefixes, separators, strict=True):
            value = entry[-1]

            if len(entry) == 1:
                value.indent = indent
            elif indent is not None and "," in indent.s:
                prefix.append(_ArrayItemGroup(indent=indent))

            if value.comment is not None and comma is not None and "\n" in comma.s:
                comma = Whitespace(comma.s.replace("\r", "").replace("\n", ""))

            value.comma = comma

        groups = [
            *header,
            *(
                group
                for prefix, entry in zip(prefixes, reordered, strict=True)
                for group in (*prefix, *entry)
            ),
            *footer,
        ]
        newline = "\r\n" if "\r\n" in before else "\n"
        if groups[-1].comment is not None:
            groups.append(_ArrayItemGroup(indent=Whitespace(newline)))

        for previous, following in pairwise(groups):
            if previous.comment is not None and (
                following.indent is None or "\n" not in following.indent.s
            ):
                whitespace = following.indent.s if following.indent is not None else ""
                following.indent = Whitespace(newline + whitespace)

        array._value[:] = groups
        list.__setitem__(array, slice(None), [entry[-1].value for entry in reordered])
        array._reindex()

        recorder.record(
            location=self.location,
            operation=OperationKind.SORT,
            before=before,
            after=array.as_string(),
        )

    def sort_by(self, key: Callable[[DocumentItem], SupportsRichComparison]) -> None:
        self.permute(sorted(range(len(self)), key=lambda index: key(self.get(index))))


class DocumentTables(DocumentNode[AoT]):
    def __init__(
        self,
        value: AoT,
        *,
        location: Location | Callable[[], Location],
        write: Callable[[Item], None],
        read: Callable[[], AoT] | None = None,
        root: Container | None = None,
    ) -> None:
        super().__init__(value, location=location, read=read, root=root)
        self._write_node = write

    def __len__(self) -> int:
        return len(self.item)

    def _position(self, table: Table) -> int:
        for index, current in enumerate(self.item):
            if current is table:
                return index

        raise LookupError(f"An entry in {self.location} was removed after it was read")

    def _read_table(self, table: Table) -> Table:
        self._position(table)
        return table

    def get(self, index: int) -> DocumentTable:
        table = self.item[index]
        return DocumentTable(
            table,
            location=lambda: self.location.descend(self._position(table)),
            read=lambda: self._read_table(table),
            root=self._root,
        )

    def __iter__(self) -> Iterator[DocumentTable]:
        return (self.get(index) for index in range(len(self)))

    def insert(self, index: int, value: DocumentTable) -> None:
        copied = value.copy_native()
        if not isinstance(copied, Table):
            raise TypeError("expected a header table")

        entries = list(self.item)
        entries.insert(index, copied)

        self._write_node(AoT(entries, parsed=True))

    def delete(self, index: int) -> None:
        entries = list(self.item)
        del entries[index]

        self._write_node(AoT(entries, parsed=True))


class DocumentTable[Native: NativeTable](DocumentNode[Native], Iterable[str]):
    def __init__(
        self,
        value: Native,
        *,
        location: Location | Callable[[], Location],
        read: Callable[[], Native] | None = None,
        root: Container | None = None,
    ) -> None:
        super().__init__(value, location=location, read=read, root=root)
        self._items: dict[str, DocumentItem] = {}

    @staticmethod
    def from_entries(
        entries: Iterable[tuple[str, DocumentItem]],
        *,
        location: Location,
        inline: bool = False,
    ) -> DocumentTable[Table | InlineTable]:
        table = (
            InlineTable(Container(), Trivia(), new=True)
            if inline
            else Table(Container(), Trivia(), False)
        )

        for name, value in entries:
            table[name] = value.copy_native()

        return DocumentTable(table, location=location)

    def __iter__(self) -> Iterator[str]:
        return iter(self.item)

    def __len__(self) -> int:
        return len(self.item)

    def _read_key(self, name: str) -> NativeItem:
        if name not in self.item:
            raise LookupError(f"{self.location.descend(name)} was removed after it was read")

        return native(self.item, name)

    def _write(self, name: str, value: Item, *, keep_view: bool = False) -> None:
        previous = self.get(name)
        if previous is not None and equivalent(previous.item, value):
            return

        recorder = MutationRecorder.current()
        before = description(previous.item) if previous is not None else None
        layout = (
            SectionLayout(self._root)
            if self._root is not None
            and previous is not None
            and isinstance(previous.item, Table | AoT | OutOfOrderTableProxy)
            else None
        )

        try:
            assign_native(self.item, name, value)
        finally:
            if layout is not None:
                layout.restore()

        if not keep_view:
            self._items.pop(name, None)

        recorder.record(
            location=self.location.descend(name),
            operation=OperationKind.SET,
            before=before,
            after=description(value),
        )

    def get(self, name: str) -> DocumentItem | None:
        if name not in self.item:
            return None

        if name not in self._items:

            def read() -> NativeItem:
                if self._items.get(name) is not view:
                    raise LookupError(
                        f"{self.location.descend(name)} was removed or replaced after it was read"
                    )

                return self._read_key(name)

            view = _wrap(
                read_node=self._read_key(name),
                location=lambda: self.location.descend(name),
                read=read,
                write=lambda value: self._write(name, value, keep_view=True),
                root=self._root,
            )

            self._items[name] = view
        return self._items[name]

    def __getitem__(self, name: str) -> DocumentItem:
        value = self.get(name)
        if value is None:
            raise KeyError(name)

        return value

    def items(self) -> Iterator[tuple[str, DocumentItem]]:
        return ((name, self[name]) for name in self)

    def set(self, name: str, value: DocumentItem) -> None:
        match self.get(name), value:
            case DocumentString() as previous, DocumentString():
                previous.set(value.item)
            case DocumentValue() as previous, DocumentValue() if type(previous.item) is type(
                value.item
            ):
                self._write(name, value.copy_native(), keep_view=True)
            case _:
                self._write(name, value.copy_native())

    def delete(self, name: str) -> None:
        previous = self.get(name)
        if previous is None:
            return

        recorder = MutationRecorder.current()

        before = description(previous.item)
        layout = SectionLayout(self._root) if self._root is not None else None

        try:
            remove_native(self.item, name)
        finally:
            if layout is not None:
                layout.restore()

        self._items.pop(name, None)

        recorder.record(
            location=self.location.descend(name),
            operation=OperationKind.DELETE,
            before=before,
            after=None,
        )

    def at(self, path: LocationPath) -> DocumentItem | None:
        node: DocumentItem = self

        for depth, key in enumerate(path):
            match node, key:
                case DocumentTable(), str():
                    child = node.get(key)
                    if child is None:
                        return None
                    node = child
                case ((DocumentArray() | DocumentTables()), int()):
                    node = node.get(key)
                case _:
                    raise PathError(depth)

        return node

    def expect[View: DocumentItem](self, path: LocationPath, expected: type[View]) -> View | None:
        try:
            value = self.at(path)
        except PathError as error:
            raise ManifestError(
                path=self.location.manifest,
                field=(*self.location.path, *path[: error.depth]),
                message=str(error),
            ) from error

        if value is None or isinstance(value, expected):
            return value

        raise ManifestError(
            path=value.location.manifest,
            field=value.location.path,
            message=f"expected a {expected.__name__.removeprefix('Document').lower()}",
        )

    def boolean(self, path: LocationPath) -> bool | None:
        value = self.expect(path, DocumentValue)
        return value.boolean if value is not None else None

    def assign(self, *, field: LocationPath, value: DocumentItem) -> None:
        if not field:
            raise ValueError("cannot replace the document root")

        parent = self.at(field[:-1])
        match parent, field[-1]:
            case DocumentTable(), str() as name:
                parent.set(name, value)
            case DocumentArray(), int() as index:
                if index == len(parent):
                    parent.insert(index, value)
                else:
                    parent.set(index, value)
            case None, _:
                for depth, name in enumerate(field):
                    ancestor = self.at(field[:depth])
                    if (
                        isinstance(ancestor, DocumentTable)
                        and isinstance(name, str)
                        and ancestor.get(name) is None
                    ):
                        prepared = value.copy_native()
                        for component in reversed(field[depth + 1 :]):
                            if not isinstance(component, str):
                                raise PathError(depth)

                            table = Table(Container(), Trivia(), False, is_super_table=True)
                            table[component] = prepared

                            prepared = table

                        ancestor._write(name, prepared)
                        return

                raise PathError(len(field) - 1)
            case _:
                raise PathError(len(field) - 1)

    def remove(self, field: LocationPath) -> None:
        if not field:
            raise ValueError("cannot delete the document root")

        parent = self.at(field[:-1])
        match parent, field[-1]:
            case None, _:
                return
            case DocumentTable(), str() as name:
                parent.delete(name)
            case ((DocumentArray() | DocumentTables()), int() as index):
                parent.delete(index)
            case _:
                raise PathError(len(field) - 1)

        for depth in reversed(range(1, len(field))):
            ancestor = self.at(field[:depth])
            if (
                not isinstance(ancestor, DocumentTable)
                or not isinstance(ancestor.item, Table)
                or len(ancestor)
                or not ancestor.item.is_super_table()
            ):
                break

            grandparent = self.at(field[: depth - 1])
            name = field[depth - 1]

            if isinstance(grandparent, DocumentTable) and isinstance(name, str):
                remove_native(grandparent.item, name)
                grandparent._items.pop(name, None)

    def set_string(self, path: LocationPath, value: str | None) -> None:
        if value is None:
            self.remove(path)
        else:
            self.assign(
                field=path,
                value=DocumentString.from_str(
                    value,
                    location=Location(
                        manifest=self.location.manifest, path=(*self.location.path, *path)
                    ),
                ),
            )

    def set_boolean(self, path: LocationPath, value: bool) -> None:
        self.assign(
            field=path,
            value=DocumentValue.from_bool(
                value,
                location=Location(
                    manifest=self.location.manifest, path=(*self.location.path, *path)
                ),
            ),
        )


def _wrap(
    *,
    read_node: NativeItem,
    location: Location | Callable[[], Location],
    read: Callable[[], NativeItem],
    write: Callable[[Item], None],
    root: Container | None,
) -> DocumentItem:
    def current[Native: NativeItem](expected: type[Native] | tuple[type[Native], ...]) -> Native:
        value = read()
        if not isinstance(value, expected):
            raise LookupError("A document item changed type after it was read")

        return value

    match read_node:
        case String():
            return DocumentString(
                read_node, location=location, read=lambda: current(String), write=write, root=root
            )
        case Array():
            return DocumentArray(
                read_node, location=location, read=lambda: current(Array), root=root
            )
        case AoT():
            return DocumentTables(
                read_node, location=location, read=lambda: current(AoT), write=write, root=root
            )
        case Container() | Table() | InlineTable() | OutOfOrderTableProxy():
            return DocumentTable(
                read_node,
                location=location,
                read=lambda: current((Container, Table, InlineTable, OutOfOrderTableProxy)),
                root=root,
            )
        case _:
            return DocumentValue(
                read_node, location=location, read=lambda: current(Item), root=root
            )


class Document(DocumentTable[Container]):
    def __init__(self, *, path: Path, source: str) -> None:
        document = parse(source)
        super().__init__(document, location=Location(manifest=path, path=()), root=document)

    def render(self) -> str:
        return self.item.as_string()

    def sort_sections(self, key: Callable[[tuple[str, ...]], SupportsRichComparison]) -> None:
        root = self.item

        paths = dict.fromkeys(section_paths(root))
        ranks = {path: index for index, path in enumerate(sorted(paths, key=key))}

        recorder = MutationRecorder.current()

        before = self.render()
        layout = SectionLayout(root)

        try:
            rebuild(root, order_sections(root.body, ranks=ranks, prefix=()))
        finally:
            layout.restore()

        after = self.render()
        if before != after:
            recorder.record(
                location=self.location, operation=OperationKind.SECTIONS, before=before, after=after
            )

    def inline_array_of_tables(self, field: LocationPath) -> None:
        node = self.at(field)
        if not isinstance(node, DocumentTables):
            return

        root = self.item
        entries = node.item
        if any(
            isinstance(value, Table | AoT) for entry in entries for _, value in entry.value.body
        ):
            raise TypeError("Nested tables cannot be made inline")

        recorder = MutationRecorder.current()

        before = description(entries)
        layout = SectionLayout(root)
        array = Array([], Trivia())
        heading: Body = []

        for index, entry in enumerate(entries):
            inline = InlineTable(Container(), Trivia(), new=True)
            comments = layout.leading.pop(id(entry), [])

            if index == 0:
                heading, comments = comments, []

            if entry.trivia.comment:
                comments.append((None, Comment(Trivia(comment=entry.trivia.comment))))

            for name, value in entry.value.body:
                if name is None:
                    if isinstance(value, Comment):
                        comments.append((None, value))

                    continue

                if value.trivia.comment:
                    comments.append((None, Comment(Trivia(comment=value.trivia.comment))))

                copied = copy_native(value)
                copied.trivia.comment = copied.trivia.comment_ws = ""
                copied.trivia.indent = copied.trivia.trail = ""
                inline[name] = copied

            for _, comment in comments:
                if isinstance(comment, Comment):
                    array._value.append(
                        _ArrayItemGroup(
                            indent=Whitespace("\n    "),
                            value=Null(),
                            comment=Comment(Trivia(comment=comment.trivia.comment, trail="")),
                        )
                    )

            rebuild(
                inline.value, [(None, Whitespace(" ")), *inline.value.body, (None, Whitespace(" "))]
            )

            array.add_line(inline, indent="    ")

        array.add_line(indent="")

        parent = self.at(field[:-1])
        name = field[-1]

        if not isinstance(parent, DocumentTable) or not isinstance(name, str):
            raise PathError(len(field) - 1)

        assign_native(parent.item, name, array)
        parent._items.pop(name, None)

        if heading:
            prepend_assignment(parent.item, name, heading)

        layout.restore()

        recorder.record(
            location=node.location,
            operation=OperationKind.INLINE,
            before=before,
            after=array.as_string(),
        )
