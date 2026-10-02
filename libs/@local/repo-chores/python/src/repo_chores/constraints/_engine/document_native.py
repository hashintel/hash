"""Native TOML ownership, comparison and section layout operations."""

from collections.abc import Iterator
from copy import deepcopy

from tomlkit import parse
from tomlkit.container import Container, OutOfOrderTableProxy
from tomlkit.items import (
    AoT,
    Array,
    Bool,
    InlineTable,
    Item,
    Key,
    Null,
    String,
    Table,
    Trivia,
    Whitespace,
)

type NativeTable = Container | Table | InlineTable | OutOfOrderTableProxy
type NativeItem = Item | NativeTable
type Body = list[tuple[Key | None, Item]]


def native(table: NativeTable, name: str) -> NativeItem:
    return (
        table._internal_container.item(name)
        if isinstance(table, OutOfOrderTableProxy)
        else table.item(name)
    )


def copy_native(value: NativeItem) -> Item:
    match value:
        case OutOfOrderTableProxy():
            return Table(deepcopy(value._internal_container), Trivia(), False)
        case Container():
            return Table(deepcopy(value), Trivia(), False)
        case _:
            return deepcopy(value)


def equivalent(left: NativeItem, right: NativeItem) -> bool:
    match left, right:
        case (
            (Container() | Table() | InlineTable() | OutOfOrderTableProxy()),
            (Container() | Table() | InlineTable() | OutOfOrderTableProxy()),
        ):
            return len(left) == len(right) and all(
                name in right and equivalent(native(left, name), native(right, name))
                for name in left
            )
        case Array(), Array():
            return len(left) == len(right) and all(
                equivalent(left.item(index), right.item(index)) for index in range(len(left))
            )
        case AoT(), AoT():
            return len(left) == len(right) and all(
                equivalent(first, second) for first, second in zip(left, right, strict=True)
            )
        case Bool(), Bool():
            return left.value == right.value
        case _:
            return type(left) is type(right) and left == right


def description(value: NativeItem) -> object:
    match value:
        case String():
            return str(value)
        case OutOfOrderTableProxy():
            return value._internal_container.as_string()
        case _:
            return value.as_string()


def assign_native(table: NativeTable, name: str, value: Item) -> None:
    if (
        isinstance(table, OutOfOrderTableProxy)
        and name in table
        and isinstance(native(table, name), AoT | Table | OutOfOrderTableProxy)
    ):
        # Deleting the key preserves unrelated fields in split table fragments.
        del table[name]
    table[name] = value


def remove_native(table: NativeTable, name: str) -> None:
    del table[name]


def rebuild(container: Container, rows: Body) -> None:
    container._body.clear()
    container._map.clear()
    container._table_keys.clear()
    container._validation_cache.clear()
    container._out_of_order_keys.clear()
    dict.clear(container)
    for name, value in rows:
        container._raw_append(name, value)


def _has_header(key: Key, table: Table) -> bool:
    if not table.is_super_table():
        return True
    if key.is_dotted():
        return False
    return any(
        not isinstance(value, Table | AoT | Whitespace | Null)
        or (name is not None and name.is_dotted() and isinstance(value, Table))
        for name, value in table.value.body
    )


def _is_section(name: Key, value: Item) -> bool:
    return isinstance(value, AoT) or (isinstance(value, Table) and not name.is_dotted())


class SectionLayout:
    """Temporarily lift inter-section trivia off the preceding table's native body."""

    def _heading(self, table: Table, pending: Body) -> None:
        if table.trivia.indent:
            pending = [*pending, *parse(table.trivia.indent).body]
            table.trivia.indent = ""

        if self._seen_header:
            self.leading[id(table)] = pending
        else:
            self.preamble = pending
            self._seen_header = True

    def _extract(self, container: Container, pending: Body) -> Body:
        rows: Body = []
        for name, value in container.body:
            match name, value:
                case _, Null():
                    continue
                case None, _:
                    pending.append((name, value))
                    continue
                case Key() as name, Table():
                    if _has_header(name, value):
                        self._heading(value, pending)
                        pending = []

                    pending = self._extract(value.value, pending)
                case _, AoT():
                    for entry in value:
                        self._heading(entry, pending)
                        pending = self._extract(entry.value, [])
                case _:
                    rows.extend(pending)
                    pending = []

            rows.append((name, value))

        rebuild(container, rows)
        return pending

    def __init__(self, root: Container) -> None:
        self.root = root
        self.leading: dict[int, Body] = {}
        self.preamble: Body = []
        self._seen_header = False
        self.footer = self._extract(root, [])

    def _restore(self, container: Container) -> None:
        for _, value in container.body:
            match value:
                case Table():
                    tables = (value,)
                case AoT():
                    tables = value
                case _:
                    continue

            for table in tables:
                block = self.leading.pop(id(table), [])

                # Comments in a super-table's body would create a parent header.
                table.trivia.indent = (
                    "".join(trivia.as_string() for _, trivia in block) + table.trivia.indent
                )
                self._restore(table.value)

    def restore(self) -> None:
        self._restore(self.root)
        rows = list(self.root.body)

        first = next(
            (
                index
                for index, (name, value) in enumerate(rows)
                if name is not None and _is_section(name, value)
            ),
            len(rows),
        )

        rows[first:first] = self.preamble
        rebuild(self.root, [*rows, *self.footer])


def section_paths(container: Container, prefix: tuple[str, ...] = ()) -> Iterator[tuple[str, ...]]:
    for name, value in container.body:
        if name is None:
            continue

        path = (*prefix, name.key)
        match value:
            case Table():
                yield path
                yield from section_paths(value.value, path)
            case AoT():
                yield path
                for entry in value:
                    yield from section_paths(entry.value, path)


def order_sections(
    rows: Body, *, ranks: dict[tuple[str, ...], int], prefix: tuple[str, ...]
) -> Body:
    leaves: Body = []
    sections: dict[str, list[tuple[Key, Table | AoT]]] = {}
    for name, value in rows:
        if name is not None and isinstance(value, Table | AoT) and _is_section(name, value):
            sections.setdefault(name.key, []).append((name, value))
        else:
            leaves.append((name, value))

    for name in sorted(sections, key=lambda name: ranks[*prefix, name]):
        fragments = sections[name]
        native_key, first = fragments[0]
        path = (*prefix, name)

        match first:
            case AoT():
                entries = [
                    entry
                    for _, fragment in fragments
                    if isinstance(fragment, AoT)
                    for entry in fragment
                ]

                first.body[:] = entries
                list.__setitem__(first, slice(None), entries)
                for entry in entries:
                    rebuild(
                        entry.value,
                        order_sections(list(entry.value.body), ranks=ranks, prefix=path),
                    )

                leaves.append((native_key, first))
            case Table():
                tables = [fragment for _, fragment in fragments if isinstance(fragment, Table)]
                chosen = next((table for table in tables if not table.is_super_table()), first)

                children = [row for table in tables for row in table.value.body]

                rebuild(chosen.value, order_sections(children, ranks=ranks, prefix=path))
                leaves.append((native_key, chosen))

    return leaves


def prepend_assignment(table: NativeTable, name: str, leading: Body) -> None:
    match table:
        case OutOfOrderTableProxy():
            for fragment in table._tables:
                if name in fragment:
                    prepend_assignment(fragment, name, leading)
                    return
        case _:
            container = table if isinstance(table, Container) else table.value

            rows = list(container.body)
            index = next(
                index for index, (key, _) in enumerate(rows) if key is not None and key.key == name
            )

            rows[index:index] = leading
            rebuild(container, rows)
