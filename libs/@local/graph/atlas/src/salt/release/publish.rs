use std::{
    fs::{self, File},
    io::{Read as _, Write as _},
};

use camino::Utf8Path;
use tempfile::NamedTempFile;

use super::{
    GateEvidenceSet, GatedRelease, error::ReleasePublishError, evidence::publish_gate_evidence,
};
use crate::salt::activation::publish_candidate_marker;

const RELEASE_REPORT_FILE: &str = "release-report.json";

/// Persists complete passing evidence before making a candidate discoverable.
///
/// The report is written inside the immutable generation directory using a
/// no-clobber rename. Only after the exact bytes are durable is the candidate
/// marker published. Neither operation activates the generation.
///
/// # Errors
///
/// This returns an error when encoding or durable publication fails, an
/// existing report differs, or the candidate marker cannot be published.
pub(crate) fn publish_gated_candidate(
    root: &Utf8Path,
    evidence: &GateEvidenceSet,
) -> Result<GatedRelease, ReleasePublishError> {
    let report = evidence.report();
    let release = report.approve()?;
    let bytes = serde_json::to_vec(report)?;
    let directory = root
        .join("generations")
        .join(report.head().generation.to_string());
    fs::create_dir_all(&directory)?;
    publish_gate_evidence(&directory, evidence)?;
    let path = directory.join(RELEASE_REPORT_FILE);
    let mut temporary = NamedTempFile::new_in(&directory)?;
    temporary.write_all(&bytes)?;
    temporary.as_file().sync_all()?;
    match temporary.persist_noclobber(&path) {
        Ok(file) => {
            file.sync_all()?;
            File::open(&directory)?.sync_all()?;
        }
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
            let mut existing = Vec::new();
            File::open(&path)?.read_to_end(&mut existing)?;
            if existing != bytes {
                return Err(ReleasePublishError::ExistingReportMismatch);
            }
        }
        Err(error) => return Err(ReleasePublishError::Persist(error)),
    }
    publish_candidate_marker(root, release)?;
    Ok(release)
}
