"""Ergonomic and type-safe filter paths.

To start using this module, choose where you need to "start",
depending on the query this will be either: `DataTypeQueryPath`,
`PropertyTypeQueryPath`, `EntityTypeQueryPath`, or `EntityQueryPath`.
"""

from graph_sdk.filter.path import (
    DataTypeQueryPath,
    EntityQueryPath,
    EntityTypeQueryPath,
    PropertyTypeQueryPath,
)

__all__ = [
    "EntityQueryPath",
    "EntityTypeQueryPath",
    "PropertyTypeQueryPath",
    "DataTypeQueryPath",
]
