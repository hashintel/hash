//! Crate-private SALT surface consumed by the concrete fit façade.
//!
//! Keeping these re-exports behind one module prevents the operational adapter
//! from turning SALT's internal stage graph into a public crate API.

#![expect(
    unused_imports,
    reason = "the fit boundary centralizes stage types consumed across fit submodules"
)]

#[cfg(test)]
pub(crate) use super::manifest::fixture_manifest;
pub(crate) use super::{
    activation::{ActivationOutcome, ActiveRelease, FileActivationStore},
    analytic::{
        AnalyticPoint, MergeTree, MergeTreeConfig, RasterConfig, RegionConfig, density_raster,
        merge_tree,
    },
    card::CARD_FORMAT_VERSION,
    evaluation::{ConditionDomain, ConditionMeasurementConfig},
    generation::{
        CanonicalGenerationConfig, CanonicalGenerationError, CanonicalMaterializationConfig,
        CanonicalReleaseAuthority, CompletedCanonicalGeneration, ConditionQuality,
        ConditionQualityEvaluationError, ConditionQualityEvaluator, ConditionQualityPolicy,
        ExternalGateReportDocuments, FrozenCanonicalSignals, FrozenProjectorTypeContext,
        GenerationManifestContract, PersistedCondition, PersistedConditionQuality,
        PersistenceComparisonReport, PersistenceDiagnostics, PersistenceEvaluationError,
        PersistenceEvaluationSubject, PersistenceGatePolicy, PersistenceQualityEvaluator,
        ProjectedCondition, RelationModelSources, RelationPolicyInput, RelationPolicyRecords,
        StoreBackedCanonicalGenerationRequest, StoreBackedGenerationSource,
        StoreBackedSnapshotRequest, representation_stratification_hash,
        run_local_m0_canonical_generation,
    },
    graph::{SemanticGraphConfig, USearchConfig},
    identity::{ArtifactOrdinal, GenerationRowId, IdentityDirectory},
    landmark::{LandmarkCandidate, LandmarkConfig, LandmarkFitConfig, SubgroupMinimum},
    manifest::{
        ArtifactRole, GenerationManifest, KnowledgeDecisionTimePolicy, RelationSecurityMode,
    },
    materialize::{CoordinateBounds, ImportanceConfig},
    policy::{PlacementPosterior, Probability},
    projector::{
        CoordinateSupportRow, EntityRole, GradientBudget, HardNegativeConfig, LossWeights,
        ProjectorBatchPlanConfig, ProjectorConfig, ProjectorLossConfig, ProjectorOptimizerConfig,
        RelationEnergy, SemanticAffinity, SupportEnergy,
    },
    relation::{AttractionConfig, ProtectionConfig, RelationConfidence},
    release::{
        ExternalGateGrant, ExternalGateGrantIssuer, ExternalGateReport, GateEvidenceError, GateId,
        GateSigner, GateVerifier, ReleaseHead, TrustedExternalGateAuthority,
    },
    representation::{
        AUDITED_NEIGHBORS, AUDITED_PREFIX_DIMENSIONS, CanonicalEmbedding, OwnedCanonicalEmbedding,
        PROJECTOR_DIMENSIONS, RepresentationAuditReport, TRANSFORM_VERSION, canonical_corpus_hash,
        prefix_corpus_hash, projector_corpus_hash, transform_contract_hash,
        transform_golden_vectors_hash,
    },
    revision::{AuthorizationRevision, VariantId},
    snapshot::{
        AuthorizationRevisionProvider, AuthorizationRevisionProviderAdapter, EntityAtEdition,
        LinkCandidate, RelationSecurityPolicy, SnapshotError, SnapshotTemporalAxes,
        StoreExtractionReceipt,
    },
    strength::RelationStrength,
};
