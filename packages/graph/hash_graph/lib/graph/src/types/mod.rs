//! Descriptions, and implementation logic, of the Types of elements of the graph.

use sqlx::{types::Uuid, FromRow};

#[derive(Debug, FromRow)]
pub struct DataType {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, FromRow)]
pub struct PropertyType {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, FromRow)]
pub struct EntityType {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, FromRow)]
pub struct Entity {
    pub entity_id: Uuid,
    pub source_entity_type_version_id: Uuid,
    pub properties: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, FromRow)]
pub struct PropertyTypePropertyTypeReference {
    pub source_property_type_version_id: Uuid,
    pub target_property_type_version_id: Uuid,
}

#[derive(Debug, FromRow)]
pub struct PropertyTypeDataTypeReference {
    pub source_property_type_version_id: Uuid,
    pub target_data_type_version_id: Uuid,
}

#[derive(Debug, FromRow)]
pub struct EntityTypePropertyTypeReference {
    pub source_entity_type_version_id: Uuid,
    pub target_property_type_version_id: Uuid,
}
