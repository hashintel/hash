pub use self::{
    array::ArrayMetadata,
    object::{ObjectMetadata, PropertyMetadataObject},
    provenance::PropertyProvenance,
    value::{ValueMetadata, ValueWithMetadata},
};

mod array;
mod object;
mod provenance;
mod value;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use type_system::url::BaseUrl;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum PropertyMetadata {
    #[cfg_attr(feature = "utoipa", schema(title = "PropertyMetadataArray"))]
    Array {
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        value: Vec<Self>,
        #[serde(default, skip_serializing_if = "ArrayMetadata::is_empty")]
        metadata: ArrayMetadata,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "PropertyMetadataObject"))]
    Object {
        #[serde(default, skip_serializing_if = "HashMap::is_empty")]
        value: HashMap<BaseUrl, Self>,
        #[serde(default, skip_serializing_if = "ObjectMetadata::is_empty")]
        metadata: ObjectMetadata,
    },
    #[cfg_attr(feature = "utoipa", schema(title = "PropertyMetadataValue"))]
    Value { metadata: ValueMetadata },
}
