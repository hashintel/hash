//! The type postings.
//!
//! Per-type membership over the base delivery order, and the type graph it expands through.
//!
//! [`Postings`](build::Postings) is the filter contract's membership artifact. For every ontology
//! row it records which base delivery positions carry that type **directly**. A type filter ORs
//! requested rows' membership into one dense position bitmap, and the wire's `TYPE_MASK` column
//! slices membership over a tile's delivered runs. Inheritance never rides the membership. Requests
//! expand to descendant rows first through the [`ClosureMap`](closure::ClosureMap) derived from the
//! published parent edges, so the type graph stays the one authority for inheritance and no closure
//! is ever materialized on disk.
//!
//! The file stores each type's membership in the cheaper of two representations. The writer chooses
//! which one and the flags region records the choice:
//!
//! - a **list**: the positions sorted ascending, `4` bytes each - the shape a run slice reads
//!   linearly;
//! - a **dense set** over all `N` positions, one self-describing bit set frame - the shape the mega
//!   types demand. Type volume is structurally skewed (one base type owns half of all instances in
//!   the measured store), so an all-list format degenerates exactly on the types most worth
//!   coloring by.
//!
//! Readers honor whichever representation the file records. The writer picks the cheaper one by
//! comparing byte costs - the frame against four bytes per member. The split therefore carries no
//! tuning knob and follows the data alone.
//!
//! Beside the membership the file stores its transpose, the **direct map** - each base position's
//! direct type rows as one fencepost-delimited run per position. That is the position-scoped
//! lookup - which types does this delivered position carry - answered from one run read. The
//! build gathers the direct map from the row-order type column first and derives the membership
//! regions from it by inversion. Both directions therefore carry one relation and agree by
//! construction.
//!
//! It derives from the same row-order type column the quadtree consumes
//! ([`crate::salt::lod::quad::QuadTree::build`]'s `types` parameter), gathered through the lod's
//! permutation, and publishes as one [`crate::file::postings`] file;
//! [`PostingsArchive`](artifact::PostingsArchive) reopens the file over a whole-file mapping and
//! validates the artifact contract once, so lookups read from the page cache without holding
//! anything on the heap.
//!
//! # Artifact contract
//!
//! - Fenceposts anchor at zero, never decrease, and close at their array's length - the membership,
//!   parent, and direct regions alike.
//! - A list run holds strictly ascending base positions below `N`.
//! - A dense type's list run is empty. Its membership is its bit set frame, whose shape the file
//!   format validates at open: the frame's domain restates `N`, and every bit at or beyond `N` is
//!   zero.
//! - A parent list holds strictly ascending ontology rows below `T`: direct parents only, exactly
//!   the [`Ontology::parents`](crate::dataset::Ontology::parents) contract.
//! - A direct run holds strictly ascending ontology rows below `T`: its position's direct types.
//! - The direct entry count is the membership total - the list entries plus the dense populations -
//!   because every position-type pair appears once in each direction. The count is the open check;
//!   full transpose agreement is the build's construction.

pub(crate) mod artifact;
pub(crate) mod build;
pub(crate) mod closure;

#[cfg(test)]
mod tests;
