use crate::knowledge::value::{Value, ValueMetadata};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyWithMetadataValue {
    pub value: Value,
    pub metadata: ValueMetadata,
}
