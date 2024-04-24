pub mod entity;
pub mod link;

pub use self::{
    confidence::Confidence,
    property::{
        Property, PropertyDiff, PropertyMetadata, PropertyMetadataMap, PropertyObject,
        PropertyPatchOperation, PropertyPath, PropertyPathElement, PropertyProvenance,
    },
};

mod confidence;
mod property;
