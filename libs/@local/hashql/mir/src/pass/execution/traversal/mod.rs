//! Traversal path resolution and storage mapping.
//!
//! Maps property access projections on graph vertices to their backend storage locations.
//! Each vertex type has its own path enum ([`EntityPath`] for entities) that resolves
//! dot-notation field accesses to specific columns, JSONB paths, or embedding stores.
//!
//! [`TraversalPathBitSet`] and [`TraversalPath`] wrap the per-vertex-type path types so that
//! the execution pipeline can handle different vertex types uniformly.

mod access;
mod entity;

#[cfg(test)]
mod tests;

pub(crate) use self::access::Access;
pub use self::entity::{EntityPath, EntityPathBitSet};

/// Set of resolved traversal paths for a single vertex type.
///
/// Each variant wraps the bitset for a specific vertex type. A [`GraphReadFilter`] body operates
/// over exactly one vertex type, so all traversal locals within a body share the same variant.
///
/// An all-bits-set bitset indicates full vertex access is required (the path could not be
/// resolved to a specific field).
///
/// [`GraphReadFilter`]: crate::body::Source::GraphReadFilter
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TraversalPathBitSet {
    /// Paths into the entity schema.
    Entity(EntityPathBitSet),
}

/// A single resolved traversal path for a specific vertex type.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TraversalPath {
    /// A path into the entity schema.
    Entity(EntityPath),
}
