mod vertex;

use std::collections::{hash_map::Entry, HashMap};

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{openapi, ToSchema};

pub use self::vertex::*;
use crate::identifier::{
    knowledge::{EntityId, EntityVersion},
    ontology::OntologyTypeVersion,
    GraphElementEditionId,
};

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyVertices(pub HashMap<BaseUri, HashMap<OntologyTypeVersion, OntologyVertex>>);

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphVertices(
    // TODO: expose it through methods instead of making this field `pub`
    //   see https://app.asana.com/0/1202805690238892/1203358665695491/f
    pub HashMap<EntityId, HashMap<EntityVersion, KnowledgeGraphVertex>>,
);

#[derive(Default, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vertices {
    #[serde(flatten)]
    ontology: OntologyVertices,
    #[serde(flatten)]
    knowledge_graph: KnowledgeGraphVertices,
}

impl Vertices {
    #[must_use]
    pub const fn new(
        ontology_vertices: OntologyVertices,
        knowledge_graph_vertices: KnowledgeGraphVertices,
    ) -> Self {
        Self {
            ontology: ontology_vertices,
            knowledge_graph: knowledge_graph_vertices,
        }
    }

    pub fn extend(&mut self, other: Self) {
        for (key, value) in other.ontology.0.into_iter() {
            match self.ontology.0.entry(key) {
                Entry::Occupied(entry) => {
                    entry.into_mut().extend(value);
                }
                Entry::Vacant(entry) => {
                    entry.insert(value);
                }
            }
        }
        for (key, value) in other.knowledge_graph.0.into_iter() {
            match self.knowledge_graph.0.entry(key) {
                Entry::Occupied(entry) => {
                    entry.into_mut().extend(value);
                }
                Entry::Vacant(entry) => {
                    entry.insert(value);
                }
            }
        }
    }

    #[must_use]
    pub fn remove(&mut self, identifier: &GraphElementEditionId) -> Option<Vertex> {
        match identifier {
            GraphElementEditionId::Ontology(type_edition_id) => self
                .ontology
                .0
                .get_mut(type_edition_id.base_id())
                .and_then(|inner| {
                    inner
                        .remove(&type_edition_id.version())
                        .map(|element| Vertex::Ontology(Box::new(element)))
                }),
            GraphElementEditionId::KnowledgeGraph(entity_edition_id) => self
                .knowledge_graph
                .0
                .get_mut(&entity_edition_id.base_id())
                .and_then(|inner| {
                    inner
                        .remove(&entity_edition_id.version())
                        .map(|element| Vertex::KnowledgeGraph(Box::new(element)))
                }),
        }
    }
}

// Utoipa generates `Edges` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema for Vertices {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .additional_properties(Some(openapi::Schema::from(
                openapi::ObjectBuilder::new().additional_properties(Some(
                    openapi::OneOfBuilder::new()
                        .item(openapi::Ref::from_schema_name("KnowledgeGraphVertex"))
                        .item(openapi::Ref::from_schema_name("OntologyVertex")),
                )),
            )))
            .into()
    }
}
