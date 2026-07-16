//! Explicit compare-and-swap activation of gated immutable generations.
//!
//! Candidate publication and activation are separate operations. A candidate
//! marker names one exact generation, base/delta head, manifest hash, and gate
//! report hash. Activation verifies that marker, then changes `active.json`
//! under a process-shared lock. Repeating the same desired activation is
//! idempotent; a stale expected head cannot overwrite a newer active release.
//!
//! # Compare-and-swap semantics
//!
//! [`FileActivationStore::compare_exchange`] takes both an expected active
//! release and a desired gated release. The activation lock establishes one
//! linearization point across processes:
//!
//! - if current state equals the desired release, the operation is already complete;
//! - if current state differs from the expected release, no file changes and a conflict reports the
//!   actual head; and
//! - otherwise a temporary pointer is written, synchronized, atomically renamed, and followed by a
//!   parent-directory synchronization.
//!
//! The expected value can be `None` for first activation. Callers must carry
//! the exact [`ActiveRelease`] they observed rather than comparing only a
//! generation identifier, because a release report is part of the visible
//! state.
//!
//! # Restart verification
//!
//! [`FileActivationStore::load_active`] does not trust `active.json` as an
//! authorization token. It follows the pointer to the candidate marker,
//! release report, signed gate documents, manifest, artifacts, and projector
//! checkpoint and revalidates the complete chain. The resulting
//! [`LoadedGeneration`] retains private immutable snapshots of verified
//! artifact bytes for its lifetime.
//!
//! A crash before the pointer rename leaves the old generation active. A crash
//! after the rename leaves either the complete old pointer or the complete new
//! pointer; startup verification still rejects a target whose durable
//! generation contents are incomplete.

mod error;
mod load;
mod store;

pub(super) use self::store::{publish_candidate_marker, withdraw_candidate_marker};
pub(crate) use self::{
    error::ActivationError,
    load::LoadedGeneration,
    store::{ActivationOutcome, ActiveRelease, FileActivationStore},
};

#[cfg(test)]
mod tests;
