//! Typed orchestration for one immutable canonical generation.

mod artifact;
mod error;
mod identity;
mod input;
mod manifest;
mod model;
mod run;

pub(crate) use self::{
    error::CanonicalGenerationError,
    input::{
        FrozenCanonicalSignals, FrozenGenerationInput, FrozenProjectorTypeContext,
        GenerationFreezeSource, RelationModelSources, freeze_generation_input,
    },
    model::{CanonicalGenerationConfig, CanonicalGenerationOutcome},
    run::run_canonical_generation,
};

#[cfg(test)]
mod tests;
