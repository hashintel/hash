//! Corpus-bound representation-audit reports.

use core::{error::Error, fmt};

use serde::{Deserialize, Serialize};

use super::{CANONICAL_DIMENSIONS, canonical_corpus_hash, projector_corpus_hash};
use crate::salt::hash::{ContentHash, ContentHasher};

/// Prefix widths compared with the complete canonical semantic corpus.
pub(crate) const AUDITED_PREFIX_DIMENSIONS: [usize; 4] = [128, 256, 512, 1_024];

/// Neighbor ranks reported for every audited prefix and stratum.
pub(crate) const AUDITED_NEIGHBORS: [usize; 3] = [15, 30, 50];

/// Overall metrics and immutable detailed-report references for one corpus.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RepresentationAuditReport {
    pub suite_version: String,
    pub canonical_corpus_hash: ContentHash,
    pub projector_corpus_hash: ContentHash,
    pub identity_directory_hash: ContentHash,
    pub stratification_input_hash: ContentHash,
    pub prefix_corpus_hashes: [ContentHash; AUDITED_PREFIX_DIMENSIONS.len()],
    pub query_sample_hash: ContentHash,
    pub sample_rows: usize,
    pub overall_recall: [[f64; AUDITED_NEIGHBORS.len()]; AUDITED_PREFIX_DIMENSIONS.len()],
    pub stratified_report_hash: ContentHash,
    pub diagnostic_report_hash: ContentHash,
    pub clump_report_hash: ContentHash,
}

impl RepresentationAuditReport {
    /// Validates report completeness and its exact representation corpus.
    ///
    /// The detailed stratified report is identified separately because its
    /// source, language, role, subgroup, and density-decile tables are too
    /// large for the generation manifest.
    ///
    /// # Errors
    ///
    /// This returns an error for incomplete metrics, invalid recall values, or
    /// any corpus identity that is not derived from the supplied vectors.
    pub(crate) fn validate(
        &self,
        canonical: &[f32],
        projector: &[f32],
        identity_directory_hash: ContentHash,
        stratification_input_hash: ContentHash,
    ) -> Result<(), RepresentationAuditError> {
        let rows = canonical.len() / CANONICAL_DIMENSIONS;
        if !canonical.len().is_multiple_of(CANONICAL_DIMENSIONS)
            || self.canonical_corpus_hash != canonical_corpus_hash(canonical)
            || self.projector_corpus_hash != projector_corpus_hash(projector)
        {
            return Err(RepresentationAuditError::CorpusBinding);
        }
        if self.identity_directory_hash != identity_directory_hash
            || self.stratification_input_hash != stratification_input_hash
        {
            return Err(RepresentationAuditError::PopulationBinding);
        }
        for (index, dimensions) in AUDITED_PREFIX_DIMENSIONS.into_iter().enumerate() {
            if self.prefix_corpus_hashes[index] != prefix_corpus_hash(canonical, dimensions) {
                return Err(RepresentationAuditError::PrefixBinding { dimensions });
            }
        }
        self.validate_summary(rows)?;
        Ok(())
    }

    /// Validates report fields that do not require corpus bytes.
    ///
    /// # Errors
    ///
    /// This returns an error for noncanonical metadata or incomplete metrics.
    pub(crate) fn validate_summary(&self, rows: usize) -> Result<(), RepresentationAuditError> {
        if self.suite_version.trim() != self.suite_version || self.suite_version.is_empty() {
            return Err(RepresentationAuditError::SuiteVersion);
        }
        if self.sample_rows == 0 || self.sample_rows > rows {
            return Err(RepresentationAuditError::SampleRows {
                rows,
                sample_rows: self.sample_rows,
            });
        }
        for (prefix, recalls) in self.overall_recall.iter().enumerate() {
            for (neighbors, &recall) in recalls.iter().enumerate() {
                if !recall.is_finite() || !(0.0..=1.0).contains(&recall) {
                    return Err(RepresentationAuditError::Recall {
                        dimensions: AUDITED_PREFIX_DIMENSIONS[prefix],
                        neighbors: AUDITED_NEIGHBORS[neighbors],
                    });
                }
            }
        }
        let zero = ContentHash::from_bytes([0; 32]);
        if [
            self.identity_directory_hash,
            self.stratification_input_hash,
            self.query_sample_hash,
            self.stratified_report_hash,
            self.diagnostic_report_hash,
            self.clump_report_hash,
        ]
        .contains(&zero)
        {
            return Err(RepresentationAuditError::MissingReport);
        }
        Ok(())
    }

    /// Computes the identity signed by the representation gate authority.
    #[must_use]
    pub(crate) fn content_hash(&self) -> ContentHash {
        let bytes = serde_json::to_vec(self)
            .expect("representation audit fields should serialize to canonical JSON");
        let mut hasher =
            ContentHasher::new(b"hash.graph.atlas.salt.representation-audit-report.v1");
        hasher.update(&bytes);
        hasher.finish()
    }
}

/// Computes the identity of raw row-major prefixes at one audited width.
#[must_use]
#[expect(
    clippy::little_endian_bytes,
    reason = "persistent cross-platform audit identities require canonical little-endian scalars"
)]
pub(crate) fn prefix_corpus_hash(canonical: &[f32], dimensions: usize) -> ContentHash {
    let rows = canonical.len() / CANONICAL_DIMENSIONS;
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.raw-prefix-corpus.v1");
    hasher.update(
        &u64::try_from(dimensions)
            .expect("audited dimensions should fit u64")
            .to_le_bytes(),
    );
    hasher.update(
        &u64::try_from(rows)
            .expect("representation rows should fit u64")
            .to_le_bytes(),
    );
    for row in canonical.chunks_exact(CANONICAL_DIMENSIONS) {
        for value in &row[..dimensions] {
            hasher.update(&value.to_bits().to_le_bytes());
        }
    }
    hasher.finish()
}

/// An incomplete or incorrectly bound representation audit.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RepresentationAuditError {
    SuiteVersion,
    CorpusBinding,
    PopulationBinding,
    PrefixBinding { dimensions: usize },
    SampleRows { rows: usize, sample_rows: usize },
    Recall { dimensions: usize, neighbors: usize },
    MissingReport,
}

impl fmt::Display for RepresentationAuditError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SuiteVersion => {
                formatter.write_str("representation audit suite version is not canonical")
            }
            Self::CorpusBinding => {
                formatter.write_str("representation audit is not bound to the frozen corpus")
            }
            Self::PopulationBinding => formatter.write_str(
                "representation audit is not bound to frozen identities and stratification inputs",
            ),
            Self::PrefixBinding { dimensions } => write!(
                formatter,
                "representation audit {dimensions}-dimensional prefix identity is invalid"
            ),
            Self::SampleRows { rows, sample_rows } => write!(
                formatter,
                "representation audit samples {sample_rows} rows from a {rows}-row corpus"
            ),
            Self::Recall {
                dimensions,
                neighbors,
            } => write!(
                formatter,
                "representation audit recall for d={dimensions}, k={neighbors} is invalid"
            ),
            Self::MissingReport => {
                formatter.write_str("representation audit has a missing detailed report")
            }
        }
    }
}

impl Error for RepresentationAuditError {}

#[cfg(test)]
mod tests;
