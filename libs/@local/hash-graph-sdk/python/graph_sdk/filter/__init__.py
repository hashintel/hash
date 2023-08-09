"""Ergonomic and type-safe filter paths.

To start using this module, choose where you need to "start",
depending on the query this will be either: `DataTypePath`,
`PropertyTypePath`, `EntityTypePath`, or `EntityPath`.
"""

from graph_sdk.filter.path import (
    DataTypePath,
    EntityPath,
    EntityTypePath,
    PropertyTypePath,
)

__all__ = [
    "EntityPath",
    "EntityTypePath",
    "PropertyTypePath",
    "DataTypePath",
]
