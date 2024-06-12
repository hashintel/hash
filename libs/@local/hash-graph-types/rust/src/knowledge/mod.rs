pub mod entity;
pub mod link;

pub use self::{
    confidence::Confidence,
    property::{
        Property, PropertyDiff, PropertyMetadataArray, PropertyMetadataElement,
        PropertyMetadataObject, PropertyMetadataValue, PropertyObject, PropertyPatchOperation,
        PropertyPath, PropertyPathElement, PropertyProvenance,
    },
};

mod confidence;
mod property;
