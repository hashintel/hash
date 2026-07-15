//! Explicit compare-and-swap activation of gated immutable generations.
//!
//! Candidate publication and activation are separate operations. A candidate
//! marker names one exact generation, base/delta head, manifest hash, and gate
//! report hash. Activation verifies that marker, then changes `active.json`
//! under a process-shared lock. Repeating the same desired activation is
//! idempotent; a stale expected head cannot overwrite a newer active release.

mod error;
mod load;
mod store;

pub(super) use self::store::publish_candidate_marker;
#[allow(
    unused_imports,
    reason = "the verified active loader forms the external serving adapter surface"
)]
pub(crate) use self::{
    error::ActivationError,
    load::LoadedGeneration,
    store::{ActivationOutcome, ActiveRelease, FileActivationStore},
};

#[cfg(test)]
mod tests;
