//! The type postings.
//!
//! Per-type membership over the base delivery order, and the type graph it expands through.
//!
//! [`Postings`] is the filter contract's membership artifact (`SPEC-ADDENDUM-CLOUD.md` section 7;
//! `PLAN.md` "Serving contract requirements"): for every ontology row, which base delivery
//! positions carry that type **directly**. A type filter ORs requested rows' membership into one
//! dense position bitmap; the wire's `TYPE_MASK` column slices membership over a tile's delivered
//! runs. Inheritance never rides the membership: requests expand to descendant rows first through
//! the [`ClosureMap`] derived from the published parent edges, so the type graph stays the one
//! authority for inheritance and no closure is ever materialized on disk.
//!
//! Membership is stored per type in the cheaper of two representations, chosen by the writer and
//! recorded in the file's flags region:
//!
//! - a **list**: the positions sorted ascending, `4` bytes each - the shape a run slice reads
//!   linearly;
//! - a **dense bitmap** over all `N` positions, `ceil(N/32)` `u32` words - the shape the mega types
//!   demand. Type volume is structurally skewed (one base type owns half of all instances in the
//!   measured store), so an all-list format would degenerate exactly on the types most worth
//!   coloring by.
//!
//! Readers honor whichever representation the file records; the threshold is writer policy
//! ([`PostingsConfig`]), so revising it never touches the read path.
//!
//! It derives from the same row-order type column the quadtree consumes
//! ([`crate::salt::lod::quad::QuadTree::build`]'s `types` parameter), gathered through the lod's
//! permutation, and publishes as one [`crate::file::postings`] file; [`PostingsArchive`] reopens
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
//!   the dataset's `Ontology::parents` contract.

pub(crate) mod build;
pub(crate) mod closure;
pub(crate) mod mapped;

#[cfg(test)]
mod tests;
