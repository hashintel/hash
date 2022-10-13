use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::ToSchema;

use crate::{
    knowledge::{EntityId, KnowledgeGraphQueryDepth, PersistedEntity, PersistedLink},
    ontology::{
        OntologyQueryDepth, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedPropertyType,
    },
};

// TODO - This is temporary and introduced for consistency, we need to introduce actual IDs for
//  links
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkId {
    source_entity_id: EntityId,
    target_entity_id: EntityId,
    #[schema(value_type = String)]
    link_type_id: VersionedUri,
}

#[expect(
    clippy::enum_variant_names,
    reason = "We want the variant suffixes in typescript"
)]
// TODO - consider making the type IDs their own standalone types
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
pub enum GraphElementIdentifier {
    #[schema(value_type = String)]
    DataTypeId(VersionedUri),
    #[schema(value_type = String)]
    PropertyTypeId(VersionedUri),
    #[schema(value_type = String)]
    LinkTypeId(VersionedUri),
    #[schema(value_type = String)]
    EntityTypeId(VersionedUri),
    #[schema(value_type = String)]
    LinkId(LinkId),
    EntityId(EntityId),
}

// todo impl as string for GraphElementIdentifier

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
pub enum Vertex {
    DataType(PersistedDataType),
    PropertyType(PersistedPropertyType),
    LinkType(PersistedLinkType),
    EntityType(PersistedEntityType),
    Entity(PersistedEntity),
    Link(PersistedLink),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
#[expect(
    dead_code,
    reason = "In process of implementing usages of these across a few PRs"
)]
pub enum EdgeKind {
    /// An [`Entity`] has a [`Link`]
    HasLink,
    /// A [`Link`] has an [`Entity`] as its destination
    HasDestination,
    /// A [`Link`] or [`Entity`] has a [`LinkType`] or [`EntityType`] as its type, respectively
    HasType,
    /// A type can reference another type
    References,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    source: GraphElementIdentifier,
    edge_kind: EdgeKind,
    destination: GraphElementIdentifier,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GraphResolveDepths {
    #[schema(value_type = number)]
    pub data_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub property_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub entity_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub link_type_resolve_depth: OntologyQueryDepth,
    #[schema(value_type = number)]
    pub entity_resolve_depth: KnowledgeGraphQueryDepth,
    #[schema(value_type = number)]
    pub link_resolve_depth: KnowledgeGraphQueryDepth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    pub roots: Vec<GraphElementIdentifier>,
    pub vertices: HashMap<GraphElementIdentifier, Vertex>,
    pub edges: HashMap<GraphElementIdentifier, Vec<Edge>>,
    pub depths: GraphResolveDepths,
}
