//! Typed orchestration for one immutable canonical generation.

mod artifact;
mod error;
mod identity;
mod input;
mod manifest;
mod model;
mod production;
mod run;

pub(super) use self::input::FrozenGenerationInput;
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
    run::run_canonical_generation,
};

#[cfg(test)]
mod tests;
