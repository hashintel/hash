use std::collections::HashMap;

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{
    openapi::{Array, ObjectBuilder, OneOfBuilder, Ref, Schema},
    ToSchema,
};

use crate::{
    identifier::{
        knowledge::{EntityId, EntityVersion},
        ontology::OntologyTypeVersion,
    },
    subgraph::edges::{KnowledgeGraphOutwardEdges, OntologyOutwardEdges},
};

#[derive(Serialize)]
pub struct Edges<'u> {
    #[serde(flatten)]
    pub ontology: OntologyRootedEdges<'u>,
    #[serde(flatten)]
    pub knowledge_graph: KnowledgeGraphRootedEdges<'u>,
}

// Utoipa generates `Edges` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema for Edges<'_> {
    fn schema() -> Schema {
        ObjectBuilder::new()
            .additional_properties(Some(Schema::from(
                ObjectBuilder::new().additional_properties(Some(Array::new(
                    OneOfBuilder::new()
                        .item(Ref::from_schema_name("OntologyOutwardEdges"))
                        .item(Ref::from_schema_name("KnowledgeGraphOutwardEdges")),
                ))),
            )))
            .into()
    }
}

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges<'u>(
    pub HashMap<EntityId, HashMap<EntityVersion, Vec<&'u KnowledgeGraphOutwardEdges>>>,
);

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyRootedEdges<'u>(
    pub HashMap<&'u BaseUri, HashMap<OntologyTypeVersion, Vec<&'u OntologyOutwardEdges>>>,
);
