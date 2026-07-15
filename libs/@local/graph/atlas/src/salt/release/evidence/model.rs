use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::{GateEvidenceError, GateSigner, GateVerifier, SignatureHex};
use crate::salt::{
    graph::audit::MINIMUM_RECALL,
    hash::ContentHash,
    manifest::GenerationManifest,
    release::{GateId, GateOutcome, GateReport, ReleaseHead},
};

const EVIDENCE_VERSION: u32 = 1;

/// A signed decision produced by one versioned release suite.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EvidenceAttestation {
    suite_version: String,
    report: ContentHash,
    passed: bool,
}

impl EvidenceAttestation {
    /// Creates a decision bound to its complete external report.
    ///
    /// # Errors
    ///
    /// This returns an error when `suite_version` is empty, has surrounding
    /// whitespace, or uses the reserved value `TBD`.
    pub(crate) fn new(
        suite_version: impl Into<String>,
        report: ContentHash,
        passed: bool,
    ) -> Result<Self, GateEvidenceError> {
        let suite_version = suite_version.into();
        if !canonical_text(&suite_version) {
            return Err(GateEvidenceError::Failed {
                gate: GateId::Representation,
                reason: "suite version is not canonical",
            });
        }
        Ok(Self {
            suite_version,
            report,
            passed,
        })
    }
}

/// Typed measurements or approvals for one mandatory release gate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "gate", content = "evidence", rename_all = "kebab-case")]
pub(crate) enum GateEvidencePayload {
    Representation(EvidenceAttestation),
    AnnRecall {
        exact_audit: ContentHash,
        recall_at_50_bits: u64,
    },
    SemanticFidelity(EvidenceAttestation),
    RelationPolicy(EvidenceAttestation),
    RelationSatisfaction(EvidenceAttestation),
    MergeTreePersistence(EvidenceAttestation),
    TemporalDrift(EvidenceAttestation),
    SubgroupBehavior(EvidenceAttestation),
    AuthorizationNoninterference(EvidenceAttestation),
    SnapshotConsistency(EvidenceAttestation),
    Reproducibility(EvidenceAttestation),
    SecurityApproval(EvidenceAttestation),
    CompanionPin {
        document_version: String,
        document_hash: ContentHash,
        wire_versions: Vec<u16>,
        shader_contract_version: String,
    },
}

impl GateEvidencePayload {
    #[must_use]
    pub(crate) const fn ann_recall(exact_audit: ContentHash, recall_at_50: f64) -> Self {
        Self::AnnRecall {
            exact_audit,
            recall_at_50_bits: recall_at_50.to_bits(),
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
            Self::RelationSatisfaction(_) => GateId::RelationSatisfaction,
            Self::MergeTreePersistence(_) => GateId::MergeTreePersistence,
            Self::TemporalDrift(_) => GateId::TemporalDrift,
            Self::SubgroupBehavior(_) => GateId::SubgroupBehavior,
            Self::AuthorizationNoninterference(_) => GateId::AuthorizationNoninterference,
            Self::SnapshotConsistency(_) => GateId::SnapshotConsistency,
            Self::Reproducibility(_) => GateId::Reproducibility,
            Self::SecurityApproval(_) => GateId::SecurityApproval,
            Self::CompanionPin { .. } => GateId::CompanionPin,
        }
    }

    fn validate(&self, manifest: &GenerationManifest) -> Result<(), GateEvidenceError> {
        let gate = self.gate();
        match self {
            Self::AnnRecall {
                exact_audit,
                recall_at_50_bits,
            } => {
                let recall = f64::from_bits(*recall_at_50_bits);
                if *exact_audit != manifest.semantic_graph.exact_audit_hash
                    || recall.to_bits() != manifest.semantic_graph.recall_at_50.to_bits()
                    || !recall.is_finite()
                    || recall < MINIMUM_RECALL
                {
                    return Err(GateEvidenceError::Failed {
                        gate,
                        reason: "exact ANN audit does not satisfy the pinned manifest",
                    });
                }
            }
            Self::CompanionPin {
                document_version,
                document_hash,
                wire_versions,
                shader_contract_version,
            } => {
                let mut expected_wire = manifest.serving.wire_versions.clone();
                let mut observed_wire = wire_versions.clone();
                expected_wire.sort_unstable();
                observed_wire.sort_unstable();
                if !canonical_text(document_version)
                    || !canonical_text(shader_contract_version)
                    || document_version != &manifest.serving.canvas_companion_version
                    || *document_hash != manifest.serving.canvas_companion_sha256
                    || observed_wire != expected_wire
                    || shader_contract_version != &manifest.serving.shader_contract_version
                {
                    return Err(GateEvidenceError::Failed {
                        gate,
                        reason: "client companion evidence differs from the manifest pins",
                    });
                }
            }
            payload @ (Self::Representation(_)
            | Self::SemanticFidelity(_)
            | Self::RelationPolicy(_)
            | Self::RelationSatisfaction(_)
            | Self::MergeTreePersistence(_)
            | Self::TemporalDrift(_)
            | Self::SubgroupBehavior(_)
            | Self::AuthorizationNoninterference(_)
            | Self::SnapshotConsistency(_)
            | Self::Reproducibility(_)
            | Self::SecurityApproval(_)) => {
                let attestation = payload
                    .attestation()
                    .expect("non-measured payload should carry an attestation");
                if !canonical_text(&attestation.suite_version) || !attestation.passed {
                    return Err(GateEvidenceError::Failed {
                        gate,
                        reason: "the signed suite decision did not pass",
                    });
                }
            }
        }
        Ok(())
    }

    #[inline]
    const fn attestation(&self) -> Option<&EvidenceAttestation> {
        match self {
            Self::Representation(value)
            | Self::SemanticFidelity(value)
            | Self::RelationPolicy(value)
            | Self::RelationSatisfaction(value)
            | Self::MergeTreePersistence(value)
            | Self::TemporalDrift(value)
            | Self::SubgroupBehavior(value)
            | Self::AuthorizationNoninterference(value)
            | Self::SnapshotConsistency(value)
            | Self::Reproducibility(value)
            | Self::SecurityApproval(value) => Some(value),
            Self::AnnRecall { .. } | Self::CompanionPin { .. } => None,
        }
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
        self.payload.validate(manifest)
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
            if !seen.insert(document.gate()) {
                return Err(GateEvidenceError::Duplicate {
                    gate: document.gate(),
                });
            }
            document.verify(head, manifest, verifier)?;
            outcomes.push(GateOutcome {
                gate: document.gate(),
                passed: true,
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

#[inline]
fn canonical_text(value: &str) -> bool {
    !value.is_empty() && value.trim() == value && !value.eq_ignore_ascii_case("TBD")
}
