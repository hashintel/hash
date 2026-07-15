//! Bounded, deterministic landmark selection.
//!
//! Selection treats corpus-scale work as a streaming top-priority problem. It
//! first satisfies declared subgroup minimums, then retains prior landmarks up
//! to the configured target, and finally fills the remaining capacity from the
//! complete corpus. Weighted random priorities are derived from stable row and
//! stratum identities, so neither thread scheduling nor input order changes the
//! selected set.

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
