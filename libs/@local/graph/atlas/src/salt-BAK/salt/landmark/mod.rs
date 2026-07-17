//! Bounded, deterministic landmark selection.
//!
//! Selection treats corpus-scale work as a streaming top-priority problem. It
//! first satisfies declared subgroup minimums, then retains prior landmarks up
//! to the configured target, and finally fills the remaining capacity from the
//! complete corpus. Weighted random priorities are derived from stable row and
//! stratum identities, so neither thread scheduling nor input order changes the
//! selected set.
//!
//! # Weighted bounded selection
//!
//! A candidate with sampling weight `w` receives priority
//!
//! ```text
//! priority = -ln(U) / w
//! ```
//!
//! where `U` is derived from a domain-separated hash of the seed, generation
//! row, and complete categorical stratum tuple. Keeping the smallest
//! priorities implements weighted sampling without replacement. Selection
//! keeps only `O(maximum_count)` heap entries in addition to one corpus-sized
//! bitmap.
//!
//! Subgroup minimums are processed in canonical stratum order. An already
//! selected row can satisfy later overlapping minima. After minima, the
//! configured fraction of prior landmarks is retained when capacity permits;
//! the remaining slots use the same global priority rule. Output rows are
//! sorted by generation identity before hashing.
//!
//! # Assignment and quotient graph
//!
//! Every corpus row is assigned to its nearest selected representation.
//! Selected rows map to themselves exactly; other rows use the pinned cosine
//! ANN settings. The assignment is persisted because the transient ANN graph
//! is not a portable identity.
//!
//! Full-corpus fuzzy semantic edges are then contracted through that
//! assignment. Parallel edges between a pair of landmark cells are summed.
//! Each quotient row retains its strongest bounded neighbors, normalizes by
//! its row maximum, and symmetric union keeps the stronger direction.
//!
//! # Non-parametric reference
//!
//! A serial UMAP optimizer fits the quotient graph. Initial coordinates place
//! landmarks on an ordinal circle with content-derived radial jitter; the
//! optimizer random state is derived from the declared seed. The resulting
//! [`LandmarkSkeleton`] binds selected rows, dense assignment, optimization
//! configuration, and coordinates.
//!
//! The skeleton is both geometric support for projector training and an
//! independent reference for persistence analysis. It is never reconstructed
//! from the trained projector.

mod artifact;
mod assignment;
mod error;
mod fit;
mod select;

#[allow(
    unused_imports,
    reason = "landmark publication and diagnostics form the generation adapter surface"
)]
pub(crate) use self::{
    artifact::publish_landmark_skeleton,
    assignment::{LandmarkAssignment, LandmarkAssignmentError, assign_landmarks},
    error::LandmarkError,
    fit::{LandmarkFitConfig, LandmarkFitError, LandmarkSkeleton, fit_landmark_skeleton},
    select::{
        LandmarkCandidate, LandmarkConfig, LandmarkSelection, Stratum, StratumDimension,
        SubgroupMinimum, select_landmarks,
    },
};

#[cfg(test)]
mod tests;
