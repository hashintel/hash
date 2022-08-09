//! Definitions of the elements of the Type System stored in the [`store`].
//!
//! This module contains the definitions of [`DataType`]s, [`PropertyType`]s, [`EntityType`]s, and
//! [`LinkType`]s. The structs are Rust representations of their meta-schemas defined within the
//! Block Protocol specification, and are used to validate instances of types using [`serde`]. To
//! aid with the de/serialization, intermediary structs and helpers are defined across various
//! submodules.
//!
//! [`store`]: crate::store

pub mod uri;

mod data_type;
mod entity_type;
mod link_type;
mod property_type;

pub use crate::ontology::types::{
    data_type::{DataType, DataTypeReference},
    entity_type::{EntityType, EntityTypeReference},
    link_type::LinkType,
    property_type::{PropertyType, PropertyTypeReference},
};

pub mod error;

mod serde_shared;
