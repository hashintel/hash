use std::collections::HashMap;

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{
    openapi::{ObjectBuilder, OneOfBuilder, Ref, Schema},
    ToSchema,
};

use crate::{
    identifier::{
        knowledge::{EntityId, EntityVersion},
        ontology::OntologyTypeVersion,
    },
    subgraph::vertices::{KnowledgeGraphVertex, OntologyVertex},
};

#[derive(Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyVertices(pub HashMap<BaseUri, HashMap<OntologyTypeVersion, OntologyVertex>>);

#[derive(Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphVertices(
    pub HashMap<EntityId, HashMap<EntityVersion, KnowledgeGraphVertex>>,
);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vertices {
    #[serde(flatten)]
    pub ontology: OntologyVertices,
    #[serde(flatten)]
    pub knowledge_graph: KnowledgeGraphVertices,
}

// Utoipa generates `Edges` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema for Vertices {
    fn schema() -> Schema {
        ObjectBuilder::new()
            .additional_properties(Some(Schema::from(
                ObjectBuilder::new().additional_properties(Some(
                    OneOfBuilder::new()
                        .item(Ref::from_schema_name("KnowledgeGraphVertex"))
                        .item(Ref::from_schema_name("OntologyVertex")),
                )),
            )))
            .into()
    }
}
