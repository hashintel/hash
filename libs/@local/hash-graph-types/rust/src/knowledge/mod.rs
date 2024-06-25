pub mod entity;
pub mod link;

pub use self::{
    confidence::Confidence,
    entity::EntityTypeIdDiff,
    property::{
        ArrayMetadata, ObjectMetadata, PatchError, Property, PropertyDiff, PropertyMetadata,
        PropertyMetadataObject, PropertyObject, PropertyPatchOperation, PropertyPath,
        PropertyPathElement, PropertyProvenance, PropertyWithMetadata, PropertyWithMetadataObject,
        ValueMetadata,
    },
};

mod confidence;
mod property;
