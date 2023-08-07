"""Ergonomic and type-safe filter paths.

To start using this module, choose where you need to "start",
depending on the query this will be either: `DataTypePath`,
`PropertyTypePath`, `EntityTypePath`, or `EntityPath`.
"""
from abc import ABC
from typing import Generic, Self, TypeVar

from graph_client import QueryToken
from graph_client.models import (
    DataTypeQueryToken,
    EntityQueryToken,
    EntityTypeQueryToken,
    PropertyTypeQueryToken,
    Selector,
)

from graph_sdk.query import Path


class AbstractPath(ABC):
    """An abstract path."""

    path: Path

    def __init__(self) -> None:
        """Initialize the filter with a path."""
        self.path = Path()

    @classmethod
    def from_list(cls, value: list[QueryToken]) -> Self:
        """Initialize the filter with a vector."""
        self = cls()
        self.path = Path.from_list(value)
        return self

    @classmethod
    def from_path(cls, path: Path) -> Self:
        """Initialize the filter with a path."""
        self = cls()
        self.path = path
        return self


T = TypeVar("T", bound=AbstractPath)


class SelectorPath(AbstractPath, Generic[T]):
    """A selector is a path that is used to select a value in an array."""

    cls: type[T]

    def set_cls(self, cls: type[T]) -> Self:
        """Set the class of the selector."""
        self.cls = cls
        return self

    def all_(self) -> T:
        """Return the path to all values in an array."""
        return self.cls.from_path(self.path.push(Selector(root="*")))


class DataTypePath(AbstractPath):
    """A path for a data type."""

    def base_url(self) -> Path:
        """Return the path to the base url for a data type."""
        return self.path.push(DataTypeQueryToken.base_url)

    def version(self) -> Path:
        """Return the path to the version for a data type."""
        return self.path.push(DataTypeQueryToken.version)

    def versioned_url(self) -> Path:
        """Return the path to the versioned url for a data type."""
        return self.path.push(DataTypeQueryToken.versioned_url)

    def owned_by_id(self) -> Path:
        """Return the path to the owner id for a data type."""
        return self.path.push(DataTypeQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record created by id for a data type."""
        return self.path.push(DataTypeQueryToken.record_created_by_id)

    def record_archived_by_id(self) -> Path:
        """Return the path to the record archived by id for a data type."""
        return self.path.push(DataTypeQueryToken.record_archived_by_id)

    def title(self) -> Path:
        """Return the path to the title for a data type."""
        return self.path.push(DataTypeQueryToken.title)

    def description(self) -> Path:
        """Return the path to the description for a data type."""
        return self.path.push(DataTypeQueryToken.description)

    def type_(self) -> Path:
        """Return the path to the type for a data type."""
        return self.path.push(DataTypeQueryToken.type)


class PropertyTypePath(AbstractPath):
    """A path for a property type."""

    def base_url(self) -> Path:
        """Return the path to the base url for a property type."""
        return self.path.push(PropertyTypeQueryToken.base_url)

    def version(self) -> Path:
        """Return the path to the version for a property type."""
        return self.path.push(PropertyTypeQueryToken.version)

    def versioned_url(self) -> Path:
        """Return the path to the versioned url for a property type."""
        return self.path.push(PropertyTypeQueryToken.versioned_url)

    def owned_by_id(self) -> Path:
        """Return the path to the owner id for a property type."""
        return self.path.push(PropertyTypeQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record created by id for a property type."""
        return self.path.push(PropertyTypeQueryToken.record_created_by_id)

    def record_archived_by_id(self) -> Path:
        """Return the path to the record archived by id for a property type."""
        return self.path.push(PropertyTypeQueryToken.record_archived_by_id)

    def title(self) -> Path:
        """Return the path to the title for a property type."""
        return self.path.push(PropertyTypeQueryToken.title)

    def description(self) -> Path:
        """Return the path to the description for a property type."""
        return self.path.push(PropertyTypeQueryToken.description)

    def data_types(self) -> SelectorPath[DataTypePath]:
        """Return the path to the data types for a property type."""
        return (
            SelectorPath[DataTypePath]
            .from_path(
                self.path.push(PropertyTypeQueryToken.data_types),
            )
            .set_cls(DataTypePath)
        )

    def property_types(self) -> SelectorPath["PropertyTypePath"]:
        """Return the path to the property types for a property type."""
        return (
            SelectorPath[PropertyTypePath]
            .from_path(
                self.path.push(PropertyTypeQueryToken.property_types),
            )
            .set_cls(PropertyTypePath)
        )


class EntityTypePath(AbstractPath):
    """A path for an entity type."""

    def base_url(self) -> Path:
        """Return the path to the base url for an entity type."""
        return self.path.push(EntityTypeQueryToken.base_url)

    def version(self) -> Path:
        """Return the path to the version for an entity type."""
        return self.path.push(EntityTypeQueryToken.version)

    def versioned_url(self) -> Path:
        """Return the path to the versioned url for an entity type."""
        return self.path.push(EntityTypeQueryToken.versioned_url)

    def owned_by_id(self) -> Path:
        """Return the path to the owner id for an entity type."""
        return self.path.push(EntityTypeQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record created by id for an entity type."""
        return self.path.push(EntityTypeQueryToken.record_created_by_id)

    def record_archived_by_id(self) -> Path:
        """Return the path to the record archived by id for an entity type."""
        return self.path.push(EntityTypeQueryToken.record_archived_by_id)

    def title(self) -> Path:
        """Return the path to the title for an entity type."""
        return self.path.push(EntityTypeQueryToken.title)

    def description(self) -> Path:
        """Return the path to the description for an entity type."""
        return self.path.push(EntityTypeQueryToken.description)

    def examples(self) -> Path:
        """Return the path to the examples for an entity type."""
        return self.path.push(EntityTypeQueryToken.examples)

    def properties(self) -> SelectorPath[PropertyTypePath]:
        """Return the path to the properties for an entity type."""
        return (
            SelectorPath[PropertyTypePath]
            .from_path(
                self.path.push(EntityTypeQueryToken.properties),
            )
            .set_cls(PropertyTypePath)
        )

    def required(self) -> Path:
        """Return the path to the required for an entity type."""
        return self.path.push(EntityTypeQueryToken.required)

    def label_property(self) -> Path:
        """Return the path to the label property for an entity type."""
        return self.path.push(EntityTypeQueryToken.label_property)

    def links(self) -> SelectorPath["EntityTypePath"]:
        """Return the path to the links for an entity type."""
        return (
            SelectorPath[EntityTypePath]
            .from_path(
                self.path.push(EntityTypeQueryToken.links),
            )
            .set_cls(EntityTypePath)
        )

    def inherits_from(self) -> SelectorPath["EntityTypePath"]:
        """Return the path to the inherited entity types for an entity type."""
        return (
            SelectorPath[EntityTypePath]
            .from_path(
                self.path.push(EntityTypeQueryToken.inherits_from),
            )
            .set_cls(EntityTypePath)
        )


class PropertiesPath(AbstractPath):
    """Navigation through properties, which is largely untyped."""

    def array(self, index: int) -> Self:
        """Return the path to the array for a property."""
        return self.from_path(self.path.push(index))

    def array_all(self) -> Self:
        """Return the path to the array for a property."""
        return self.from_path(self.path.push("*"))

    def key(self, key: str) -> Self:
        """Return the path to the key for a property."""
        return self.from_path(self.path.push(key))

    def finish(self) -> Path:
        """Return the path to the finish for a property."""
        return self.path


class EntityPath(AbstractPath):
    """A path for an entity."""

    def uuid(self) -> Path:
        """Return the path to the uuid for an entity."""
        return self.path.push(EntityQueryToken.uuid)

    def edition_id(self) -> Path:
        """Return the path to the edition id for an entity."""
        return self.path.push(EntityQueryToken.edition_id)

    def archived(self) -> Path:
        """Return the path to the archived for an entity."""
        return self.path.push(EntityQueryToken.archived)

    def owned_by_id(self) -> Path:
        """Return the path to the owner id for an entity."""
        return self.path.push(EntityQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record created by id for an entity."""
        return self.path.push(EntityQueryToken.record_created_by_id)

    def type_(self) -> EntityTypePath:
        """Return the path to the type for an entity."""
        return EntityTypePath.from_path(
            self.path.push(EntityQueryToken.type),
        )

    def properties(self) -> PropertiesPath:
        """Return the path to the properties for an entity."""
        return PropertiesPath.from_path(self.path.push(EntityQueryToken.properties))

    def incoming_links(self) -> Self:
        """Return the path to the incoming links for an entity."""
        return self.from_path(self.path.push(EntityQueryToken.incoming_links))

    def outgoing_links(self) -> Self:
        """Return the path to the outgoing links for an entity."""
        return self.from_path(self.path.push(EntityQueryToken.outgoing_links))

    def left_entity(self) -> Self:
        """Return the path to the left entity for an entity."""
        return self.from_path(self.path.push(EntityQueryToken.left_entity))

    def right_entity(self) -> Self:
        """Return the path to the right entity for an entity."""
        return self.from_path(self.path.push(EntityQueryToken.right_entity))

    def left_to_right_order(self) -> Path:
        """Return the path to the left to right order for an entity."""
        return self.path.push(EntityQueryToken.left_to_right_order)

    def right_to_left_order(self) -> Path:
        """Return the path to the right to left order for an entity."""
        return self.path.push(EntityQueryToken.right_to_left_order)
