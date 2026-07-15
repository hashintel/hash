use core::{num::NonZeroUsize, time::Duration};

use camino::{Utf8Path, Utf8PathBuf};

use crate::salt::{
    evaluation::{ConditionDomain, ConditionMeasurementConfig},
    generation::{
        CanonicalMaterializationConfig, ConditionQualityEvaluator, ConditionQualityPolicy,
        LegacyCanvasExport, PersistenceGatePolicy, PersistenceQualityEvaluator, PublishedCandidate,
    },
    graph::{SemanticGraphConfig, USearchConfig},
    landmark::{LandmarkConfig, LandmarkFitConfig},
    manifest::GenerationManifest,
    projector::{
        ProjectorBatchPlanConfig, ProjectorConfig, ProjectorLossConfig, ProjectorOptimizerConfig,
    },
    relation::{AttractionConfig, ProtectionConfig},
    release::{
        ExternalGateVerifierSet, GateEvidenceError, GateEvidencePayload, GateId, GateSigner,
        ReleaseHead, TrustedExternalGateAuthority,
    },
};

/// Numerical and materialization settings for one generation.
pub(crate) struct CanonicalGenerationConfig<'config> {
    pub root: &'config Utf8Path,
    pub semantic_index: USearchConfig,
    pub semantic_graph: SemanticGraphConfig,
    pub audit_sample_size: NonZeroUsize,
    pub audit_seed: u64,
    pub attraction: AttractionConfig,
    pub protection: ProtectionConfig,
    pub landmarks: LandmarkConfig,
    pub landmark_assignment: USearchConfig,
    pub landmark_fit: LandmarkFitConfig,
    pub landmark_radius: f64,
    pub landmark_weight: f64,
    pub projector: ProjectorConfig,
    pub projector_batches: ProjectorBatchPlanConfig,
    pub projector_loss: ProjectorLossConfig,
    pub projector_optimizer: ProjectorOptimizerConfig,
    pub conditions: &'config [f32],
    pub condition_domain: ConditionDomain,
    pub condition_quality_evaluator: &'config dyn ConditionQualityEvaluator,
    pub condition_quality_policy: ConditionQualityPolicy,
    pub condition_measurement: ConditionMeasurementConfig,
    pub canonical_condition: f32,
    pub variant_quantization_step: f64,
    pub inference_batch_size: NonZeroUsize,
    pub materialization: CanonicalMaterializationConfig<'config>,
    pub persistence_policy: PersistenceGatePolicy<'config>,
    pub persistence_evaluator: &'config dyn PersistenceQualityEvaluator,
    pub legacy_tag: u16,
}

/// Trusted release signer and independently verified external authorities.
pub(crate) struct CanonicalReleaseAuthority<'authority> {
    signer: &'authority GateSigner,
    external_authorities: Vec<TrustedExternalGateAuthority<'authority>>,
    external_verifiers: ExternalGateVerifierSet,
}

impl<'authority> CanonicalReleaseAuthority<'authority> {
    /// Creates release authority from independently verified external services.
    ///
    /// # Errors
    ///
    /// Returns an error when an external authority is missing, duplicated, or
    /// assigned to a gate measured by the runner.
    pub(crate) fn new(
        signer: &'authority GateSigner,
        mut external_authorities: Vec<TrustedExternalGateAuthority<'authority>>,
    ) -> Result<Self, GateEvidenceError> {
        external_authorities.sort_unstable_by_key(TrustedExternalGateAuthority::gate);
        let external_verifiers = ExternalGateVerifierSet::new(
            &signer.verifier(),
            external_authorities
                .iter()
                .map(|authority| (authority.gate(), authority.verifier().clone()))
                .collect(),
        )?;
        Ok(Self {
            signer,
            external_authorities,
            external_verifiers,
        })
    }

    #[inline]
    pub(super) const fn signer(&self) -> &'authority GateSigner {
        self.signer
    }

    #[must_use]
    #[inline]
    pub(crate) const fn external_verifiers(&self) -> &ExternalGateVerifierSet {
        &self.external_verifiers
    }

    pub(super) fn issue_external_grants(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
    ) -> Result<Vec<GateEvidencePayload>, GateEvidenceError> {
        self.external_authorities
            .iter()
            .map(|authority| {
                let grant = authority.issue(head, manifest)?;
                match authority.gate() {
                    GateId::Representation => Ok(GateEvidencePayload::Representation(grant)),
                    GateId::SemanticFidelity => Ok(GateEvidencePayload::SemanticFidelity(grant)),
                    GateId::RelationPolicy => Ok(GateEvidencePayload::RelationPolicy(grant)),
                    GateId::MergeTreePersistence => {
                        let canonical = manifest
                            .variants
                            .entries
                            .iter()
                            .find(|variant| variant.id == manifest.variants.canonical_variant)
                            .ok_or(GateEvidenceError::Failed {
                                gate: GateId::MergeTreePersistence,
                                reason: "canonical persistence report is missing",
                            })?;
                        Ok(GateEvidencePayload::merge_tree_persistence(
                            &canonical.persistence_comparison,
                            grant,
                        ))
                    }
                    GateId::SubgroupBehavior => Ok(GateEvidencePayload::SubgroupBehavior(grant)),
                    GateId::AuthorizationNoninterference => {
                        Ok(GateEvidencePayload::AuthorizationNoninterference(grant))
                    }
                    GateId::SecurityApproval => Ok(GateEvidencePayload::SecurityApproval(grant)),
                    GateId::CompanionPin => Ok(GateEvidencePayload::CompanionPin(grant)),
                    gate @ (GateId::AnnRecall
                    | GateId::RelationSatisfaction
                    | GateId::TemporalDrift
                    | GateId::SnapshotConsistency
                    | GateId::Reproducibility) => Err(GateEvidenceError::Unexpected { gate }),
                }
            })
            .collect()
    }
}

/// Published but inactive output of one complete generation run.
#[derive(Debug, Clone)]
pub(crate) struct CanonicalGenerationOutcome {
    pub candidate: PublishedCandidate,
    pub manifest: GenerationManifest,
    pub legacy: LegacyCanvasExport,
    pub training_wall_time: Duration,
    pub directory: Utf8PathBuf,
}
