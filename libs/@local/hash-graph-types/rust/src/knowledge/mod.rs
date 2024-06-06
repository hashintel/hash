pub mod entity;
pub mod link;

pub use self::{
    confidence::Confidence,
    property::{
        Property, PropertyDiff, PropertyMetadata, PropertyMetadataMap, PropertyMetadataMapElement,
        PropertyObject, PropertyPatchOperation, PropertyPath, PropertyPathElement,
        PropertyPathError, PropertyProvenance,
    },
};

mod confidence;
mod property;
