use graph::subgraph::identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId};
use graph_types::{
    knowledge::entity::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};
use serde::Serialize;
use type_system::url::{BaseUrl, OntologyTypeVersion};
use utoipa::ToSchema;

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(untagged)]
#[expect(clippy::enum_variant_names)]
pub(crate) enum OntologyTypeVertexId {
    DataType(DataTypeVertexId),
    PropertyType(PropertyTypeVertexId),
    EntityType(EntityTypeVertexId),
}

impl OntologyTypeVertexId {
    #[must_use]
    pub(crate) const fn base_id(&self) -> &BaseUrl {
        match self {
            Self::DataType(id) => &id.base_id,
            Self::PropertyType(id) => &id.base_id,
            Self::EntityType(id) => &id.base_id,
        }
    }

    #[must_use]
    pub(crate) const fn revision_id(&self) -> OntologyTypeVersion {
        match self {
            Self::DataType(id) => id.revision_id,
            Self::PropertyType(id) => id.revision_id,
            Self::EntityType(id) => id.revision_id,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(tag = "kind", content = "inner")]
#[serde(rename_all = "camelCase")]
#[expect(clippy::enum_variant_names)]
pub(crate) enum OntologyVertex {
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

#[derive(Debug, PartialEq, Serialize, ToSchema)]
#[serde(tag = "kind", content = "inner")]
#[serde(rename_all = "camelCase")]
pub(crate) enum KnowledgeGraphVertex {
    #[schema(title = "EntityVertex")]
    Entity(Entity),
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
#[expect(dead_code, reason = "This is used in the generated OpenAPI spec")]
pub(crate) enum Vertex {
    #[schema(title = "OntologyVertex")]
    Ontology(Box<OntologyVertex>),
    #[schema(title = "KnowledgeGraphVertex")]
    KnowledgeGraph(Box<KnowledgeGraphVertex>),
}
