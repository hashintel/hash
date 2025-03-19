//! Knowledge representation for entities, properties, and values in the system.
//!
//! This module provides the core knowledge structures used throughout the Block Protocol
//! type system. It defines three primary components:
//!
//! - [`Entity`]: The fundamental unit of knowledge, representing a real-world object, concept, or
//!   thing with defined properties and relationships. [`Entity`]s conform to [`EntityType`]s
//!   defined in the ontology.
//! - [`Property`]: Structured data associated with entities, which can be simple values, arrays, or
//!   nested objects. Properties conform to [`PropertyType`]s defined in the ontology.
//! - [`PropertyValue`]: Primitive data values like strings, numbers, booleans, etc., which form the
//!   atomic units of knowledge within properties. [`PropertyValue`]s conform to [`DataType`]s
//!   defined in the ontology.
//!
//! These components are complemented by comprehensive metadata tracking, including provenance,
//! temporal versioning, confidence scoring, and type information.
//!
//! [`EntityType`]: crate::ontology::entity_type::EntityType
//! [`PropertyType`]: crate::ontology::property_type::PropertyType
//! [`DataType`]: crate::ontology::data_type::DataType

pub mod entity;
pub mod property;
pub mod value;

mod confidence;

pub use confidence::Confidence;

pub use self::{entity::Entity, property::Property, value::PropertyValue};
