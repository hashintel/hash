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
    array::ArrayMetadata,
    object::{ObjectMetadata, PropertyMetadataObject},
    provenance::PropertyProvenance,
};

mod array;
mod object;
mod provenance;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{knowledge::value::ValueMetadata, ontology::BaseUrl};

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
#[serde(untagged)]
pub enum PropertyMetadata {
    /// Metadata for an array property, containing element-level and array-level metadata.
    #[cfg_attr(feature = "utoipa", schema(title = "PropertyMetadataArray"))]
    Array {
        /// Metadata for each element in the array.
        ///
        /// The position of each metadata entry corresponds to the position of the
        /// element in the property array.
        #[serde(default)]
        #[cfg_attr(feature = "utoipa", schema(required))]
        value: Vec<Self>,

        /// Metadata that applies to the array as a whole.
        #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
        metadata: ArrayMetadata,
    },

    /// Metadata for an object property, containing field-level and object-level metadata.
    #[cfg_attr(feature = "utoipa", schema(title = "PropertyMetadataObject"))]
    Object {
        /// Metadata for each field in the object.
        ///
        /// The keys correspond to the property type URLs used in the object property.
        #[serde(default)]
        #[cfg_attr(feature = "utoipa", schema(required))]
        value: HashMap<BaseUrl, Self>,

        /// Metadata that applies to the object as a whole.
        #[serde(default, skip_serializing_if = "ObjectMetadata::is_empty")]
        metadata: ObjectMetadata,
    },

    /// Metadata for a primitive value property.
    #[cfg_attr(feature = "utoipa", schema(title = "PropertyMetadataValue"))]
    Value {
        /// Comprehensive metadata for a primitive value, including provenance,
        /// confidence, and data type information.
        metadata: ValueMetadata,
    },
}
