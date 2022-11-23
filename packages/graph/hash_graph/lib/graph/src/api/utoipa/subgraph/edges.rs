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

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges(
    pub HashMap<EntityId, HashMap<EntityVersion, Vec<KnowledgeGraphOutwardEdges>>>,
);

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    pub HashMap<BaseUri, HashMap<OntologyTypeVersion, Vec<OntologyOutwardEdges>>>,
);

#[derive(Serialize)]
pub struct Edges {
    #[serde(flatten)]
    pub ontology: OntologyRootedEdges,
    #[serde(flatten)]
    pub knowledge_graph: KnowledgeGraphRootedEdges,
}

// Utoipa generates `Edges` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema for Edges {
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
