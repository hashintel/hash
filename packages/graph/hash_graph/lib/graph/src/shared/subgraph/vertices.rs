use std::collections::HashMap;

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::ToSchema;

use crate::{
    identifier::{EntityIdentifier, EntityVersion, OntologyTypeVersion},
    knowledge::PersistedEntity,
    ontology::{PersistedDataType, PersistedEntityType, PersistedPropertyType},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
pub enum OntologyVertex {
    DataType(PersistedDataType),
    PropertyType(PersistedPropertyType),
    EntityType(PersistedEntityType),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
pub enum KnowledgeGraphVertex {
    Entity(PersistedEntity),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyVertices(HashMap<BaseUri, HashMap<OntologyTypeVersion, OntologyVertex>>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphVertices(
    HashMap<EntityIdentifier, HashMap<EntityVersion, KnowledgeGraphVertex>>,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(untagged)]
pub enum Vertices {
    Ontology(OntologyVertices),
    KnowledgeGraph(KnowledgeGraphVertices),
}
