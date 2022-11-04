use std::collections::HashMap;

use serde::Serialize;
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;

use crate::{
    identifier::{EntityAndTimestamp, EntityIdentifier, OntologyTypeVersion, Timestamp},
    subgraph::OntologyVertices,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OntologyEdgeKind {
    /// An [`OntologyType`] can inherit from another [`OntologyType`]
    InheritsFrom,
    /// A [`PropertyType`] or [`DataType`] can reference a [`DataType`] to constrain values
    ConstrainsValuesOn,
    /// An [`EntityType`] or [`PropertyType`] can reference a [`PropertyType`] to constrain
    /// properties
    ConstrainsPropertiesOn,
    /// An [`EntityType`] can reference a [`Link`] [`EntityType`] to constrain the existence of
    /// certain kinds of [`Link`]s
    ConstrainsLinksOn,
    /// An [`EntityType`] can reference an [`EntityType`] to constrain the target entities of
    /// certain kinds of [`Link`]s
    ConstrainsLinkDestinationsOn,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KnowledgeGraphEdgeKind {
    /// This [`Entity`] has an outgoing [`Link`] [`Entity`]
    HasLink,
    /// This [`Link`] [`Entity`] has another [`Entity`] at its end
    HasEndpoint,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SharedEdgeKind {
    /// An [`Entity`] is of an [`EntityType`]
    IsOfType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct OutwardEdge<E, V>
where
    E: Serialize,
    V: Serialize,
{
    kind: E,
    /// If true, interpret this as a reversed mapping and the endpoint as the source, that is,
    /// instead of Source-Edge-Target, interpret it as Target-Edge-Source
    reversed: bool,
    endpoint: V,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(untagged)]
pub enum OntologyOutwardEdges {
    ToOntology(OutwardEdge<OntologyEdgeKind, VersionedUri>),
    ToKnowledgeGraph(OutwardEdge<SharedEdgeKind, EntityIdentifier>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    HashMap<BaseUri, HashMap<OntologyTypeVersion, Vec<OntologyOutwardEdges>>>,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(untagged)]
pub enum KnowledgeGraphOutwardEdges {
    ToKnowledgeGraph(OutwardEdge<KnowledgeGraphEdgeKind, EntityAndTimestamp>),
    ToOntology(OutwardEdge<SharedEdgeKind, VersionedUri>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges(
    HashMap<EntityIdentifier, HashMap<Timestamp, Vec<KnowledgeGraphOutwardEdges>>>,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct Edges {
    #[serde(flatten)]
    ontology: OntologyRootedEdges,
    #[serde(flatten)]
    knowledge_graph: KnowledgeGraphRootedEdges,
}
