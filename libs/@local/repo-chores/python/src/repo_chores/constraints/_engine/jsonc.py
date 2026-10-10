"""Preserving JSONC edits over json-five's native syntax tree."""

import copy
import json
from collections.abc import Iterable
from pathlib import Path
from typing import Never

from json5.dumper import ModelDumper
from json5.model import (
    Comment,
    DoubleQuotedString,
    JSONArray,
    JSONObject,
    JSONText,
    LineComment,
    Node,
    String,
    TrailingComma,
    Value,
    walk,
)
from json5.parser import parse_source

from repo_chores.constraints._engine.diagnostics import ManifestError
from repo_chores.constraints._engine.document import MutationRecorder, OperationKind
from repo_chores.constraints._engine.location import Location

type Trivia = list[str | Comment]


def _reject_constant(value: str) -> Never:
    raise ValueError(f"JSONC does not support {value}")


def _dump(node: Node) -> str:
    dumper = ModelDumper()
    dumper.dump(node)
    dumper.env.outfile.seek(0)
    return dumper.env.outfile.read()


def _whitespace(trivia: Trivia) -> Trivia:
    result: Trivia = []

    for entry in trivia:
        if isinstance(entry, str):
            if entry.strip(" \t\r\n"):
                raise ValueError("JSONC requires JSON whitespace")
            result.append(entry)

    return result


def _strict_text(node: Node) -> str:
    """Remove only parsed comments and trailing commas, retaining raw tokens."""
    plain = copy.deepcopy(node)

    # Snapshot the walk before removing nodes, including comma trivia.
    for entry in list(walk(plain)):
        entry.wsc_before = _whitespace(entry.wsc_before)
        entry.wsc_after = _whitespace(entry.wsc_after)
        if isinstance(entry, JSONArray | JSONObject):
            entry.leading_wsc = _whitespace(entry.leading_wsc)
            entry.trailing_comma = None

    return _dump(plain)


def _parse(source: str) -> JSONText:
    model = parse_source(source)
    # Never let a library normalization silently alter unrelated bytes.
    if _dump(model) != source:
        raise ValueError("JSONC could not be read without changing its spelling")

    json.loads(_strict_text(model), parse_constant=_reject_constant)
    return model


def _string(value: str) -> DoubleQuotedString:
    return DoubleQuotedString(value, raw_value=json.dumps(value, ensure_ascii=False))


def _line(trivia: Trivia) -> tuple[Trivia, Trivia]:
    """Separate same-line trivia from the following line or closing block."""
    for index, entry in enumerate(trivia):
        if isinstance(entry, str) and ("\n" in entry or "\r" in entry):
            boundary = min(
                position for position in (entry.find("\n"), entry.find("\r")) if position >= 0
            )
            return [*trivia[:index], entry[:boundary]], [entry[boundary:], *trivia[index + 1 :]]
    return trivia.copy(), []


def _spacing(nodes: Iterable[Node]) -> str:
    for node in nodes:
        for entry in reversed(node.wsc_before):
            if isinstance(entry, str) and "\n" in entry:
                return "\n" + entry.rsplit("\n", maxsplit=1)[1]
    return " "


def _append(container: JSONObject | JSONArray, *, node: Node, value: Value) -> None:
    spacing = _spacing(container.keys if isinstance(container, JSONObject) else container.values)
    if container.values:
        tail = container.trailing_comma or container.values[-1]
        inline, closing = _line(tail.wsc_after)
        tail.wsc_after = []

        if any(isinstance(entry, LineComment) for entry in inline) and "\n" not in spacing:
            spacing = "\n" + spacing
        node.wsc_before = [*inline, spacing]

        if container.trailing_comma is not None:
            container.trailing_comma.wsc_after = closing
        else:
            value.wsc_after = closing
    elif container.leading_wsc:
        inline, closing = _line(container.leading_wsc)
        container.leading_wsc = inline

        if any(isinstance(entry, LineComment) for entry in inline) and "\n" not in spacing:
            spacing = "\n" + spacing

        node.wsc_before = [spacing]
        value.wsc_after = closing

    container.values.append(value)
    if isinstance(container, JSONObject):
        if not isinstance(node, String):
            raise TypeError("JSONC object keys must be strings")

        container.keys.append(node)


def _replace_array(array: JSONArray, values: list[str]) -> None:
    retained = min(len(array.values), len(values))
    for index in range(retained):
        current = array.values[index]
        value = values[index]
        if isinstance(current, String):
            if current.characters != value:
                current.characters = value
                current.raw_value = json.dumps(value, ensure_ascii=False)
        else:
            replacement = _string(value)
            replacement.wsc_before = current.wsc_before
            replacement.wsc_after = current.wsc_after
            array.values[index] = replacement

    if len(values) < len(array.values):
        # The prefix after the preceding comma belongs to the surviving entry.
        inline, following = _line(array.values[retained].wsc_before)
        tail = array.trailing_comma or array.values[-1]
        _, closing = _line(tail.wsc_after)
        del array.values[retained:]

        if array.values:
            if any(isinstance(entry, LineComment) for entry in inline):
                if closing and isinstance(closing[0], str):
                    # json-five owns any CR in the comment token. Supply its LF
                    # while retaining the closing block's remaining whitespace.
                    closing[0] = "\n" + closing[0].removeprefix("\r").removeprefix("\n")
                else:
                    # An inline closing bracket still needs the old terminator.
                    closing = following[:1]

            array.trailing_comma = TrailingComma()
            array.trailing_comma.wsc_after = [*inline, *closing]
        else:
            array.trailing_comma = None
            array.leading_wsc.extend(closing)

    for value in values[retained:]:
        node = _string(value)
        _append(array, node=node, value=node)


def _remove(container: JSONObject, index: int) -> None:
    last = index == len(container.values) - 1
    removed = container.values.pop(index)
    del container.keys[index]

    if not container.values:
        tail = container.trailing_comma or removed
        container.leading_wsc.extend(tail.wsc_after)
        container.trailing_comma = None
    elif last and container.trailing_comma is None:
        container.trailing_comma = TrailingComma()
        container.trailing_comma.wsc_after = removed.wsc_after


class JsoncDocument:
    def __init__(self, *, path: Path, source: str) -> None:
        self.path = path
        try:
            self._model = _parse(source)
        except ValueError as error:
            raise ManifestError(path=path, field=(), message=str(error)) from error

    def render(self) -> str:
        return _dump(self._model)

    def _index(self, table: JSONObject, field: tuple[str, ...]) -> int | None:
        matches = [
            index
            for index, key in enumerate(table.keys)
            if isinstance(key, String) and key.characters == field[-1]
        ]

        if len(matches) > 1:
            raise ManifestError(path=self.path, field=field, message="duplicate owned key")

        return matches[0] if matches else None

    def _table(self, model: JSONText, field: tuple[str, ...], *, create: bool) -> JSONObject | None:
        current = model.value
        for depth in range(len(field) + 1):
            if not isinstance(current, JSONObject):
                raise ManifestError(
                    path=self.path, field=field[:depth], message="expected an object"
                )

            if depth == len(field):
                return current

            part = field[: depth + 1]
            index = self._index(current, part)
            if index is None:
                if not create:
                    return None

                child = JSONObject()
                child.wsc_before = [" "]
                _append(current, node=_string(part[-1]), value=child)
                current = child
            else:
                current = current.values[index]

        return None

    def strings(self, field: tuple[str, ...]) -> list[str] | None:
        table = self._table(self._model, field[:-1], create=False)
        index = self._index(table, field) if table is not None else None
        if table is None or index is None:
            return None

        value = table.values[index]
        if not isinstance(value, JSONArray) or not all(
            isinstance(entry, String) for entry in value.values
        ):
            raise ManifestError(path=self.path, field=field, message="expected an array of strings")

        return [entry.characters for entry in value.values if isinstance(entry, String)]

    def _commit(
        self,
        candidate: JSONText,
        field: tuple[str, ...],
        *,
        before: object,
        after: list[str] | None,
    ) -> None:
        # Validate edited syntax before exposing any part of the mutation.
        validated = JsoncDocument(path=self.path, source=_dump(candidate))
        if validated.strings(field) != after:
            raise ManifestError(
                path=self.path, field=field, message="edited JSONC changed the assigned value"
            )

        self._model = validated._model
        MutationRecorder.current().record(
            location=Location(manifest=self.path, path=field),
            operation=OperationKind.DELETE if after is None else OperationKind.SET,
            before=before,
            after=after,
        )

    def assign(self, field: tuple[str, ...], values: Iterable[str] | None) -> None:
        replacement = list(values) if values is not None else None
        candidate = copy.deepcopy(self._model)
        table = self._table(candidate, field[:-1], create=replacement is not None)
        if table is None:
            return

        index = self._index(table, field)
        current = table.values[index] if index is not None else None
        before = json.loads(_strict_text(current)) if current is not None else None
        if replacement is None:
            if index is None:
                return

            _remove(table, index)
        elif isinstance(current, JSONArray):
            if before == replacement:
                return

            _replace_array(current, replacement)
        else:
            array = JSONArray(*(_string(value) for value in replacement))
            for entry in array.values[1:]:
                entry.wsc_before = [" "]
            if current is not None and index is not None:
                array.wsc_before, array.wsc_after = current.wsc_before, current.wsc_after
                table.values[index] = array
            else:
                array.wsc_before = [" "]
                _append(table, node=_string(field[-1]), value=array)

        self._commit(candidate, field, before=before, after=replacement)
