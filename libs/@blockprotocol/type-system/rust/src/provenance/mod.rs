//! Provenance module for tracking the origin and history of types.
//!
//! This module provides types for recording and tracking the provenance of ontology types
//! within the Block Protocol Type System. It defines structures for:
//!
//! 1. Actors - Entities that create or modify types (people, systems, organizations)
//! 2. Origins - Information about how types came into existence
//! 3. Sources - References to external sources that influenced type definitions
//!
//! These components work together to create a complete provenance record for ontology types,
//! enabling traceability and attribution throughout the type system.

mod origin;
mod source;

pub use self::{
    origin::{OriginProvenance, OriginType},
    source::{Location, SourceProvenance, SourceType},
};
