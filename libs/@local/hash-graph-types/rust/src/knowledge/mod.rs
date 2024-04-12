pub mod entity;
pub mod link;

pub use self::{
    confidence::Confidence,
    property::{
        Property, PropertyConfidence, PropertyDiff, PropertyObject, PropertyPatchOperation,
        PropertyPath, PropertyPathElement,
    },
};

mod confidence;
mod property;
