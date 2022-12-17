use serde::{Deserialize, Serialize};
use utoipa::{
    openapi::{KnownFormat, Object, ObjectBuilder, Schema, SchemaFormat, SchemaType},
    ToSchema,
};

use crate::identifier::{knowledge::EntityId, TransactionTimestamp};

pub mod subgraph;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityIdAndTimestamp {
    pub base_id: EntityId,
    pub timestamp: TransactionTimestamp,
}

// WARNING: This MUST be kept up to date with the struct names and serde attributes
//   Necessary because Timestamp doesn't implement ToSchema
impl ToSchema for EntityIdAndTimestamp {
    fn schema() -> Schema {
        ObjectBuilder::new()
            .property(
                "baseId",
                // Apparently OpenAPI doesn't support const values, the best you can do is
                // an enum with one option
                EntityId::schema(),
            )
            .required("baseId")
            .property(
                "timestamp",
                Object::from(
                    ObjectBuilder::new()
                        .schema_type(SchemaType::String)
                        .format(Some(SchemaFormat::KnownFormat(KnownFormat::DateTime))),
                ),
            )
            .required("timestamp")
            .into()
    }
}
