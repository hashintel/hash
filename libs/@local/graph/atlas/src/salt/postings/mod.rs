//! The type postings.
//!
//! Per-type membership over the base delivery order, and the type graph it expands through.
//!
//! [`Postings`](build::Postings) is the filter contract's membership artifact. For every ontology
//! row it records which base delivery positions carry that type **directly**. A type filter ORs
//! requested rows' membership into one dense position bitmap; the wire's `TYPE_MASK` column slices
//! membership over a tile's delivered runs. Inheritance never rides the membership. Requests expand
//! to descendant rows first through the [`ClosureMap`](closure::ClosureMap) derived from the
//! published parent edges, so the type graph stays the one authority for inheritance and no closure
//! is ever materialized on disk.
//!
//! The file stores each type's membership in the cheaper of two representations. The writer chooses
//! which one and the flags region records the choice:
//!
//! - a **list**: the positions sorted ascending, `4` bytes each - the shape a run slice reads
//!   linearly;
//! - a **dense bitmap** over all `N` positions, `ceil(N/32)` `u32` words - the shape the mega types
//!   demand. Type volume is structurally skewed (one base type owns half of all instances in the
//!   measured store), so an all-list format degenerates exactly on the types most worth coloring
//!   by.
//!
//! Readers honor whichever representation the file records. The threshold is writer policy
//! ([`PostingsConfig`](build::PostingsConfig)) and revising it never touches the read path.
//!
//! It derives from the same row-order type column the quadtree consumes
//! ([`crate::salt::lod::quad::QuadTree::build`]'s `types` parameter), gathered through the lod's
//! permutation, and publishes as one [`crate::file::postings`] file;
//! [`PostingsArchive`](artifact::PostingsArchive) reopens
//! the file over a whole-file mapping and validates the artifact contract once, so lookups read
//! from the page cache without holding anything on the heap.
//!
//! # Artifact contract
//!
//! - Fenceposts anchor at zero, never decrease, and close at their array's length - both the
//!   membership and parent regions.
//! - A list run holds strictly ascending base positions below `N`; a dense run holds exactly
//!   `ceil(N/32)` words with every bit at or beyond `N` clear.
//! - A parent list holds strictly ascending ontology rows below `T`: direct parents only, exactly
//!   the [`Ontology::parents`](crate::dataset::Ontology::parents) contract.

pub(crate) mod artifact;
pub(crate) mod build;
pub(crate) mod closure;

#[cfg(test)]
mod tests;
