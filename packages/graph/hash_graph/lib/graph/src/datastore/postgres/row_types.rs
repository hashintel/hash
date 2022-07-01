//! Descriptions, and implementation logic, of the Types of elements of the graph.

use sqlx::{types::Uuid, FromRow};

#[derive(Debug, FromRow)]
pub struct DataTypeRow {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, FromRow)]
pub struct PropertyTypeRow {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, FromRow)]
pub struct EntityTypeRow {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, FromRow)]
pub struct EntityRow {
    pub entity_id: Uuid,
    pub source_entity_type_version_id: Uuid,
    pub properties: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Debug, FromRow)]
pub struct PropertyTypePropertyTypeReferenceRow {
    pub source_property_type_version_id: Uuid,
    pub target_property_type_version_id: Uuid,
}

#[derive(Debug, FromRow)]
pub struct PropertyTypeDataTypeReferenceRow {
    pub source_property_type_version_id: Uuid,
    pub target_data_type_version_id: Uuid,
}

#[derive(Debug, FromRow)]
pub struct EntityTypePropertyTypeReferenceRow {
    pub source_entity_type_version_id: Uuid,
    pub target_property_type_version_id: Uuid,
}
