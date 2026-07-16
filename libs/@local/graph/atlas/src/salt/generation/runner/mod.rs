//! Typed orchestration for one immutable canonical generation.
//!
//! The runner is the authority boundary between extracted graph data and
//! publishable state. It accepts source records and adapter capabilities, then
//! derives the identities and claims that enter the manifest. Artifact hashes,
//! gate outcomes, the canonical condition, and the generation identifier are
//! outputs of orchestration, not caller-authored fields.
//!
//! # State machine
//!
//! One successful run moves through the following states:
//!
//! ```text
//! source records
//!     -> authorized and frozen input
//!     -> staged projector fields and immutable artifacts
//!     -> validated manifest
//!     -> signed release report
//!     -> inactive candidate
//!     -> compare-and-swap activation
//!     -> independently reopened generation
//! ```
//!
//! [`run_store_backed_canonical_generation`] is the production entry point. It
//! verifies store-issued extraction provenance, authorizes the snapshot,
//! publishes an inactive candidate, performs explicit activation, and reloads
//! the result through the same verification path used after process restart.
//! The receipt-free runner is compiled only for internal pipeline tests so it
//! cannot mint production provenance.
//!
//! # Frozen input
//!
//! [`StoreBackedGenerationSource`] names the bitemporal extraction, embeddings,
//! relation candidates, policy records, quality-suite inputs, and model
//! artifacts. Authorization queries are derived from the same temporal axes
//! and checked against the manifest input snapshot before geometry is admitted.
//! The authorization revision is sampled before and after all permission calls;
//! a change aborts the run instead of combining multiple policy states.
//!
//! Freezing canonicalizes order-sensitive inputs, validates every scalar and
//! shape, derives relation cards and representations, and snapshots model files.
//! From that point onward, content identity does not depend on mutable source
//! paths or caller collection order.
//!
//! # Release boundary
//!
//! Runner-owned gates measure properties that can be recomputed from staged
//! artifacts. External gates are accepted only as report-backed grants signed
//! by independently pinned authorities for the exact release head. Candidate
//! publication verifies both classes before writing its marker. Activation
//! repeats verification and never infers approval from file presence.
//!
//! # Failure and cleanup
//!
//! A failed stage leaves the active pointer unchanged. Staged directories may
//! remain available for diagnosis, but readers cannot discover them through
//! activation. Repeating an identical desired activation is idempotent;
//! attempting it against a different expected head reports a conflict.

mod artifact;
mod error;
mod identity;
mod input;
mod manifest;
mod model;
mod production;
mod run;

pub(super) use self::input::FrozenGenerationInput;
#[cfg(test)]
pub(crate) use self::run::run_canonical_generation;
pub(crate) use self::{
    error::CanonicalGenerationError,
    input::{
        FrozenCanonicalSignals, FrozenProjectorTypeContext, GenerationFreezeSource,
        GenerationManifestContract, RelationModelSources, RelationPolicyInput,
        RelationPolicyRecords, StoreBackedGenerationSource,
    },
    model::{CanonicalGenerationConfig, CanonicalGenerationOutcome, CanonicalReleaseAuthority},
    production::{
        CompletedCanonicalGeneration, StoreBackedCanonicalGenerationRequest,
        StoreBackedSnapshotRequest, run_store_backed_canonical_generation,
    },
};

#[cfg(test)]
mod tests;
