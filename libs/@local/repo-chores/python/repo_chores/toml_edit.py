"""In-place editing of parsed TOML documents.

:func:`navigate_to_table` and :func:`navigate_to_array` descend to a node along a
key path, creating missing levels and validating the shape of what they
find. :func:`reconcile_string_array` rewrites a managed array to its canonical
form, carrying every comment with the element it documents, and
:func:`array_to_str` exposes array elements for string-only processing.

Edits are local: everything outside the node being edited keeps its comments,
ordering, and formatting, so a manifest survives a parse-adjust-dump
round-trip faithfully.
"""

from collections.abc import Generator, Iterable, Mapping, MutableMapping, Sequence
from typing import TypeIs

import tomlkit
from tomlkit.items import Array, Comment, String, _ArrayItemGroup

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


def _element_groups(array: Array, /) -> list[_ArrayItemGroup]:
    """Return the array's element groups: each element together with its own trivia.

    tomlkit parses an array into element/indent/comma/comment groups and keeps
    them beside the element list, with no public accessor for a comment. A
    comment line of its own parses as a group whose value is null, and a
    trailing comment parses onto its element's group. Reconciliation moves
    elements, so it reads and writes those groups to keep every comment with
    the element it annotates; working through the element list alone would
    leave each comment at the position it happened to parse at.
    `tests/test_toml_edit.py` pins the behavior, so a tomlkit release that
    reshapes the groups fails there instead of silently misplacing comments.
    """
    return array._value  # noqa: SLF001 — tomlkit exposes element trivia nowhere else.


def _comments_by_element(array: Array, /) -> dict[str, Comment]:
    """Index the trailing comment of every string element by that element's value.

    A value repeated with two different comments keeps the last one in document
    order; deduplication leaves one entry to carry it.
    """
    comments: dict[str, Comment] = {}
    for group in _element_groups(array):
        if isinstance(group.value, String) and group.comment is not None:
            comments[str(group.value)] = group.comment

    return comments


def _attach_comments(array: Array, /, *, comments: Mapping[str, Comment]) -> None:
    """Give every string element the comment indexed for its value, or none."""
    for group in _element_groups(array):
        if isinstance(group.value, String):
            group.comment = comments.get(str(group.value))


def _is_comment_line(group: _ArrayItemGroup, /) -> bool:
    """Report whether a group is a comment occupying a line of its own."""
    return group.comment is not None and not isinstance(group.value, String)


def _comment_lines_by_element(
    array: Array, /
) -> tuple[dict[str, list[_ArrayItemGroup]], list[_ArrayItemGroup]]:
    """Index each run of comment lines by the value of the element below it.

    A comment on a line of its own documents the line below it, so a run of
    them belongs to the element that follows and moves with it. Runs are
    returned by element value, together with the run that follows the last
    element and therefore documents nothing — that one keeps its place at the
    end of the array. Two runs on a repeated value merge onto the one entry
    deduplication leaves.
    """
    runs: dict[str, list[_ArrayItemGroup]] = {}
    pending: list[_ArrayItemGroup] = []

    for group in _element_groups(array):
        if _is_comment_line(group):
            pending.append(group)
        elif isinstance(group.value, String) and pending:
            runs.setdefault(str(group.value), []).extend(pending)
            pending = []

    return runs, pending


def _place_comment_lines(
    array: Array,
    /,
    *,
    runs: Mapping[str, list[_ArrayItemGroup]],
    trailing: Sequence[_ArrayItemGroup],
) -> None:
    """Move every run of comment lines back above the element it documents.

    A run whose element is gone goes with it, the same way a trailing comment
    does not outlive the element it sat beside.
    """
    groups = _element_groups(array)
    placed: list[_ArrayItemGroup] = []
    for group in groups:
        if _is_comment_line(group):
            continue

        if isinstance(group.value, String):
            placed.extend(runs.get(str(group.value), ()))

        placed.append(group)

    # The closing whitespace of a multiline array stays last, so an ownerless
    # run is inserted ahead of it rather than after the bracket.
    end = len(placed)
    while end > 0 and placed[end - 1].is_whitespace():
        end -= 1
    placed[end:end] = trailing

    groups[:] = placed
    array._reindex()  # noqa: SLF001 — the element index map is derived from the group order.


def reconcile_string_array(array: Array, /, *, expected: Sequence[str]) -> None:
    """Rewrite a strings-only array to the sorted, deduplicated `expected` values.

    Sorted order is the canonical form of a managed array: a check that
    compares against it and an apply pass that produces it agree, so a
    hand-reordered array is a deviation that apply mode clears rather than a
    permanent finding. Stale and duplicate elements go and missing ones arrive.

    Comments move with what they document. A comment trailing an element
    follows that element to its new position; a comment on a line of its own
    documents the line below it, so a run of them travels above the element
    that follows, and a run after the last element keeps its place at the end.
    A comment whose element is gone goes with it.

    The array's layout is left alone: elements keep the indentation and
    separators of the positions they occupy, so a single-line array stays on
    one line and a multiline array keeps one element per line. An array that
    was empty becomes multiline, matching how a managed array is written by
    hand.

    The caller owns one precondition, reported as an unfixable finding where it
    fails: the array contains strings only.
    """
    values = sorted(set(expected))
    comments = _comments_by_element(array)
    comment_lines, trailing_comment_lines = _comment_lines_by_element(array)

    if not array and values:
        array.multiline(multiline=True)

    for index in reversed(range(len(values), len(array))):
        del array[index]
    for value in values[len(array) :]:
        array.append(value)

    for index, value in enumerate(values):
        if array[index] != value:
            array[index] = value

    _attach_comments(array, comments=comments)
    _place_comment_lines(array, runs=comment_lines, trailing=trailing_comment_lines)
