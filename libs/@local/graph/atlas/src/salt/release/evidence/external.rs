//! Independently authorized approvals for gates outside numerical generation.
//!
//! An external authority signs the exact [`ReleaseHead`], [`GateId`], suite
//! version, and report identity. The release path verifies that signature
//! against an out-of-band [`GateVerifier`] before embedding the grant in the
//! separately signed gate document. This preserves both decisions: the
//! specialist authority approves its scoped subject, and the release authority
//! certifies that the approved subject is the candidate being published.

use alloc::collections::{BTreeMap, BTreeSet};
use core::fmt;

use serde::{Deserialize, Serialize};

use super::{GateEvidenceError, GateSigner, GateVerifier, SignatureHex};
use crate::salt::{
    hash::ContentHash,
    manifest::GenerationManifest,
    release::{GateId, ReleaseHead},
};

const EXTERNAL_GRANT_VERSION: u32 = 1;
const M0_EXTERNAL_GATES: [GateId; 8] = [
    GateId::Representation,
    GateId::SemanticFidelity,
    GateId::RelationPolicy,
    GateId::MergeTreePersistence,
    GateId::SubgroupBehavior,
    GateId::AuthorizationNoninterference,
    GateId::SecurityApproval,
    GateId::CompanionPin,
];

/// A separately signed external approval bound to one immutable release head.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExternalGateGrant {
    version: u32,
    head: ReleaseHead,
    authority: String,
    public_key: ContentHash,
    gate: GateId,
    suite_version: String,
    report: ContentHash,
    signature: SignatureHex,
}

impl ExternalGateGrant {
    /// Signs one report-backed approval for an exact release head and gate.
    ///
    /// # Errors
    ///
    /// Returns an error when the suite version is not canonical or the
    /// approval targets a runner-derived gate.
    pub(crate) fn sign(
        head: ReleaseHead,
        gate: GateId,
        suite_version: impl Into<String>,
        report: ContentHash,
        signer: &GateSigner,
    ) -> Result<Self, GateEvidenceError> {
        if !external_gate(gate) {
            return Err(GateEvidenceError::Failed {
                gate,
                reason: "runner-derived gates cannot receive external approvals",
            });
        }
        let suite_version = suite_version.into();
        if !canonical_text(&suite_version) || report == ContentHash::from_bytes([0; 32]) {
            return Err(GateEvidenceError::Failed {
                gate,
                reason: "external suite version or report identity is not canonical",
            });
        }
        let verifier = signer.verifier();
        let mut grant = Self {
            version: EXTERNAL_GRANT_VERSION,
            head,
            authority: verifier.authority().to_owned(),
            public_key: verifier.public_key(),
            gate,
            suite_version,
            report,
            signature: SignatureHex::default(),
        };
        grant.signature = signer.sign(&grant.signing_bytes()?);
        Ok(grant)
    }

    pub(super) fn verify_pinned(
        &self,
        head: ReleaseHead,
        gate: GateId,
        verifiers: &ExternalGateVerifierSet,
    ) -> Result<(), GateEvidenceError> {
        self.verify(head, gate, verifiers.verifier(gate)?)
    }

    fn verify(
        &self,
        head: ReleaseHead,
        gate: GateId,
        verifier: &GateVerifier,
    ) -> Result<(), GateEvidenceError> {
        if self.version != EXTERNAL_GRANT_VERSION
            || self.head != head
            || self.gate != gate
            || self.authority != verifier.authority()
            || self.public_key != verifier.public_key()
            || !canonical_text(&self.suite_version)
            || self.report == ContentHash::from_bytes([0; 32])
        {
            return Err(GateEvidenceError::Failed {
                gate,
                reason: "external approval scope or authority does not match",
            });
        }
        verifier.verify(&self.signing_bytes()?, self.signature)
    }

    #[must_use]
    #[inline]
    pub(crate) fn suite_version(&self) -> &str {
        &self.suite_version
    }

    #[must_use]
    #[inline]
    pub(crate) const fn report(&self) -> ContentHash {
        self.report
    }

    fn signing_bytes(&self) -> Result<Vec<u8>, GateEvidenceError> {
        #[derive(Serialize)]
        struct Unsigned<'grant> {
            version: u32,
            head: ReleaseHead,
            authority: &'grant str,
            public_key: ContentHash,
            gate: GateId,
            suite_version: &'grant str,
            report: ContentHash,
        }

        Ok(serde_json::to_vec(&Unsigned {
            version: self.version,
            head: self.head,
            authority: &self.authority,
            public_key: self.public_key,
            gate: self.gate,
            suite_version: &self.suite_version,
            report: self.report,
        })?)
    }
}

/// Immutable report identity returned by one external gate suite.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ExternalGateReport {
    suite_version: Box<str>,
    content_hash: ContentHash,
}

impl ExternalGateReport {
    /// Creates one canonical external report descriptor.
    ///
    /// # Errors
    ///
    /// Returns an error when the suite version is non-canonical or the report
    /// identity is zero.
    pub(crate) fn new(
        gate: GateId,
        suite_version: impl Into<Box<str>>,
        content_hash: ContentHash,
    ) -> Result<Self, GateEvidenceError> {
        let suite_version = suite_version.into();
        if !canonical_text(&suite_version) || content_hash == ContentHash::from_bytes([0; 32]) {
            return Err(GateEvidenceError::Failed {
                gate,
                reason: "external suite returned a non-canonical report identity",
            });
        }
        Ok(Self {
            suite_version,
            content_hash,
        })
    }

    /// Returns the suite identity that produced this report.
    #[must_use]
    pub(crate) fn suite_version(&self) -> &str {
        &self.suite_version
    }

    /// Returns the immutable report content identity.
    #[must_use]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

/// External system capable of evaluating and signing one release gate.
pub(crate) trait ExternalGateGrantIssuer: fmt::Debug + Sync {
    /// Produces a report-backed grant for the completed immutable output.
    ///
    /// # Errors
    ///
    /// Returns an error when the external suite or approval service fails.
    fn issue(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
        gate: GateId,
    ) -> Result<ExternalGateGrant, GateEvidenceError>;
}

/// Out-of-band verifier paired with one external approval service.
#[derive(Debug)]
pub(crate) struct TrustedExternalGateAuthority<'authority> {
    gate: GateId,
    issuer: &'authority dyn ExternalGateGrantIssuer,
    verifier: GateVerifier,
}

impl<'authority> TrustedExternalGateAuthority<'authority> {
    /// Pins an approval service to one external gate and verification key.
    ///
    /// # Errors
    ///
    /// Returns an error when the gate must be measured by the runner.
    pub(crate) fn new(
        gate: GateId,
        issuer: &'authority dyn ExternalGateGrantIssuer,
        verifier: GateVerifier,
    ) -> Result<Self, GateEvidenceError> {
        if !external_gate(gate) {
            return Err(GateEvidenceError::Failed {
                gate,
                reason: "runner-derived gates cannot use external authorities",
            });
        }
        Ok(Self {
            gate,
            issuer,
            verifier,
        })
    }

    #[must_use]
    #[inline]
    pub(crate) const fn gate(&self) -> GateId {
        self.gate
    }

    #[must_use]
    #[inline]
    pub(crate) const fn verifier(&self) -> &GateVerifier {
        &self.verifier
    }

    /// Requests and independently verifies the authority's exact-head grant.
    ///
    /// # Errors
    ///
    /// Returns an error when issuance fails or the result has the wrong
    /// authority, key, gate, head, or signature.
    pub(crate) fn issue(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
    ) -> Result<ExternalGateGrant, GateEvidenceError> {
        let grant = self.issuer.issue(head, manifest, self.gate)?;
        grant.verify(head, self.gate, &self.verifier)?;
        Ok(grant)
    }
}

/// Out-of-band verification keys required when sealing and reopening releases.
#[derive(Debug, Clone)]
pub(crate) struct ExternalGateVerifierSet {
    verifiers: BTreeMap<GateId, GateVerifier>,
}

impl ExternalGateVerifierSet {
    /// Pins every M0 external gate independently from the release authority.
    ///
    /// # Errors
    ///
    /// Returns an error for a missing or duplicate gate, unexpected gate,
    /// release-key reuse, or key reuse between external authorities.
    pub(crate) fn new(
        release: &GateVerifier,
        entries: Vec<(GateId, GateVerifier)>,
    ) -> Result<Self, GateEvidenceError> {
        let mut verifiers = BTreeMap::new();
        let mut authorities = BTreeSet::from([release.authority().to_owned()]);
        let mut public_keys = BTreeSet::new();
        for (gate, verifier) in entries {
            if !M0_EXTERNAL_GATES.contains(&gate) {
                return Err(GateEvidenceError::Unexpected { gate });
            }
            if verifier.public_key() == release.public_key() {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external approval key must differ from the release key",
                });
            }
            if !public_keys.insert(verifier.public_key()) {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "external approval keys must be pairwise distinct",
                });
            }
            if !authorities.insert(verifier.authority().to_owned()) {
                return Err(GateEvidenceError::Failed {
                    gate,
                    reason: "release and external authority names must be pairwise distinct",
                });
            }
            if verifiers.insert(gate, verifier).is_some() {
                return Err(GateEvidenceError::Duplicate { gate });
            }
        }
        for gate in M0_EXTERNAL_GATES {
            if !verifiers.contains_key(&gate) {
                return Err(GateEvidenceError::Missing { gate });
            }
        }
        Ok(Self { verifiers })
    }

    fn verifier(&self, gate: GateId) -> Result<&GateVerifier, GateEvidenceError> {
        self.verifiers
            .get(&gate)
            .ok_or(GateEvidenceError::Missing { gate })
    }
}

#[inline]
const fn external_gate(gate: GateId) -> bool {
    matches!(
        gate,
        GateId::Representation
            | GateId::SemanticFidelity
            | GateId::RelationPolicy
            | GateId::MergeTreePersistence
            | GateId::SubgroupBehavior
            | GateId::AuthorizationNoninterference
            | GateId::SecurityApproval
            | GateId::CompanionPin
    )
}

#[inline]
fn canonical_text(value: &str) -> bool {
    !value.is_empty() && value.trim() == value && !value.eq_ignore_ascii_case("TBD")
}
