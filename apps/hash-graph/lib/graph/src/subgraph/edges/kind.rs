use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::subgraph::{
    edges::{
        endpoint::{EdgeEndpointSet, EntityIdWithIntervalSet},
        AdjacencyList, EdgeDirection, Edges,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OntologyEdgeKind {
    /// An ontology type can inherit from another ontology type.
    InheritsFrom,
    /// A [`PropertyType`] or [`DataType`] can reference a [`DataType`] to constrain values.
    ///
    /// [`DataType`]: type_system::DataType
    /// [`PropertyType`]: type_system::PropertyType
    ConstrainsValuesOn,
    /// An [`EntityType`] or [`PropertyType`] can reference a [`PropertyType`] to constrain
    /// properties.
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`EntityType`]: type_system::EntityType
    ConstrainsPropertiesOn,
    /// An [`EntityType`] can reference a link [`EntityType`] to constrain the existence of
    /// certain kinds of links.
    ///
    /// [`EntityType`]: type_system::EntityType
    ConstrainsLinksOn,
    /// An [`EntityType`] can reference an [`EntityType`] to constrain the target entities of
    /// certain kinds of links.
    ///
    /// [`EntityType`]: type_system::EntityType
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KnowledgeGraphEdgeKind {
    /// This link [`Entity`] has another [`Entity`] on its 'left' endpoint.
    ///
    /// The `reverse` of this would be the equivalent of saying an [`Entity`] has an outgoing
    /// `Link` [`Entity`].
    ///
    /// [`Entity`]: crate::knowledge::Entity
    HasLeftEntity,
    /// This link [`Entity`] has another [`Entity`] on its 'right' endpoint.
    ///
    /// [`Entity`]: crate::knowledge::Entity
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SharedEdgeKind {
    /// An [`Entity`] is of an [`EntityType`].
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`EntityType`]: type_system::EntityType
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

#[derive(Default, Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct EdgeResolveDepths {
    pub incoming: u8,
    pub outgoing: u8,
}

impl EdgeResolveDepths {
    #[expect(
        clippy::useless_let_if_seq,
        reason = "Using a mutable variable is more readable"
    )]
    pub fn update(&mut self, other: Self) -> bool {
        let mut changed = false;
        if other.incoming > self.incoming {
            self.incoming = other.incoming;
            changed = true;
        }
        if other.outgoing > self.outgoing {
            self.outgoing = other.outgoing;
            changed = true;
        }
        changed
    }
}

// TODO: Replace with `EdgeResolveDepths`
//   see https://app.asana.com/0/1201095311341924/1203399511264512/f
#[derive(Default, Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct OutgoingEdgeResolveDepth {
    pub outgoing: u8,
    #[serde(default, skip)]
    #[doc(hidden)]
    /// This is not used yet, but will be used in the future to support incoming edges.
    pub incoming: u8,
}

impl OutgoingEdgeResolveDepth {
    #[expect(
        clippy::useless_let_if_seq,
        reason = "Be consistent with `EdgeResolveDepths`"
    )]
    pub fn update(&mut self, other: Self) -> bool {
        let mut changed = false;
        if other.outgoing > self.outgoing {
            self.outgoing = other.outgoing;
            changed = true;
        }
        changed
    }
}

/// TODO: DOC - <https://app.asana.com/0/0/1203438518991188/f>
#[derive(Default, Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
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

pub trait GraphResolveDepthIndex {
    fn depth_mut(self, direction: EdgeDirection, dephts: &mut GraphResolveDepths) -> &mut u8;
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

    #[expect(
        clippy::useless_let_if_seq,
        reason = "Using a mutable variable is more readable"
    )]
    pub fn update(&mut self, other: Self) -> bool {
        let mut changed = false;
        if self.inherits_from.update(other.inherits_from) {
            changed = true;
        }
        if self.constrains_values_on.update(other.constrains_values_on) {
            changed = true;
        }
        if self
            .constrains_properties_on
            .update(other.constrains_properties_on)
        {
            changed = true;
        }
        if self.constrains_links_on.update(other.constrains_links_on) {
            changed = true;
        }
        if self
            .constrains_link_destinations_on
            .update(other.constrains_link_destinations_on)
        {
            changed = true;
        }
        if self.is_of_type.update(other.is_of_type) {
            changed = true;
        }
        if self.has_left_entity.update(other.has_left_entity) {
            changed = true;
        }
        if self.has_right_entity.update(other.has_right_entity) {
            changed = true;
        }
        changed
    }
}
