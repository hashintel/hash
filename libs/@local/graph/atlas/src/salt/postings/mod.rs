//! Direct type memberships and the parent graph that defines their inheritance.
//!
//! [`Postings`](build::Postings) records which base delivery positions carry each ontology row
//! **directly**. The published parent edges remain the authority for inheritance.
//! [`ClosureMap`](closure::ClosureMap) derives inherited memberships at open for types with
//! descendants beyond themselves. Requests borrow that derived membership when present and the
//! direct postings otherwise. Inheritance never changes the stored direct membership, and no
//! closure is materialized on disk.
//!
//! The file stores each type's membership in the cheaper of two representations. The writer chooses
//! which one and the flags region records the choice:
//!
//! - a **list**: the positions sorted ascending, `4` bytes each, readable linearly;
//! - a **dense set** over all `N` positions, one self-describing bit set frame. Its size depends on
//!   the point domain rather than the type's population. This bounds storage for heavily populated
//!   types when membership volumes are skewed.
//!
//! Readers honor whichever representation the file records. The writer picks the cheaper one by
//! comparing byte costs - the frame against four bytes per member. The split carries no
//! tuning knob and follows the data alone.
//!
//! Beside the membership the file stores its transpose, the **direct map** - each base position's
//! direct type rows as one fencepost-delimited run per position. That is the position-scoped
//! lookup - which types does this delivered position carry - answered from one run read. The
//! build gathers the direct map from the row-order type column first and derives the membership
//! regions from it by inversion. Every gathered position-type pair is inserted into its type's
//! membership. Therefore both directions carry exactly the same relation.
//!
//! The postings publish as one [`crate::file::postings`] file.
//! [`PostingsArchive`](artifact::PostingsArchive) validates the artifact contract over a whole-file
//! mapping. Lookups borrow the mapped regions instead of copying the membership arrays onto the
//! heap.
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
