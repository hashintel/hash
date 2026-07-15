//! Condition-ladder projection and canonical generation publication.
//!
//! Projector fields remain disposable until every candidate has complete
//! quality evidence and cross-condition measurements. Canonical selection then
//! aligns coordinates into the zero-condition reference frame. Immutable
//! materialization, gated candidate publication, and explicit compare-and-swap
//! activation remain distinct state transitions.

mod error;
mod export;
mod ladder;
mod materialize;
mod publish;
mod runner;

#[expect(
    unused_imports,
    reason = "generation entry points are consumed by the external serving adapter"
)]
pub(crate) use self::{
    error::GenerationError,
    export::{LegacyCanvasExport, LegacyExportFile, LegacyLayoutTag, export_legacy_canvas},
    ladder::{
        ConditionQuality, EvaluatedGeneration, ProjectedCondition, ProjectedLadder,
        project_condition_ladder,
    },
    materialize::{
        CanonicalArtifacts, CanonicalMaterializationConfig, CanonicalSignals, materialize_canonical,
    },
    publish::{PublishedCandidate, activate_generation, publish_generation_candidate},
    runner::{
        CanonicalGenerationConfig, CanonicalGenerationError, CanonicalGenerationOutcome,
        FrozenCanonicalSignals, FrozenGenerationInput, FrozenProjectorTypeContext,
        GenerationFreezeSource, RelationModelSources, freeze_generation_input,
        run_canonical_generation,
    },
};

#[cfg(test)]
mod tests;
