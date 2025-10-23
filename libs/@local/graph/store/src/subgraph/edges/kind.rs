use core::convert::identity;
use std::collections::HashSet;

use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::subgraph::{
    edges::{
        AdjacencyList, Edges,
        endpoint::{EdgeEndpointSet, EntityIdWithIntervalSet},
    },
    identifier::{
        DataTypeVertexId, EdgeEndpoint, EntityIdWithInterval, EntityTypeVertexId, EntityVertexId,
        PropertyTypeVertexId, VertexId,
    },
};

pub trait EdgeKind<L: VertexId, R: EdgeEndpoint>: Sized {
    type EdgeSet: EdgeEndpointSet<EdgeEndpoint = R>;

    fn subgraph_entry_mut<'a>(
        &self,
        edges: &'a mut Edges,
    ) -> &'a mut AdjacencyList<L, Self, Self::EdgeSet>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OntologyEdgeKind {
    /// An ontology type can inherit from another ontology type.
    InheritsFrom,
    /// A [`PropertyType`] or [`DataType`] can reference a [`DataType`] to constrain values.
    ///
    /// [`DataType`]: type_system::ontology::data_type::DataType
    /// [`PropertyType`]: type_system::ontology::property_type::PropertyType
    ConstrainsValuesOn,
    /// An [`EntityType`] or [`PropertyType`] can reference a [`PropertyType`] to constrain
    /// properties.
    ///
    /// [`PropertyType`]: type_system::ontology::property_type::PropertyType
    /// [`EntityType`]: type_system::ontology::entity_type::EntityType
    ConstrainsPropertiesOn,
    /// An [`EntityType`] can reference a link [`EntityType`] to constrain the existence of
    /// certain kinds of links.
    ///
    /// [`EntityType`]: type_system::ontology::entity_type::EntityType
    ConstrainsLinksOn,
    /// An [`EntityType`] can reference an [`EntityType`] to constrain the target entities of
    /// certain kinds of links.
    ///
    /// [`EntityType`]: type_system::ontology::entity_type::EntityType
    ConstrainsLinkDestinationsOn,
}

impl EdgeKind<EntityTypeVertexId, EntityTypeVertexId> for OntologyEdgeKind {
    type EdgeSet = HashSet<EntityTypeVertexId>;

    fn subgraph_entry_mut<'a>(
        &self,
        edges: &'a mut Edges,
    ) -> &'a mut AdjacencyList<EntityTypeVertexId, Self, Self::EdgeSet> {
        &mut edges.entity_type_to_entity_type
    }
}

impl EdgeKind<EntityTypeVertexId, PropertyTypeVertexId> for OntologyEdgeKind {
    type EdgeSet = HashSet<PropertyTypeVertexId>;

    fn subgraph_entry_mut<'a>(
        &self,
        edges: &'a mut Edges,
    ) -> &'a mut AdjacencyList<EntityTypeVertexId, Self, Self::EdgeSet> {
        &mut edges.entity_type_to_property_type
    }
}

impl EdgeKind<PropertyTypeVertexId, PropertyTypeVertexId> for OntologyEdgeKind {
    type EdgeSet = HashSet<PropertyTypeVertexId>;

    fn subgraph_entry_mut<'a>(
        &self,
        edges: &'a mut Edges,
    ) -> &'a mut AdjacencyList<PropertyTypeVertexId, Self, Self::EdgeSet> {
        &mut edges.property_type_to_property_type
    }
}

impl EdgeKind<PropertyTypeVertexId, DataTypeVertexId> for OntologyEdgeKind {
    type EdgeSet = HashSet<DataTypeVertexId>;

    fn subgraph_entry_mut<'a>(
        &self,
        edges: &'a mut Edges,
    ) -> &'a mut AdjacencyList<PropertyTypeVertexId, Self, Self::EdgeSet> {
        &mut edges.property_type_to_data_type
    }
}

impl EdgeKind<DataTypeVertexId, DataTypeVertexId> for OntologyEdgeKind {
    type EdgeSet = HashSet<DataTypeVertexId>;

    fn subgraph_entry_mut<'a>(
        &self,
        edges: &'a mut Edges,
    ) -> &'a mut AdjacencyList<DataTypeVertexId, Self, Self::EdgeSet> {
        &mut edges.data_type_to_data_type
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(name = "entity_edge_kind", rename_all = "kebab-case")
)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KnowledgeGraphEdgeKind {
    /// This link [`Entity`] has another [`Entity`] on its 'left' endpoint.
    ///
    /// The `reverse` of this would be the equivalent of saying an [`Entity`] has an outgoing
    /// `Link` [`Entity`].
    ///
    /// [`Entity`]: type_system::knowledge::Entity
    HasLeftEntity,
    /// This link [`Entity`] has another [`Entity`] on its 'right' endpoint.
    ///
    /// [`Entity`]: type_system::knowledge::Entity
    HasRightEntity,
}

impl EdgeKind<EntityVertexId, EntityIdWithInterval> for KnowledgeGraphEdgeKind {
    type EdgeSet = EntityIdWithIntervalSet;

    fn subgraph_entry_mut<'a>(
        &self,
        edges: &'a mut Edges,
    ) -> &'a mut AdjacencyList<EntityVertexId, Self, Self::EdgeSet> {
        &mut edges.entity_to_entity
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SharedEdgeKind {
    /// An [`Entity`] is of an [`EntityType`].
    ///
    /// [`Entity`]: type_system::knowledge::Entity
    /// [`EntityType`]: type_system::ontology::entity_type::EntityType
    IsOfType,
}

impl EdgeKind<EntityVertexId, EntityTypeVertexId> for SharedEdgeKind {
    type EdgeSet = HashSet<EntityTypeVertexId>;

    fn subgraph_entry_mut<'a>(
        &self,
        edges: &'a mut Edges,
    ) -> &'a mut AdjacencyList<EntityVertexId, Self, Self::EdgeSet> {
        &mut edges.entity_to_entity_type
    }
}

#[derive(Default, Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[cfg_attr(feature = "codegen", derive(specta::Type))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphResolveDepths {
    #[serde(default)]
    pub inherits_from: u8,
    #[serde(default)]
    pub constrains_values_on: u8,
    #[serde(default)]
    pub constrains_properties_on: u8,
    #[serde(default)]
    pub constrains_links_on: u8,
    #[serde(default)]
    pub constrains_link_destinations_on: u8,
    #[serde(default)]
    pub is_of_type: bool,
}

impl GraphResolveDepths {
    #[must_use]
    pub fn is_empty(self) -> bool {
        self == Self::default()
    }

    #[must_use]
    pub fn contains(self, other: Self) -> bool {
        [
            self.inherits_from >= other.inherits_from,
            self.constrains_values_on >= other.constrains_values_on,
            self.constrains_properties_on >= other.constrains_properties_on,
            self.constrains_links_on >= other.constrains_links_on,
            self.constrains_link_destinations_on >= other.constrains_link_destinations_on,
            self.is_of_type >= other.is_of_type,
        ]
        .into_iter()
        .all(identity)
    }

    #[must_use]
    pub fn decrement_depth_for_edge_kind(mut self, kind: OntologyEdgeKind) -> Option<Self> {
        let depths = match kind {
            OntologyEdgeKind::InheritsFrom => &mut self.inherits_from,
            OntologyEdgeKind::ConstrainsValuesOn => &mut self.constrains_values_on,
            OntologyEdgeKind::ConstrainsPropertiesOn => &mut self.constrains_properties_on,
            OntologyEdgeKind::ConstrainsLinksOn => &mut self.constrains_links_on,
            OntologyEdgeKind::ConstrainsLinkDestinationsOn => {
                &mut self.constrains_link_destinations_on
            }
        };
        *depths = depths.checked_sub(1)?;
        Some(self)
    }
}
