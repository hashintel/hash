//! Explicit compare-and-swap activation of gated immutable generations.
//!
//! Candidate publication and activation are separate operations. A candidate
//! marker names one exact generation, base/delta head, manifest hash, and gate
//! report hash. Activation verifies that marker, then changes `active.json`
//! under a process-shared lock. Repeating the same desired activation is
//! idempotent; a stale expected head cannot overwrite a newer active release.

mod error;
mod store;

pub(crate) use self::{
    error::ActivationError,
    store::{ActivationOutcome, ActiveRelease, FileActivationStore, publish_candidate_marker},
};

#[cfg(test)]
mod tests;
