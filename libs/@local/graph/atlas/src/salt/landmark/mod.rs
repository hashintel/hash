//! Bounded, deterministic landmark selection.
//!
//! Selection treats corpus-scale work as a streaming top-priority problem. It
//! first satisfies declared subgroup minimums, then retains prior landmarks up
//! to the configured target, and finally fills the remaining capacity from the
//! complete corpus. Weighted random priorities are derived from stable row and
//! stratum identities, so neither thread scheduling nor input order changes the
//! selected set.

mod error;
mod select;

pub(crate) use self::{
    error::LandmarkError,
    select::{
        LandmarkCandidate, LandmarkConfig, LandmarkSelection, Stratum, StratumDimension,
        SubgroupMinimum, select_landmarks,
    },
};

#[cfg(test)]
mod tests;
