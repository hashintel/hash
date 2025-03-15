use crate::knowledge::value::ValueMetadata;

#[derive(Debug, Default, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyValueMetadata {
    /// Comprehensive metadata for a primitive value, including provenance,
    /// confidence, and data type information.
    pub metadata: ValueMetadata,
}
