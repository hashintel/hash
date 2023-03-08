use serde::Serialize;
use utoipa::{openapi, ToSchema};

use crate::{
    identifier::EntityIdWithInterval,
    subgraph::{
        edges::{KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
        identifier::OntologyTypeVertexId,
    },
};

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutwardEdge<K, E> {
    pub kind: K,
    /// If true, interpret this as a reversed mapping and the endpoint as the source, that is,
    /// instead of Source-Edge-Target, interpret it as Target-Edge-Source
    pub reversed: bool,
    pub right_endpoint: E,
}

// Utoipa doesn't seem to be able to generate sensible interfaces for this, it gets confused by
// the generic
impl<'s, K, E> OutwardEdge<K, E>
where
    K: ToSchema<'s>,
    E: ToSchema<'s>,
{
    pub(crate) fn generate_schema(title: impl Into<String>) -> openapi::RefOr<openapi::Schema> {
        openapi::ObjectBuilder::new()
            .title(Some(title))
            .property("kind", openapi::Ref::from_schema_name(K::schema().0))
            .required("kind")
            .property(
                "reversed",
                openapi::Object::with_type(openapi::SchemaType::Boolean),
            )
            .required("reversed")
            .property(
                "rightEndpoint",
                openapi::Ref::from_schema_name(E::schema().0),
            )
            .required("rightEndpoint")
            .into()
    }
}

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum OntologyOutwardEdge {
    ToOntology(OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>),
    ToKnowledgeGraph(OutwardEdge<SharedEdgeKind, EntityIdWithInterval>),
}

impl From<OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>) -> Self {
        Self::ToOntology(edge)
    }
}

impl From<OutwardEdge<SharedEdgeKind, EntityIdWithInterval>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<SharedEdgeKind, EntityIdWithInterval>) -> Self {
        Self::ToKnowledgeGraph(edge)
    }
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema<'_> for OntologyOutwardEdge {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "OntologyOutwardEdge",
            openapi::OneOfBuilder::new()
                .item(
                    <OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>>::generate_schema(
                        "OntologyToOntologyOutwardEdge",
                    ),
                )
                .item(
                    <OutwardEdge<SharedEdgeKind, EntityIdWithInterval>>::generate_schema(
                        "OntologyToKnowledgeGraphOutwardEdge",
                    ),
                )
                .into(),
        )
    }
}

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum KnowledgeGraphOutwardEdge {
    ToKnowledgeGraph(OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>),
    ToOntology(OutwardEdge<SharedEdgeKind, OntologyTypeVertexId>),
}
