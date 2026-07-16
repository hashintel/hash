//! Signed and head-bound release decisions.
//!
//! A gate document binds one typed decision to a [`ReleaseHead`] and an
//! Ed25519 authority. The manifest pins that authority's name and public key.
//! Candidate publication persists all documents before the aggregate report,
//! and activation verifies the same signatures and content hashes again.
//!
//! [`ReleaseHead`]: crate::salt::release::ReleaseHead

mod crypto;
mod error;
mod external;
mod model;
mod store;

use self::crypto::SignatureHex;
pub(super) use self::store::publish_gate_evidence;
pub(crate) use self::{
    crypto::{GateSigner, GateVerifier},
    error::GateEvidenceError,
    external::{
        ExternalGateGrant, ExternalGateGrantIssuer, ExternalGateReport, ExternalGateVerifierSet,
        TrustedExternalGateAuthority,
    },
    model::{GateEvidence, GateEvidencePayload, GateEvidenceSet, reproducibility_output_hash},
    store::load_gate_evidence,
};
