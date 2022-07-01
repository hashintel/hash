//! Model types used across datastores

use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct DataType {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Clone, Debug)]
pub struct PropertyType {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}

#[derive(Clone, Debug)]
pub struct EntityType {
    pub version_id: Uuid,
    pub schema: serde_json::Value,
    pub created_by: Uuid,
}
