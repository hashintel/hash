//! Primitive property values with associated metadata.
//!
//! This module provides a structure for combining primitive values with their metadata,
//! enabling operations that work on both aspects simultaneously.

use crate::knowledge::value::{Value, ValueMetadata};

/// A primitive value with its associated metadata.
///
/// [`PropertyWithMetadataValue`] combines a [`Value`] (such as a string, number, or boolean)
/// with its [`ValueMetadata`] containing provenance, confidence, and type information.
///
/// This structure is used as the leaf node in the [`PropertyWithMetadata`] hierarchy,
/// representing atomic data values with their context.
///
/// [`PropertyWithMetadata`]: crate::knowledge::property::PropertyWithMetadata
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PropertyValueWithMetadata {
    /// The primitive value data, such as a string, number, or boolean.
    #[cfg_attr(target_arch = "wasm32", tsify(type = "JsonValue"))]
    pub value: Value,

    /// Metadata for the value, including provenance, confidence, and type information.
    pub metadata: ValueMetadata,
}
