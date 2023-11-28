
# =========================================
# THIS FILE IS GENERATED, DO NOT CHANGE IT!
# =========================================

"""Definitions for all path objects.

This file is auto-generated. Do not edit!"""
from typing import Self
from graph_client.models import DataTypeQueryToken, PropertyTypeQueryToken, EntityTypeQueryToken, EntityQueryToken
from graph_sdk.filter.base import AbstractQueryPath, UntypedQueryPath, SelectorQueryPath
from graph_sdk.query import Path

class DataTypeQueryPath(AbstractQueryPath):
    """A query path for a data type."""

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

class PropertyTypeQueryPath(AbstractQueryPath):
    """A query path for a property type."""

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

    def data_types(self) -> SelectorQueryPath[DataTypeQueryPath]:
        """Return the path to the data_types attribute of a property type."""
        return SelectorQueryPath[DataTypeQueryPath].from_path(self.path.push(PropertyTypeQueryToken.data_types)).set_cls(DataTypeQueryPath)

    def property_types(self) -> SelectorQueryPath[Self]:
        """Return the path to the property_types attribute of a property type."""
        return SelectorQueryPath[Self].from_path(self.path.push(PropertyTypeQueryToken.property_types)).set_cls(type(self))

class EntityTypeQueryPath(AbstractQueryPath):
    """A query path for an entity type."""

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

    def properties(self) -> SelectorQueryPath[PropertyTypeQueryPath]:
        """Return the path to the properties attribute of an entity type."""
        return SelectorQueryPath[PropertyTypeQueryPath].from_path(self.path.push(EntityTypeQueryToken.properties)).set_cls(PropertyTypeQueryPath)

    def required(self) -> Path:
        """Return the path to the required attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.required)

    def label_property(self) -> Path:
        """Return the path to the label_property attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.label_property)

    def icon(self) -> Path:
        """Return the path to the icon attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.icon)

    def links(self) -> SelectorQueryPath[Self]:
        """Return the path to the links attribute of an entity type."""
        return SelectorQueryPath[Self].from_path(self.path.push(EntityTypeQueryToken.links)).set_cls(type(self))

    def inherits_from(self) -> Path:
        """Return the path to the inherits_from attribute of an entity type."""
        return self.path.push(EntityTypeQueryToken.inherits_from)

    def children(self, *, inheritance_depth: int | None=None) -> Path:
        """Return the path to the children attribute of an entity type."""
        args = []
        if inheritance_depth is not None:
            args.append(f'inheritanceDepth={inheritance_depth}')
        return self.path.push(f"{EntityTypeQueryToken.children}({', '.join(args)})" if args else EntityTypeQueryToken.children)

class EntityQueryPath(AbstractQueryPath):
    """A query path for an entity."""

    def uuid(self) -> Path:
        """Return the path to the uuid attribute of an entity."""
        return self.path.push(EntityQueryToken.uuid)

    def edition_id(self) -> Path:
        """Return the path to the edition_id attribute of an entity."""
        return self.path.push(EntityQueryToken.edition_id)

    def archived(self) -> Path:
        """Return the path to the archived attribute of an entity."""
        return self.path.push(EntityQueryToken.archived)

    def draft(self) -> Path:
        """Return the path to the draft attribute of an entity."""
        return self.path.push(EntityQueryToken.draft)

    def owned_by_id(self) -> Path:
        """Return the path to the owned_by_id attribute of an entity."""
        return self.path.push(EntityQueryToken.owned_by_id)

    def record_created_by_id(self) -> Path:
        """Return the path to the record_created_by_id attribute of an entity."""
        return self.path.push(EntityQueryToken.record_created_by_id)

    def type_(self, *, inheritance_depth: int | None=None) -> EntityTypeQueryPath:
        """Return the path to the type attribute of an entity."""
        args = []
        if inheritance_depth is not None:
            args.append(f'inheritanceDepth={inheritance_depth}')
        return EntityTypeQueryPath.from_path(self.path.push(f"{EntityQueryToken.type}({', '.join(args)})" if args else EntityQueryToken.type))

    def properties(self) -> UntypedQueryPath:
        """Return the path to the properties attribute of an entity."""
        return UntypedQueryPath.from_path(self.path.push(EntityQueryToken.properties))

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