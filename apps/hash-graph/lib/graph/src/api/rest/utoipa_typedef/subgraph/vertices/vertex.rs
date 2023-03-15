use serde::{Deserialize, Serialize};
use type_system::url::BaseUrl;
use utoipa::ToSchema;

use crate::{
    identifier::ontology::OntologyTypeVersion,
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    subgraph::identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId},
};

// WARNING: will always deserialize as `DataType`
#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
#[expect(clippy::enum_variant_names)]
pub enum OntologyTypeVertexId {
    DataType(DataTypeVertexId),
    PropertyType(PropertyTypeVertexId),
    EntityType(EntityTypeVertexId),
}

impl OntologyTypeVertexId {
    #[must_use]
    pub const fn base_id(&self) -> &BaseUrl {
        match self {
            Self::DataType(id) => &id.base_id,
            Self::PropertyType(id) => &id.base_id,
            Self::EntityType(id) => &id.base_id,
        }
    }

    #[must_use]
    pub const fn revision_id(&self) -> OntologyTypeVersion {
        match self {
            Self::DataType(id) => id.revision_id,
            Self::PropertyType(id) => id.revision_id,
            Self::EntityType(id) => id.revision_id,
        }
    }
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", content = "inner")]
#[serde(rename_all = "camelCase")]
#[expect(clippy::enum_variant_names)]
pub enum OntologyVertex {
    #[schema(title = "DataTypeVertex")]
    DataType(Box<DataTypeWithMetadata>),
    #[schema(title = "PropertyTypeVertex")]
    PropertyType(Box<PropertyTypeWithMetadata>),
    #[schema(title = "EntityTypeVertex")]
    EntityType(Box<EntityTypeWithMetadata>),
}

impl From<DataTypeWithMetadata> for OntologyVertex {
    fn from(data_type: DataTypeWithMetadata) -> Self {
        Self::DataType(Box::new(data_type))
    }
}

impl From<PropertyTypeWithMetadata> for OntologyVertex {
    fn from(property_type: PropertyTypeWithMetadata) -> Self {
        Self::PropertyType(Box::new(property_type))
    }
}

impl From<EntityTypeWithMetadata> for OntologyVertex {
    fn from(entity_type: EntityTypeWithMetadata) -> Self {
        Self::EntityType(Box::new(entity_type))
    }
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", content = "inner")]
#[serde(rename_all = "camelCase")]
pub enum KnowledgeGraphVertex {
    #[schema(title = "EntityVertex")]
    Entity(Entity),
}

#[derive(Debug, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
#[expect(dead_code, reason = "This is used in the generated OpenAPI spec")]
pub enum Vertex {
    #[schema(title = "OntologyVertex")]
    Ontology(Box<OntologyVertex>),
    #[schema(title = "KnowledgeGraphVertex")]
    KnowledgeGraph(Box<KnowledgeGraphVertex>),
}
