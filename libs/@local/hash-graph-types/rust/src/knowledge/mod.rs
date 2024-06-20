pub mod entity;
pub mod link;

pub use self::{
    confidence::Confidence,
    property::{
        ArrayMetadata, ObjectMetadata, Property, PropertyDiff, PropertyMetadataElement,
        PropertyMetadataObject, PropertyObject, PropertyPatchOperation, PropertyPath,
        PropertyPathElement, PropertyProvenance, PropertyWithMetadata, ValueMetadata,
    },
};

mod confidence;
mod property;
