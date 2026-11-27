"""Tables given as JSON files of rows, as a dlt source."""

import json
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from itertools import starmap
from pathlib import Path

import dlt
from dlt.common.schema import Schema
from dlt.extract import DltSource

DELETED = "deleted"
"""The column that marks a row the source deleted, which the table then deletes."""


@dataclass(frozen=True)
class JsonTable:
    """A table: the file that holds its rows as a JSON array of objects, and its primary key."""

    file: Path
    primary_key: Sequence[str]


def json_source(tables: Mapping[str, JsonTable]) -> DltSource:
    """Return a source with one table per file, each with the rows its file holds now.

    Column names are kept as written, and every column but `deleted` is text, so a table's columns
    stay as the definition names them. A row with `deleted` set to true is deleted from its table.
    """

    def resource(name: str, table: JsonTable) -> object:
        rows = json.loads(table.file.read_text())
        columns: dict[str, dict[str, object]] = {
            column: {"data_type": "text"} for row in rows for column in row if column != DELETED
        }
        columns[DELETED] = {"data_type": "bool", "hard_delete": True}

        def read() -> Iterator[dict[str, object]]:
            yield from rows

        return dlt.resource(read, name=name, primary_key=list(table.primary_key), columns=columns)

    def resources() -> list[object]:
        return list(starmap(resource, tables.items()))

    return dlt.source(resources, schema=Schema("files", normalizers={"names": "direct"}))()
