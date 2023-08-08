"""Definitions for all path objects.

This file is auto-generated. Do not edit!
"""
from typing import Self

from graph_client.models import (
    DataTypeQueryToken,
    EntityQueryToken,
    EntityTypeQueryToken,
    PropertyTypeQueryToken,
)

from graph_sdk.filter.base import AbstractPath, PropertiesPath, SelectorPath
from graph_sdk.query import Path


class DataTypePath(AbstractPath):
    """A path for a data type."""

    def base_url(self) -> Path:
        """Return the path to the base_url attribute of a data type."""
        return self.path.push(DataTypeQueryToken.base_url)

    def version(self) -> Path:
        """Return the path to the version attribute of a data type."""
        return self.path.push(DataTypeQueryToken.version)

    def versioned_url(self) -> Path:
        """Return the path to the versioned_url attribute of a data type."""
        return self.path.push(DataTypeQueryToken.versioned_url)

    def owned_by_id(self) -> Path:
        """Return the path to the owned_by_id attribute of a data type."""
        return self.path.push(DataTypeQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record_created_by_id attribute of a data type."""
        return self.path.push(DataTypeQueryToken.record_created_by_id)

    def record_archived_by_id(self) -> Path:
        """Return the path to the record_archived_by_id attribute of a data type."""
        return self.path.push(DataTypeQueryToken.record_archived_by_id)

    def title(self) -> Path:
        """Return the path to the title attribute of a data type."""
        return self.path.push(DataTypeQueryToken.title)

    def description(self) -> Path:
        """Return the path to the description attribute of a data type."""
        return self.path.push(DataTypeQueryToken.description)

    def type_(self) -> Path:
        """Return the path to the type attribute of a data type."""
        return self.path.push(DataTypeQueryToken.type)


class PropertyTypePath(AbstractPath):
    """A path for a property type."""

    def base_url(self) -> Path:
        """Return the path to the base_url attribute of a property type."""
        return self.path.push(PropertyTypeQueryToken.base_url)

    def version(self) -> Path:
        """Return the path to the version attribute of a property type."""
        return self.path.push(PropertyTypeQueryToken.version)

    def versioned_url(self) -> Path:
        """Return the path to the versioned_url attribute of a property type."""
        return self.path.push(PropertyTypeQueryToken.versioned_url)

    def owned_by_id(self) -> Path:
        """Return the path to the owned_by_id attribute of a property type."""
        return self.path.push(PropertyTypeQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record_created_by_id attribute of a property type."""
        return self.path.push(PropertyTypeQueryToken.record_created_by_id)

    def record_archived_by_id(self) -> Path:
        """Return the path to the record_archived_by_id attribute of a property type."""
        return self.path.push(PropertyTypeQueryToken.record_archived_by_id)

    def title(self) -> Path:
        """Return the path to the title attribute of a property type."""
        return self.path.push(PropertyTypeQueryToken.title)

    def description(self) -> Path:
        """Return the path to the description attribute of a property type."""
        return self.path.push(PropertyTypeQueryToken.description)

    def data_types(self) -> SelectorPath[DataTypePath]:
        """Return the path to the data_types attribute of a property type."""
        return (
            SelectorPath[DataTypePath]
            .from_path(self.path.push(PropertyTypeQueryToken.data_types))
            .set_cls(PropertyTypePath)
        )

    def property_types(self) -> SelectorPath[Self]:
        """Return the path to the property_types attribute of a property type."""
        return (
            SelectorPath[Self]
            .from_path(self.path.push(PropertyTypeQueryToken.property_types))
            .set_cls(PropertyTypePath)
        )


class EntityTypePath(AbstractPath):
    """A path for an entity type."""

    def base_url(self) -> Path:
        """Return the path to the base_url attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.base_url)

    def version(self) -> Path:
        """Return the path to the version attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.version)

    def versioned_url(self) -> Path:
        """Return the path to the versioned_url attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.versioned_url)

    def owned_by_id(self) -> Path:
        """Return the path to the owned_by_id attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record_created_by_id attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.record_created_by_id)

    def record_archived_by_id(self) -> Path:
        """Return the path to the record_archived_by_id attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.record_archived_by_id)

    def title(self) -> Path:
        """Return the path to the title attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.title)

    def description(self) -> Path:
        """Return the path to the description attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.description)

    def examples(self) -> Path:
        """Return the path to the examples attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.examples)

    def properties(self) -> SelectorPath[PropertyTypePath]:
        """Return the path to the properties attribute of an entity type."""
        return (
            SelectorPath[PropertyTypePath]
            .from_path(self.path.push(EntityTypeQueryToken.properties))
            .set_cls(EntityTypePath)
        )

    def required(self) -> Path:
        """Return the path to the required attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.required)

    def label_property(self) -> Path:
        """Return the path to the label_property attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.label_property)

    def links(self) -> SelectorPath[Self]:
        """Return the path to the links attribute of an entity type."""
        return (
            SelectorPath[Self]
            .from_path(self.path.push(EntityTypeQueryToken.links))
            .set_cls(EntityTypePath)
        )

    def inherits_from(self) -> Path:
        """Return the path to the inherits_from attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.inherits_from)


class EntityPath(AbstractPath):
    """A path for an entity."""

    def uuid(self) -> Path:
        """Return the path to the uuid attribute of an entity."""
        return self.path.push(EntityQueryToken.uuid)

    def edition_id(self) -> Path:
        """Return the path to the edition_id attribute of an entity."""
        return self.path.push(EntityQueryToken.edition_id)

    def archived(self) -> Path:
        """Return the path to the archived attribute of an entity."""
        return self.path.push(EntityQueryToken.archived)

    def owned_by_id(self) -> Path:
        """Return the path to the owned_by_id attribute of an entity."""
        return self.path.push(EntityQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record_created_by_id attribute of an entity."""
        return self.path.push(EntityQueryToken.record_created_by_id)

    def type_(self) -> EntityTypePath:
        """Return the path to the type attribute of an entity."""
        return EntityTypePath.from_path(self.path.push(EntityQueryToken.type))

    def properties(self) -> PropertiesPath:
        """Return the path to the properties attribute of an entity."""
        return PropertiesPath.from_path(self.path.push(EntityQueryToken.properties))

    def incoming_links(self) -> Self:
        """Return the path to the incoming_links attribute of an entity."""
        return self.from_path(self.path.push(EntityQueryToken.incoming_links))

    def outgoing_links(self) -> Self:
        """Return the path to the outgoing_links attribute of an entity."""
        return self.from_path(self.path.push(EntityQueryToken.outgoing_links))

    def left_entity(self) -> Self:
        """Return the path to the left_entity attribute of an entity."""
        return self.from_path(self.path.push(EntityQueryToken.left_entity))

    def right_entity(self) -> Self:
        """Return the path to the right_entity attribute of an entity."""
        return self.from_path(self.path.push(EntityQueryToken.right_entity))

    def left_to_right_order(self) -> Path:
        """Return the path to the left_to_right_order attribute of an entity."""
        return self.path.push(EntityQueryToken.left_to_right_order)

    def right_to_left_order(self) -> Path:
        """Return the path to the right_to_left_order attribute of an entity."""
        return self.path.push(EntityQueryToken.right_to_left_order)
