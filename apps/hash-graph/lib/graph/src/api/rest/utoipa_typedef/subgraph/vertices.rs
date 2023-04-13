use std::collections::{hash_map::Entry, BTreeMap, HashMap};

use serde::Serialize;
use type_system::url::BaseUrl;
use utoipa::{
    openapi::{schema::AdditionalProperties, ObjectBuilder, OneOfBuilder, Ref, RefOr, Schema},
    ToSchema,
};

pub use self::vertex::*;
use crate::{
    identifier::{knowledge::EntityId, ontology::OntologyTypeVersion, time::Timestamp},
    subgraph::temporal_axes::VariableAxis,
};

pub mod vertex;

#[derive(Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyVertices(pub HashMap<BaseUrl, BTreeMap<OntologyTypeVersion, OntologyVertex>>);

#[derive(Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphVertices(
    HashMap<EntityId, BTreeMap<Timestamp<VariableAxis>, KnowledgeGraphVertex>>,
);

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
            .map(|(id, data_type)| (OntologyTypeVertexId::DataType(id), data_type.into()));
        let property_types = vertices
            .property_types
            .into_iter()
            .map(|(id, property_type)| {
                (OntologyTypeVertexId::PropertyType(id), property_type.into())
            });
        let entity_types = vertices
            .entity_types
            .into_iter()
            .map(|(id, entity_type)| (OntologyTypeVertexId::EntityType(id), entity_type.into()));
        Self {
            ontology: OntologyVertices(data_types.chain(property_types).chain(entity_types).fold(
                HashMap::new(),
                |mut map, (id, vertex)| {
                    match map.entry(id.base_id().clone()) {
                        Entry::Occupied(entry) => {
                            entry.into_mut().insert(id.revision_id(), vertex);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(BTreeMap::from([(id.revision_id(), vertex)]));
                        }
                    }
                    map
                },
            )),
            knowledge_graph: KnowledgeGraphVertices(vertices.entities.into_iter().fold(
                HashMap::new(),
                |mut map, (id, vertex)| {
                    match map.entry(id.base_id) {
                        Entry::Occupied(entry) => {
                            entry
                                .into_mut()
                                .insert(id.revision_id, KnowledgeGraphVertex::Entity(vertex));
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(BTreeMap::from([(
                                id.revision_id,
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

// Utoipa generates `Vertices` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema<'_> for Vertices {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "Vertices",
            ObjectBuilder::new()
                .additional_properties(Some(AdditionalProperties::RefOr(RefOr::T(Schema::from(
                    ObjectBuilder::new().additional_properties(Some(AdditionalProperties::RefOr(
                        RefOr::T(Schema::from(
                            OneOfBuilder::new()
                                .item(Ref::from_schema_name(KnowledgeGraphVertex::schema().0))
                                .item(Ref::from_schema_name(OntologyVertex::schema().0))
                                .build(),
                        )),
                    ))),
                )))))
                .into(),
        )
    }
}
