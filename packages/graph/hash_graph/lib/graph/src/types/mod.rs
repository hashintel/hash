//! Model types used across datastores

use std::fmt;

use uuid::Uuid;

#[derive(Clone, Debug)]

pub struct Identifier {
    pub base_id: Uuid,
    pub version_id: Uuid,
}

impl fmt::Display for Identifier {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "[base_id='{}', version_id='{}']",
            self.base_id, self.version_id
        )
    }
}

#[derive(Clone, Debug)]
pub struct DataType {
    pub id: Identifier,
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
