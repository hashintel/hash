//! Condition-ladder projection and canonical generation publication.
//!
//! Projector fields remain disposable until every candidate has complete
//! quality evidence and cross-condition measurements. Canonical selection then
//! aligns coordinates into the zero-condition reference frame. Immutable
//! materialization, gated candidate publication, and explicit compare-and-swap
//! activation remain distinct state transitions.

mod adapters;
mod error;
mod export;
mod ladder;
mod materialize;
mod persistence;
mod publish;
mod runner;

#[expect(
    unused_imports,
    reason = "generation entry points are consumed by the external serving adapter"
)]
pub(crate) use self::{
    adapters::{ConditionQualitySuiteAdapter, PersistenceQualitySuiteAdapter},
    error::GenerationError,
    export::{
        LegacyCanvasExport, LegacyExportFile, LegacyLayoutTag, export_legacy_canvas,
        publish_opaque_file,
    },
    ladder::{
        ConditionQuality, ConditionQualityEvaluationError, ConditionQualityEvaluator,
        ConditionQualityPolicy, EvaluatedGeneration, PersistedCondition, PersistedConditionQuality,
        ProjectedCondition, ProjectedLadder, evaluate_persisted_quality, project_condition_ladder,
    },
    materialize::{
        CanonicalArtifacts, CanonicalMaterializationConfig, CanonicalSignals, materialize_canonical,
    },
    persistence::{
        PersistenceComparisonError, PersistenceComparisonReport, PersistenceDiagnostics,
        PersistenceEvaluationError, PersistenceEvaluationSubject, PersistenceGatePolicy,
        PersistenceQualityEvaluator, compare_persistence, landmark_reference_tree,
        persistence_reference_source_hash,
    },
    publish::{PublishedCandidate, activate_generation, publish_generation_candidate},
    runner::{
        CanonicalGenerationConfig, CanonicalGenerationError, CanonicalGenerationOutcome,
        CanonicalReleaseAuthority, CompletedCanonicalGeneration, ExternalGateReportDocuments,
        FrozenCanonicalSignals, FrozenProjectorTypeContext, GenerationFreezeSource,
        GenerationManifestContract, RelationModelSources, RelationPolicyInput,
        RelationPolicyRecords, StoreBackedCanonicalGenerationRequest, StoreBackedGenerationSource,
        StoreBackedSnapshotRequest, representation_stratification_hash,
        run_local_m0_canonical_generation, run_store_backed_canonical_generation,
    },
};

#[cfg(test)]
mod tests;
