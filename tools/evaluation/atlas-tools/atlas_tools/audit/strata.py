"""Strata tables: corpus row -> group labels, loaded from parquet.

The on-disk contract is a parquet table with an integer ``row`` column
(unique, non-null corpus row indices) plus one or more string group columns
(e.g. role, language, source, density_decile). Null labels mean "row not in
this group column".
"""

from dataclasses import dataclass
from os import PathLike
from typing import Self

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq


@dataclass(frozen=True)
class StrataTable:
    """Row-aligned group labels.

    ``row`` is a ``(n,)`` int64 array of unique corpus row indices, sorted
    ascending. ``label_columns`` maps each group column name to a ``(n,)``
    object array aligned with ``row`` whose entries are ``str`` labels or
    ``None`` where the source cell was null.
    """

    row: np.ndarray
    label_columns: dict[str, np.ndarray]

    @classmethod
    def from_parquet(cls, path: PathLike) -> Self:
        """Load and validate a strata parquet, naming errors clearly."""
        table = pq.read_table(path)

        if "row" not in table.column_names:
            raise ValueError(f"strata table {path} has no 'row' column")

        row_type = table.schema.field("row").type
        if not pa.types.is_integer(row_type):
            raise ValueError(
                f"strata table {path}: 'row' column must be an integer type,"
                f" got {row_type}"
            )

        row_column = table.column("row")
        if row_column.null_count:
            raise ValueError(f"strata table {path}: 'row' column contains nulls")

        row_values = np.asarray(row_column.to_pylist(), dtype=np.int64)
        order = np.argsort(row_values, kind="stable")
        row_sorted = row_values[order]

        if row_sorted.size and bool(np.any(np.diff(row_sorted) == 0)):
            raise ValueError(f"strata table {path}: duplicate values in 'row' column")

        label_columns: dict[str, np.ndarray] = {}
        for name in table.column_names:
            if name == "row":
                continue

            values = table.column(name).to_pylist()
            for value in values:
                if value is not None and not isinstance(value, str):
                    raise ValueError(
                        f"strata table {path}: group column {name!r} must"
                        f" contain string labels, got {type(value).__name__}"
                    )

            label_columns[name] = np.array(values, dtype=object)[order]

        if not label_columns:
            raise ValueError(f"strata table {path} has no group columns besides 'row'")

        return cls(row=row_sorted, label_columns=label_columns)

    def labels_for(self, column: str, rows: np.ndarray) -> np.ndarray:
        """Labels of ``column`` aligned with ``rows``.

        Returns a ``(len(rows),)`` object array: the ``str`` label where the
        corpus row is present (and non-null) in the table, ``None`` where it
        is absent or its label cell was null.
        """
        values = self.label_columns[column]
        labels = np.full(len(rows), None, dtype=object)
        if self.row.size == 0:
            return labels

        positions = np.searchsorted(self.row, rows)
        positions = np.minimum(positions, self.row.size - 1)
        found = self.row[positions] == rows
        labels[found] = values[positions[found]]
        return labels
