pub mod entity;
pub mod link;

mod confidence;
mod property;

pub use self::{
    confidence::Confidence,
    property::{PropertyPath, PropertyPathElement},
};
