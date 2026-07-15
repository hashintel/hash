use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::{
    ExternalGateGrant, ExternalGateVerifierSet, GateEvidenceError, GateSigner, GateVerifier,
    SignatureHex,
};
use crate::salt::{
    graph::audit::{MINIMUM_RECALL, RecallAudit},
    hash::{ContentHash, ContentHasher},
    manifest::GenerationManifest,
    release::{GateId, GateOutcome, GateReport, ReleaseHead},
};

mod validate;

const EVIDENCE_VERSION: u32 = 15;

/// Typed measurements or approvals for one mandatory release gate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    deny_unknown_fields,
    tag = "gate",
    content = "evidence",
    rename_all = "kebab-case"
)]
pub(crate) enum GateEvidencePayload {
    Representation(ExternalGateGrant),
    AnnRecall {
        backend: ContentHash,
        sample: ContentHash,
        sample_rows: usize,
        neighbors_per_row: usize,
        matched: u64,
        expected: u64,
        recall_at_50_bits: u64,
    },
    SemanticFidelity(ExternalGateGrant),
    RelationPolicy(ExternalGateGrant),
    RelationSatisfaction {
        selection_evidence: ContentHash,
        baseline_field: ContentHash,
        canonical_field: ContentHash,
        baseline_loss_bits: u64,
        canonical_loss_bits: u64,
        tolerance_bits: u64,
    },
    MergeTreePersistence {
        grant: ExternalGateGrant,
        report: ContentHash,
        candidate_tree: ContentHash,
        reference_tree: ContentHash,
    },
    TemporalDrift(ExternalGateGrant),
    SubgroupBehavior(ExternalGateGrant),
    AuthorizationNoninterference(ExternalGateGrant),
    SnapshotConsistency {
        frozen_input: ContentHash,
        security_geometry: ContentHash,
        identity_directory: ContentHash,
        row_count: u64,
    },
    Reproducibility {
        recipe: ContentHash,
        first_output: ContentHash,
        second_output: ContentHash,
        artifact_count: usize,
    },
    SecurityApproval(ExternalGateGrant),
    CompanionPin(ExternalGateGrant),
}

impl GateEvidencePayload {
    #[must_use]
    pub(crate) const fn ann_recall(audit: RecallAudit) -> Self {
        Self::AnnRecall {
            backend: audit.backend,
            sample: audit.sample,
            sample_rows: audit.sample_rows,
            neighbors_per_row: audit.neighbors_per_row,
            matched: audit.matched,
            expected: audit.expected,
            recall_at_50_bits: audit.recall.to_bits(),
        }
    }

    #[must_use]
    pub(crate) const fn relation_satisfaction(
        selection_evidence: ContentHash,
        baseline_field: ContentHash,
        canonical_field: ContentHash,
        baseline_loss: f64,
        canonical_loss: f64,
        tolerance: f64,
    ) -> Self {
        Self::RelationSatisfaction {
            selection_evidence,
            baseline_field,
            canonical_field,
            baseline_loss_bits: baseline_loss.to_bits(),
            canonical_loss_bits: canonical_loss.to_bits(),
            tolerance_bits: tolerance.to_bits(),
        }
    }

    #[must_use]
    pub(crate) fn merge_tree_persistence(
        report: &crate::salt::generation::PersistenceComparisonReport,
        grant: ExternalGateGrant,
    ) -> Self {
        Self::MergeTreePersistence {
            grant,
            report: report.content_hash(),
            candidate_tree: report.candidate_tree_hash,
            reference_tree: report.reference_tree_hash,
        }
    }

    #[must_use]
    pub(crate) const fn snapshot_consistency(
        frozen_input: ContentHash,
        security_geometry: ContentHash,
        identity_directory: ContentHash,
        row_count: u64,
    ) -> Self {
        Self::SnapshotConsistency {
            frozen_input,
            security_geometry,
            identity_directory,
            row_count,
        }
    }

    #[must_use]
    pub(crate) const fn reproducibility(
        recipe: ContentHash,
        first_output: ContentHash,
        second_output: ContentHash,
        artifact_count: usize,
    ) -> Self {
        Self::Reproducibility {
            recipe,
            first_output,
            second_output,
            artifact_count,
        }
    }

    #[must_use]
    #[inline]
    pub(crate) const fn gate(&self) -> GateId {
        match self {
            Self::Representation(_) => GateId::Representation,
            Self::AnnRecall { .. } => GateId::AnnRecall,
            Self::SemanticFidelity(_) => GateId::SemanticFidelity,
            Self::RelationPolicy(_) => GateId::RelationPolicy,
            Self::RelationSatisfaction { .. } => GateId::RelationSatisfaction,
            Self::MergeTreePersistence { .. } => GateId::MergeTreePersistence,
            Self::TemporalDrift(_) => GateId::TemporalDrift,
            Self::SubgroupBehavior(_) => GateId::SubgroupBehavior,
            Self::AuthorizationNoninterference(_) => GateId::AuthorizationNoninterference,
            Self::SnapshotConsistency { .. } => GateId::SnapshotConsistency,
            Self::Reproducibility { .. } => GateId::Reproducibility,
            Self::SecurityApproval(_) => GateId::SecurityApproval,
            Self::CompanionPin(_) => GateId::CompanionPin,
        }
    }

    fn validate(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
        external_verifiers: &ExternalGateVerifierSet,
    ) -> Result<(), GateEvidenceError> {
        validate::payload(self, head, manifest, external_verifiers)
    }
}

/// One head-bound release decision with an Ed25519 signature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct GateEvidence {
    version: u32,
    head: ReleaseHead,
    authority: String,
    gate: GateId,
    payload: GateEvidencePayload,
    signature: SignatureHex,
}

impl GateEvidence {
    /// Signs one typed gate decision for an exact release head.
    ///
    /// # Errors
    ///
    /// This returns an error when canonical evidence serialization fails.
    pub(crate) fn sign(
        head: ReleaseHead,
        payload: GateEvidencePayload,
        signer: &GateSigner,
    ) -> Result<Self, GateEvidenceError> {
        let gate = payload.gate();
        let mut evidence = Self {
            version: EVIDENCE_VERSION,
            head,
            authority: signer.verifier().authority().to_owned(),
            gate,
            payload,
            signature: SignatureHex::default(),
        };
        evidence.signature = signer.sign(&evidence.signing_bytes()?);
        Ok(evidence)
    }

    #[must_use]
    #[inline]
    pub(crate) const fn gate(&self) -> GateId {
        self.gate
    }

    /// Computes the identity of the complete signed document.
    ///
    /// # Errors
    ///
    /// This returns an error when JSON serialization fails.
    pub(crate) fn content_hash(&self) -> Result<ContentHash, GateEvidenceError> {
        Ok(ContentHash::digest(&serde_json::to_vec(self)?))
    }

    fn verify(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
        verifier: &GateVerifier,
        external_verifiers: &ExternalGateVerifierSet,
    ) -> Result<(), GateEvidenceError> {
        if self.version != EVIDENCE_VERSION {
            return Err(GateEvidenceError::Version {
                actual: self.version,
            });
        }
        if self.head != head {
            return Err(GateEvidenceError::Head);
        }
        if self.authority != verifier.authority() {
            return Err(GateEvidenceError::Authority);
        }
        if self.gate != self.payload.gate() {
            return Err(GateEvidenceError::GateMismatch);
        }
        verifier.verify(&self.signing_bytes()?, self.signature)?;
        self.payload.validate(head, manifest, external_verifiers)
    }

    fn signing_bytes(&self) -> Result<Vec<u8>, GateEvidenceError> {
        #[derive(Serialize)]
        struct Unsigned<'evidence> {
            version: u32,
            head: ReleaseHead,
            authority: &'evidence str,
            gate: GateId,
            payload: &'evidence GateEvidencePayload,
        }

        Ok(serde_json::to_vec(&Unsigned {
            version: self.version,
            head: self.head,
            authority: &self.authority,
            gate: self.gate,
            payload: &self.payload,
        })?)
    }
}

/// Complete verified evidence for one immutable release head.
#[derive(Debug, Clone)]
pub(crate) struct GateEvidenceSet {
    head: ReleaseHead,
    documents: Vec<GateEvidence>,
    report: GateReport,
}

impl GateEvidenceSet {
    /// Verifies and canonicalizes every mandatory release decision.
    ///
    /// # Errors
    ///
    /// This returns an error for a manifest or authority mismatch, an invalid
    /// signature, failed evidence, or an incomplete or repeated gate set.
    pub(crate) fn new(
        head: ReleaseHead,
        manifest: &GenerationManifest,
        verifier: &GateVerifier,
        external_verifiers: &ExternalGateVerifierSet,
        mut documents: Vec<GateEvidence>,
    ) -> Result<Self, GateEvidenceError> {
        if manifest.content_hash().ok().as_ref() != Some(&head.manifest)
            || manifest.generation_id != head.generation
            || manifest.storage.base_revision != head.data.base()
            || manifest.storage.initial_delta_revision != head.data.delta()
        {
            return Err(GateEvidenceError::Head);
        }
        if manifest.serving.gate_evidence_authority != verifier.authority()
            || manifest.serving.gate_evidence_public_key != verifier.public_key()
        {
            return Err(GateEvidenceError::PublicKey);
        }
        documents.sort_unstable_by_key(GateEvidence::gate);
        let mut seen = BTreeSet::new();
        let mut outcomes = Vec::with_capacity(GateId::required().len());
        for document in &documents {
            if !GateId::required().contains(&document.gate()) {
                return Err(GateEvidenceError::Unexpected {
                    gate: document.gate(),
                });
            }
            if !seen.insert(document.gate()) {
                return Err(GateEvidenceError::Duplicate {
                    gate: document.gate(),
                });
            }
            document.verify(head, manifest, verifier, external_verifiers)?;
            outcomes.push(GateOutcome {
                gate: document.gate(),
                evidence: document.content_hash()?,
            });
        }
        for gate in GateId::required() {
            if !seen.contains(gate) {
                return Err(GateEvidenceError::Missing { gate: *gate });
            }
        }
        let report = GateReport::new(head, outcomes)
            .expect("verified complete evidence should form a release report");
        Ok(Self {
            head,
            documents,
            report,
        })
    }

    #[must_use]
    #[inline]
    pub(crate) const fn head(&self) -> ReleaseHead {
        self.head
    }

    #[must_use]
    #[inline]
    pub(crate) fn documents(&self) -> &[GateEvidence] {
        &self.documents
    }

    #[must_use]
    #[inline]
    pub(crate) const fn report(&self) -> &GateReport {
        &self.report
    }
}

/// Computes the canonical identity of all immutable bytes in one output.
#[must_use]
pub(crate) fn reproducibility_output_hash(manifest: &GenerationManifest) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.reproducibility-output.v1");
    hasher.update(manifest.reproducibility.config_hash.as_bytes());
    for artifact in &manifest.artifacts {
        hasher.update(artifact.role.to_string().as_bytes());
        hasher.update(artifact.relative_path.as_bytes());
        hasher.update(artifact.content_hash.as_bytes());
        hasher.update(&artifact.byte_length.to_le_bytes());
        if let Some(format) = artifact.format {
            hasher.update(&format.kind.to_le_bytes());
            hasher.update(&format.version.to_le_bytes());
        } else {
            hasher.update(&[]);
        }
    }
    hasher.finish()
}
