//! Fail-closed release evidence for immutable generation candidates.
//!
//! A release decision names one exact [`ReleaseHead`]:
//!
//! ```text
//! (generation_id, base_revision, delta_revision, manifest_hash)
//! ```
//!
//! Every mandatory gate produces a typed evidence document for that head. The
//! document is signed by the manifest-pinned release authority and its content
//! hash becomes the corresponding [`GateOutcome`]. The aggregate
//! [`GateReport`] is valid only when the mandatory gate set is complete,
//! unique, canonically ordered, and individually verified.
//!
//! # Evidence, not booleans
//!
//! Runner-owned gates carry recomputable measurements:
//!
//! - ANN recall binds backend, exact sample, matched-neighbor counts, and recall;
//! - relation satisfaction binds baseline and canonical persisted fields, measured losses,
//!   selection evidence, and tolerance;
//! - snapshot consistency binds frozen input, authorized geometry, identity directory, and row
//!   count; and
//! - reproducibility binds one recipe to two equal output identities and the complete artifact
//!   count.
//!
//! Other gates require independent domain authority. An
//! [`ExternalGateGrant`] signs the same head, gate, suite version, and report
//! hash with a separately pinned key. The release authority then signs a gate
//! document containing that grant. This records both decisions without letting
//! the generation process impersonate the external suite.
//!
//! Merge-tree persistence uses both forms: the generation computes and hashes
//! the candidate/reference comparison, while the external grant approves that
//! exact report identity.
//!
//! # Publication order
//!
//! [`publish_gated_candidate`] writes each evidence document and the aggregate
//! report inside the immutable generation directory. Files use no-clobber,
//! byte-for-byte idempotent publication and are synchronized before the
//! root-level candidate marker is written. The marker makes a candidate
//! discoverable but does not activate it.
//!
//! Loading reverses the process: it reads bounded JSON, verifies the report
//! head against the manifest, checks every signature and typed payload, and
//! reconstructs [`GatedRelease`]. A matching filename, hash, or signature in
//! isolation is never treated as a passing gate.

mod error;
mod evidence;
mod gate;
mod publish;
#[cfg(test)]
pub(crate) mod test_support;

pub(super) use self::publish::publish_gated_candidate;
#[allow(
    unused_imports,
    reason = "gate identities and evidence are supplied by the release adapter"
)]
pub(crate) use self::{
    error::{ReleaseGateError, ReleasePublishError},
    evidence::{
        ExternalGateGrant, ExternalGateGrantIssuer, ExternalGateReport, ExternalGateVerifierSet,
        GateEvidence, GateEvidenceError, GateEvidencePayload, GateEvidenceSet, GateSigner,
        GateVerifier, SignedExternalGateGrantIssuer, TrustedExternalGateAuthority,
        load_gate_evidence, reproducibility_output_hash,
    },
    gate::{GateId, GateOutcome, GateReport, GatedRelease, ReleaseHead},
};

#[cfg(test)]
mod tests;
