use core::convert::identity;
use std::collections::HashSet;

use serde::{Deserialize, Serialize};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::subgraph::{
    edges::{
        AdjacencyList, EdgeDirection, Edges,
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
#[serde(deny_unknown_fields)]
pub struct EdgeResolveDepths {
    pub incoming: u8,
    pub outgoing: u8,
}

impl EdgeResolveDepths {
    #[must_use]
    pub const fn contains(self, other: Self) -> bool {
        self.outgoing >= other.outgoing && self.incoming >= other.incoming
    }
}

// TODO: Replace with `EdgeResolveDepths`
//   see https://linear.app/hash/issue/H-3018
#[derive(Default, Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(deny_unknown_fields)]
pub struct OutgoingEdgeResolveDepth {
    #[serde(default, skip)]
    #[doc(hidden)]
    /// This is not used yet, but will be used in the future to support incoming edges.
    pub incoming: u8,
    pub outgoing: u8,
}

impl OutgoingEdgeResolveDepth {
    #[must_use]
    pub const fn contains(self, other: Self) -> bool {
        self.outgoing >= other.outgoing && self.incoming >= other.incoming
    }
}

// TODO: Add documentation for depths parameters
//   see https://linear.app/hash/issue/H-3018 (sub-task noted in desc)
#[derive(Default, Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphResolveDepths {
    pub inherits_from: OutgoingEdgeResolveDepth,
    pub constrains_values_on: OutgoingEdgeResolveDepth,
    pub constrains_properties_on: OutgoingEdgeResolveDepth,
    pub constrains_links_on: OutgoingEdgeResolveDepth,
    pub constrains_link_destinations_on: OutgoingEdgeResolveDepth,
    pub is_of_type: OutgoingEdgeResolveDepth,
    pub has_left_entity: EdgeResolveDepths,
    pub has_right_entity: EdgeResolveDepths,
}

impl GraphResolveDepths {
    #[must_use]
    pub fn is_empty(self) -> bool {
        self == Self::default()
    }

    #[must_use]
    pub fn contains(self, other: Self) -> bool {
        [
            self.inherits_from.contains(other.inherits_from),
            self.constrains_values_on
                .contains(other.constrains_values_on),
            self.constrains_properties_on
                .contains(other.constrains_properties_on),
            self.constrains_links_on.contains(other.constrains_links_on),
            self.constrains_link_destinations_on
                .contains(other.constrains_link_destinations_on),
            self.is_of_type.contains(other.is_of_type),
            self.has_left_entity.contains(other.has_left_entity),
            self.has_right_entity.contains(other.has_right_entity),
        ]
        .into_iter()
        .all(identity)
    }
}

pub trait GraphResolveDepthIndex {
    fn depth_mut(self, direction: EdgeDirection, depths: &mut GraphResolveDepths) -> &mut u8;
}

impl GraphResolveDepthIndex for OntologyEdgeKind {
    fn depth_mut(self, direction: EdgeDirection, depths: &mut GraphResolveDepths) -> &mut u8 {
        match self {
            Self::InheritsFrom => match direction {
                EdgeDirection::Incoming => &mut depths.inherits_from.incoming,
                EdgeDirection::Outgoing => &mut depths.inherits_from.outgoing,
            },
            Self::ConstrainsValuesOn => match direction {
                EdgeDirection::Incoming => &mut depths.constrains_values_on.incoming,
                EdgeDirection::Outgoing => &mut depths.constrains_values_on.outgoing,
            },
            Self::ConstrainsPropertiesOn => match direction {
                EdgeDirection::Incoming => &mut depths.constrains_properties_on.incoming,
                EdgeDirection::Outgoing => &mut depths.constrains_properties_on.outgoing,
            },
            Self::ConstrainsLinksOn => match direction {
                EdgeDirection::Incoming => &mut depths.constrains_links_on.incoming,
                EdgeDirection::Outgoing => &mut depths.constrains_links_on.outgoing,
            },
            Self::ConstrainsLinkDestinationsOn => match direction {
                EdgeDirection::Incoming => &mut depths.constrains_link_destinations_on.incoming,
                EdgeDirection::Outgoing => &mut depths.constrains_link_destinations_on.outgoing,
            },
        }
    }
}

impl GraphResolveDepthIndex for SharedEdgeKind {
    fn depth_mut(self, direction: EdgeDirection, depths: &mut GraphResolveDepths) -> &mut u8 {
        match self {
            Self::IsOfType => match direction {
                EdgeDirection::Incoming => &mut depths.is_of_type.incoming,
                EdgeDirection::Outgoing => &mut depths.is_of_type.outgoing,
            },
        }
    }
}

impl GraphResolveDepthIndex for KnowledgeGraphEdgeKind {
    fn depth_mut(self, direction: EdgeDirection, depths: &mut GraphResolveDepths) -> &mut u8 {
        match self {
            Self::HasLeftEntity => match direction {
                EdgeDirection::Incoming => &mut depths.has_left_entity.incoming,
                EdgeDirection::Outgoing => &mut depths.has_left_entity.outgoing,
            },
            Self::HasRightEntity => match direction {
                EdgeDirection::Incoming => &mut depths.has_right_entity.incoming,
                EdgeDirection::Outgoing => &mut depths.has_right_entity.outgoing,
            },
        }
    }
}

impl GraphResolveDepths {
    #[must_use]
    pub fn decrement_depth_for_edge(
        mut self,
        kind: impl GraphResolveDepthIndex,
        direction: EdgeDirection,
    ) -> Option<Self> {
        let depths = kind.depth_mut(direction, &mut self);
        *depths = depths.checked_sub(1)?;
        Some(self)
    }

    #[must_use]
    pub fn zero_depth_for_edge(
        mut self,
        kind: impl GraphResolveDepthIndex,
        direction: EdgeDirection,
    ) -> Self {
        let depths = kind.depth_mut(direction, &mut self);
        *depths = 0;
        self
    }
}
