//! Fail-closed release evidence for immutable generation candidates.

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
        EvidenceAttestation, GateEvidence, GateEvidenceError, GateEvidencePayload, GateEvidenceSet,
        GateSigner, GateVerifier, load_gate_evidence,
    },
    gate::{GateId, GateOutcome, GateReport, GatedRelease, ReleaseHead},
};

#[cfg(test)]
mod tests;
