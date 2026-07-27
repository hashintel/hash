"""In-place editing of parsed TOML documents.

:func:`navigate_to_table` and :func:`navigate_to_array` descend to a node along a
key path, creating missing levels and validating the shape of what they
find. :func:`reconcile_string_array` rewrites a managed array to an expected
value set, and :func:`array_to_str` exposes array elements for string-only
processing.

Edits are local: everything an edit leaves alone keeps its comments,
ordering, and formatting, so a manifest survives a parse-adjust-dump
round-trip faithfully.
"""

from collections.abc import Generator, Iterable, MutableMapping, Sequence
from typing import TypeIs

import tomlkit
from tomlkit.items import Array, String

from repo_chores.workspace import WorkspaceError

type TomlTable = MutableMapping[str, object]
"""A live table node inside a parsed tomlkit document."""


def is_table(value: object, /) -> TypeIs[TomlTable]:
    """Narrow a tomlkit node to a live table.

    Indexing a parsed document yields :class:`Table` nodes, or
    :class:`OutOfOrderTableProxy` nodes for a super-table whose subtables are
    split across the file. Both are mutable mappings with string keys, and
    both preserve trivia through mutation, so the narrowed type accepts
    either.
    """
    return isinstance(value, MutableMapping)


def navigate_to_table(table: TomlTable, /, *, path: Iterable[str]) -> TomlTable:
    """Descend to (creating, if necessary) the table at `path`.

    Raises :exc:`WorkspaceError` when a key on the way holds a non-table value.
    """
    for key in path:
        if key not in table:
            table[key] = tomlkit.table()

        value = table[key]
        if not is_table(value):
            raise WorkspaceError(f"expected a table at [{key}], found {type(value).__name__}")

        table = value

    return table


def navigate_to_array(table: TomlTable, /, *, path: Sequence[str]) -> Array:
    """Descend to (creating, if necessary) the array at `path`.

    Raises :exc:`WorkspaceError` when the final key holds a non-array value.
    """
    [*prefix, key] = path
    table = navigate_to_table(table, path=prefix)
    if key not in table:
        table[key] = tomlkit.array()

    value = table[key]
    if not isinstance(value, Array):
        raise WorkspaceError(f"expected an array at `{key}`, found {type(value).__name__}")

    return value


def array_to_str(array: Array, /) -> Generator[str | None]:
    """Yield each array element as a string, or None for elements of other types."""
    for item in array:
        yield item if isinstance(item, String) else None


def insert_sorted(array: Array, value: str, /) -> None:
    """Insert `value` before the first larger element, keeping a sorted array sorted."""
    for index, item in enumerate(array):
        if item > value:
            array.insert(index, value)
            return

    array.append(value)


def reconcile_string_array(array: Array, /, *, expected: Sequence[str]) -> None:
    """Mutate a strings-only array to exactly the sorted `expected` values.

    Stale and duplicate entries are removed, missing ones inserted in sorted
    position. Surviving entries are untouched, so their comments and
    formatting are preserved.
    """
    remaining = set(expected)
    for index in reversed(range(len(array))):
        item = array[index]
        if item in remaining:
            remaining.discard(item)
        else:
            del array[index]

    if not array:
        array.multiline(multiline=True)
    for value in remaining:
        insert_sorted(array, value)
