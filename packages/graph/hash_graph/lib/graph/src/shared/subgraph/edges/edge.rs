use std::cmp::Ordering;

use serde::Serialize;
use utoipa::{openapi, ToSchema};

use crate::{
    identifier::{
        knowledge::{EntityEditionId, EntityIdAndTimestamp},
        ontology::OntologyTypeEditionId,
    },
    subgraph::edges::{KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
};

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GenericOutwardEdge<E, V>
where
    E: Serialize + ToSchema,
    V: Serialize + ToSchema,
{
    pub kind: E,
    /// If true, interpret this as a reversed mapping and the endpoint as the source, that is,
    /// instead of Source-Edge-Target, interpret it as Target-Edge-Source
    pub reversed: bool,
    pub endpoint: V,
}

impl<E, V> PartialOrd for GenericOutwardEdge<E, V>
where
    E: Serialize + ToSchema + PartialEq,
    V: Serialize + ToSchema + PartialOrd + PartialEq,
{
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.endpoint.partial_cmp(&other.endpoint)
    }
}

impl<E, V> Ord for GenericOutwardEdge<E, V>
where
    E: Serialize + ToSchema + Eq,
    V: Serialize + ToSchema + Ord + Eq,
{
    fn cmp(&self, other: &Self) -> Ordering {
        self.endpoint.cmp(&other.endpoint)
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(untagged)]
pub enum OntologyOutwardEdges {
    ToOntology(GenericOutwardEdge<OntologyEdgeKind, OntologyTypeEditionId>),
    ToKnowledgeGraph(GenericOutwardEdge<SharedEdgeKind, EntityEditionId>),
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for OntologyOutwardEdges {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(<GenericOutwardEdge<OntologyEdgeKind, OntologyTypeEditionId>>::schema())
            .item(<GenericOutwardEdge<SharedEdgeKind, EntityEditionId>>::schema())
            .into()
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(untagged)]
pub enum KnowledgeGraphOutwardEdges {
    ToKnowledgeGraph(GenericOutwardEdge<KnowledgeGraphEdgeKind, EntityIdAndTimestamp>),
    ToOntology(GenericOutwardEdge<SharedEdgeKind, OntologyTypeEditionId>),
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for KnowledgeGraphOutwardEdges {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(<GenericOutwardEdge<
                KnowledgeGraphEdgeKind,
                EntityIdAndTimestamp,
            >>::schema())
            .item(<GenericOutwardEdge<SharedEdgeKind, OntologyTypeEditionId>>::schema())
            .into()
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(untagged)]
pub enum OutwardEdge {
    Ontology(OntologyOutwardEdges),
    KnowledgeGraph(KnowledgeGraphOutwardEdges),
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for OutwardEdge {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(OntologyOutwardEdges::schema())
            .item(KnowledgeGraphOutwardEdges::schema())
            .into()
    }
}
