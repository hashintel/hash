use std::collections::{hash_map::Entry, HashMap};

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
pub struct KnowledgeGraphVertices(HashMap<EntityId, HashMap<EntityVersion, KnowledgeGraphVertex>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vertices {
    #[serde(flatten)]
    ontology: OntologyVertices,
    #[serde(flatten)]
    knowledge_graph: KnowledgeGraphVertices,
}

impl From<crate::subgraph::vertices::Vertices> for Vertices {
    fn from(vertices: crate::subgraph::vertices::Vertices) -> Self {
        Self {
            ontology: OntologyVertices(vertices.ontology.into_iter().fold(
                HashMap::new(),
                |mut map, (id, vertex)| {
                    match map.entry(id.base_id().clone()) {
                        Entry::Occupied(entry) => {
                            entry.into_mut().insert(id.version(), vertex);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(HashMap::from([(id.version(), vertex)]));
                        }
                    }
                    map
                },
            )),
            knowledge_graph: KnowledgeGraphVertices(vertices.knowledge_graph.into_iter().fold(
                HashMap::new(),
                |mut map, (id, vertex)| {
                    match map.entry(id.base_id()) {
                        Entry::Occupied(entry) => {
                            entry.into_mut().insert(id.version(), vertex);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(HashMap::from([(id.version(), vertex)]));
                        }
                    }
                    map
                },
            )),
        }
    }
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
