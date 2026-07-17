#![expect(
    clippy::std_instead_of_core,
    reason = "core::io::ErrorKind remains unstable on the pinned nightly toolchain"
)]
use std::{
    fs::{self, File},
    io::{ErrorKind, Read as _, Write as _},
};

use camino::Utf8Path;
use tempfile::NamedTempFile;

use super::{ExternalGateVerifierSet, GateEvidenceError, GateEvidenceSet, GateVerifier};
use crate::salt::{
    manifest::GenerationManifest,
    release::{GateId, GateReport},
};

const EVIDENCE_DIRECTORY: &str = "gate-evidence";
const MAX_EVIDENCE_BYTES: u64 = 1024 * 1024;

/// Publishes every signed evidence document before its release report.
///
/// Each document uses a no-clobber rename and is synchronized before the
/// generation directory becomes discoverable as a candidate.
///
/// # Errors
///
/// This returns an error when evidence serialization or durable publication
/// fails, or an existing immutable document has different bytes.
pub(crate) fn publish_gate_evidence(
    generation_directory: &Utf8Path,
    evidence: &GateEvidenceSet,
) -> Result<(), GateEvidenceError> {
    let directory = generation_directory.join(EVIDENCE_DIRECTORY);
    fs::create_dir_all(&directory)?;
    for document in evidence.documents() {
        let bytes = serde_json::to_vec(document)?;
        publish_document(
            &directory.join(evidence_file(document.gate())),
            &bytes,
            document.gate(),
        )?;
    }
    File::open(&directory)?.sync_all()?;
    File::open(generation_directory)?.sync_all()?;
    Ok(())
}

/// Loads and verifies the signed documents named by a release report.
///
/// # Errors
///
/// This returns an error for missing or non-canonical files, hash or signature
/// mismatches, a different release head, failed evidence, or an incomplete set.
pub(crate) fn load_gate_evidence(
    generation_directory: &Utf8Path,
    report: &GateReport,
    manifest: &GenerationManifest,
    verifier: &GateVerifier,
    external_verifiers: &ExternalGateVerifierSet,
) -> Result<GateEvidenceSet, GateEvidenceError> {
    let directory = generation_directory.join(EVIDENCE_DIRECTORY);
    let mut documents = Vec::with_capacity(report.outcomes().len());
    for outcome in report.outcomes() {
        let bytes = read_bounded(
            &directory.join(evidence_file(outcome.gate)),
            MAX_EVIDENCE_BYTES,
        )?;
        let document = serde_json::from_slice(&bytes)?;
        let canonical = serde_json::to_vec(&document)?;
        if canonical != bytes || crate::salt::hash::ContentHash::digest(&bytes) != outcome.evidence
        {
            return Err(GateEvidenceError::Hash { gate: outcome.gate });
        }
        documents.push(document);
    }
    let evidence = GateEvidenceSet::new(
        report.head(),
        manifest,
        verifier,
        external_verifiers,
        documents,
    )?;
    if evidence.report() != report {
        return Err(GateEvidenceError::Report);
    }
    Ok(evidence)
}

fn publish_document(path: &Utf8Path, bytes: &[u8], gate: GateId) -> Result<(), GateEvidenceError> {
    let directory = path
        .parent()
        .expect("gate evidence path should have a parent");
    let mut temporary = NamedTempFile::new_in(directory)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    match temporary.persist_noclobber(path) {
        Ok(file) => file.sync_all()?,
        Err(error) if error.error.kind() == ErrorKind::AlreadyExists => {
            let existing = read_bounded(path, MAX_EVIDENCE_BYTES)?;
            if existing != bytes {
                return Err(GateEvidenceError::ExistingEvidenceMismatch { gate });
            }
            File::open(path)?.sync_all()?;
        }
        Err(error) => return Err(GateEvidenceError::Io(error.error)),
    }
    File::open(directory)?.sync_all()?;
    Ok(())
}

fn read_bounded(path: &Utf8Path, maximum: u64) -> Result<Vec<u8>, GateEvidenceError> {
    let mut file = File::open(path)?;
    file.lock_shared()?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() > maximum {
        return Err(GateEvidenceError::Io(std::io::Error::new(
            ErrorKind::InvalidData,
            "gate evidence is not a bounded regular file",
        )));
    }
    let capacity = usize::try_from(metadata.len()).map_err(|_error| {
        GateEvidenceError::Io(std::io::Error::new(
            ErrorKind::InvalidData,
            "gate evidence length does not fit memory",
        ))
    })?;
    let mut bytes = Vec::with_capacity(capacity);
    std::io::Read::by_ref(&mut file)
        .take(maximum.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if !matches!(
        u64::try_from(bytes.len()),
        Ok(length) if length <= maximum
    ) {
        return Err(GateEvidenceError::Io(std::io::Error::new(
            ErrorKind::InvalidData,
            "gate evidence grew beyond its byte limit while it was read",
        )));
    }
    if u64::try_from(bytes.len()).ok() != Some(metadata.len()) {
        return Err(GateEvidenceError::Io(std::io::Error::new(
            ErrorKind::InvalidData,
            "gate evidence changed while it was read",
        )));
    }
    Ok(bytes)
}

#[inline]
const fn evidence_file(gate: GateId) -> &'static str {
    match gate {
        GateId::Representation => "00-representation.json",
        GateId::AnnRecall => "01-ann-recall.json",
        GateId::SemanticFidelity => "02-semantic-fidelity.json",
        GateId::RelationPolicy => "03-relation-policy.json",
        GateId::RelationSatisfaction => "04-relation-satisfaction.json",
        GateId::MergeTreePersistence => "05-merge-tree-persistence.json",
        GateId::TemporalDrift => "06-temporal-drift.json",
        GateId::SubgroupBehavior => "07-subgroup-behavior.json",
        GateId::AuthorizationNoninterference => "08-authorization-noninterference.json",
        GateId::SnapshotConsistency => "09-snapshot-consistency.json",
        GateId::Reproducibility => "10-reproducibility.json",
        GateId::SecurityApproval => "11-security-approval.json",
        GateId::CompanionPin => "12-companion-pin.json",
    }
}
