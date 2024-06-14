pub mod entity;
pub mod link;

pub use self::{
    confidence::Confidence,
    property::{
        ArrayMetadata, ObjectMetadata, Property, PropertyDiff, PropertyMetadataArray,
        PropertyMetadataElement, PropertyMetadataObject, PropertyObject, PropertyPatchOperation,
        PropertyPath, PropertyPathElement, PropertyProvenance, PropertyWithMetadata, ValueMetadata,
    },
};

mod confidence;
mod property;
