//! Metadata for properties, tracking provenance, confidence, and structural information.
//!
//! This module provides a hierarchy of metadata types that mirror the structure of properties,
//! enabling tracking of metadata at each level of the property hierarchy (values, arrays, and
//! objects). The metadata includes:
//!
//! - Provenance information (who created/updated the property, when, and how)
//! - Confidence scores for the property values
//! - Type information linking to data types in the ontology
//! - Structural metadata for arrays and objects

pub use self::{
    array::{ArrayMetadata, PropertyArrayMetadata},
    object::{ObjectMetadata, PropertyObjectMetadata},
    provenance::PropertyProvenance,
    value::PropertyValueMetadata,
};

mod array;
mod object;
mod provenance;
mod value;
use serde::{Deserialize, Serialize};

/// Metadata for property values, structured to match the hierarchical nature of properties.
///
/// [`PropertyMetadata`] follows the same structure as the [`Property`] enum, providing
/// metadata for arrays, objects, and values. This parallel structure ensures that
/// every property element can have associated metadata regardless of its type.
///
/// The metadata at each level includes relevant information like provenance, confidence,
/// and type references, allowing for fine-grained tracking of data origins and reliability.
///
/// [`Property`]: crate::knowledge::property::Property
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[serde(untagged)]
pub enum PropertyMetadata {
    /// Metadata for an array property, containing element-level and array-level metadata.
    Array(PropertyArrayMetadata),

    /// Metadata for an object property, containing field-level and object-level metadata.
    Object(PropertyObjectMetadata),

    /// Metadata for a primitive value property.
    Value(PropertyValueMetadata),
}
