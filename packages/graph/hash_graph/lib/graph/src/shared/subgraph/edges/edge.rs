use serde::Serialize;
use utoipa::{openapi, ToSchema};

use crate::{
    identifier::{
        knowledge::{EntityEditionId, EntityIdAndTimestamp},
        ontology::OntologyTypeEditionId,
    },
    subgraph::edges::{KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
};

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenericOutwardEdge<K, E> {
    pub kind: K,
    /// If true, interpret this as a reversed mapping and the endpoint as the source, that is,
    /// instead of Source-Edge-Target, interpret it as Target-Edge-Source
    pub reversed: bool,
    pub right_endpoint: E,
}

// Utoipa doesn't seem to be able to generate sensible interfaces for this, it gets confused by
// the generic
impl<K, E> GenericOutwardEdge<K, E>
where
    K: ToSchema,
    E: ToSchema,
{
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .property("kind", K::schema())
            .required("kind")
            .property(
                "reversed",
                openapi::Object::with_type(openapi::SchemaType::Boolean),
            )
            .required("reversed")
            .property("rightEndpoint", E::schema())
            .required("rightEndpoint")
            .into()
    }
}

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
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

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
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

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
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
            .item(openapi::Ref::from_schema_name("OntologyOutwardEdges"))
            .item(openapi::Ref::from_schema_name("KnowledgeGraphOutwardEdges"))
            .into()
    }
}
