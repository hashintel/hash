use std::collections::{hash_map::Entry, HashMap};

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{
    openapi::{ObjectBuilder, OneOfBuilder, Ref, Schema},
    ToSchema,
};

pub use self::vertex::*;
use crate::identifier::{
    knowledge::{EntityId, EntityVersion},
    ontology::OntologyTypeVersion,
};

pub mod vertex;

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
        let data_types = vertices
            .data_types
            .into_iter()
            .map(|(id, data_type)| (id, data_type.into()));
        let property_types = vertices
            .property_types
            .into_iter()
            .map(|(id, property_type)| (id, property_type.into()));
        let entity_types = vertices
            .entity_types
            .into_iter()
            .map(|(id, entity_type)| (id, entity_type.into()));
        Self {
            ontology: OntologyVertices(data_types.chain(property_types).chain(entity_types).fold(
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
            knowledge_graph: KnowledgeGraphVertices(vertices.entities.into_iter().fold(
                HashMap::new(),
                |mut map, (id, vertex)| {
                    match map.entry(id.base_id()) {
                        Entry::Occupied(entry) => {
                            entry
                                .into_mut()
                                .insert(id.version(), KnowledgeGraphVertex::Entity(vertex));
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(HashMap::from([(
                                id.version(),
                                KnowledgeGraphVertex::Entity(vertex),
                            )]));
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
