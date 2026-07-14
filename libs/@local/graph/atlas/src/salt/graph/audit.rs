//! Exact recall gate for approximate semantic search.
//!
//! For each explicitly selected row, the audit compares an ANN query with a
//! brute-force cosine ranking over the same 512-component matrix. Both
//! rankings exclude the query row and resolve equal distances by generation
//! row index. Recall is the total intersection count divided by the total
//! number of exact neighbors across all sampled rows.

use std::collections::HashSet;

use rayon::prelude::*;

use super::{
    NeighborIndex, ProjectorEmbeddings, SemanticGraphError, kernel::cosine_distance,
    normalize_neighbors,
};
use crate::salt::hash::ContentHash;

/// Exact-audit neighbor count.
pub(crate) const AUDIT_NEIGHBORS: usize = 50;

/// Minimum admitted ANN recall.
pub(crate) const MINIMUM_RECALL: f64 = 0.95;

/// Aggregate exact-recall evidence for one backend and corpus.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RecallAudit {
    pub backend: ContentHash,
    pub sample_rows: usize,
    pub neighbors_per_row: usize,
    pub matched: u64,
    pub expected: u64,
    pub recall: f64,
}

impl RecallAudit {
    /// Enforces the default recall gate.
    ///
    /// # Errors
    ///
    /// Returns an error when recall is below `0.95`.
    pub(crate) fn require_minimum(self) -> Result<Self, SemanticGraphError> {
        if self.recall < MINIMUM_RECALL {
            return Err(SemanticGraphError::RecallBelowThreshold {
                actual: self.recall,
                required: MINIMUM_RECALL,
            });
        }
        Ok(self)
    }
}

/// Compares ANN and exact cosine neighbors on a pinned sample.
///
/// # Errors
///
/// Returns an error for an empty, repeated or out-of-bounds sample row, a
/// one-row corpus, or malformed backend results.
pub(crate) fn audit_recall(
    embeddings: ProjectorEmbeddings<'_>,
    index: &impl NeighborIndex,
    sample: &[u32],
) -> Result<RecallAudit, SemanticGraphError> {
    if sample.is_empty() {
        return Err(SemanticGraphError::EmptyAuditSample);
    }
    let rows = embeddings.len();
    if rows <= 1 {
        return Err(SemanticGraphError::InvalidNeighborCount { rows, neighbors: 0 });
    }
    let mut unique = HashSet::with_capacity(sample.len());
    for &row in sample {
        if usize::try_from(row).map_or(true, |row| row >= rows) {
            return Err(SemanticGraphError::AuditRowOutOfBounds { row, rows });
        }
        if !unique.insert(row) {
            return Err(SemanticGraphError::DuplicateAuditRow { row });
        }
    }

    let neighbors_per_row = AUDIT_NEIGHBORS.min(rows - 1);
    let matched = sample
        .par_iter()
        .map(|&row| {
            let row_index = usize::try_from(row).expect("validated audit row should fit usize");
            let search_limit = (neighbors_per_row + 1).min(rows);
            let approximate = index.search(embeddings.row(row_index), search_limit)?;
            let approximate = normalize_neighbors(approximate, row_index, rows, neighbors_per_row)?;
            let exact = exact_neighbors(embeddings, row_index, neighbors_per_row);
            let matches = exact
                .iter()
                .filter(|exact| {
                    approximate
                        .iter()
                        .any(|approximate| approximate.row == **exact)
                })
                .count();
            Ok::<_, SemanticGraphError>(matches)
        })
        .try_reduce(|| 0_usize, |left, right| Ok(left + right))?;

    let expected = sample.len().checked_mul(neighbors_per_row).ok_or(
        SemanticGraphError::TooManyNeighborEntries {
            rows: sample.len(),
            neighbors: neighbors_per_row,
        },
    )?;
    let matched = u64::try_from(matched).expect("matched audit edges should fit u64");
    let expected = u64::try_from(expected).expect("expected audit edges should fit u64");
    #[expect(
        clippy::cast_precision_loss,
        reason = "audit edge counts remain far below exact f64 integer precision"
    )]
    let recall = matched as f64 / expected as f64;

    Ok(RecallAudit {
        backend: index.identity(),
        sample_rows: sample.len(),
        neighbors_per_row,
        matched,
        expected,
        recall,
    })
}

fn exact_neighbors(embeddings: ProjectorEmbeddings<'_>, query: usize, limit: usize) -> Vec<u32> {
    let query_embedding = embeddings.row(query);
    let mut distances = Vec::with_capacity(embeddings.len() - 1);
    for row in 0..embeddings.len() {
        if row == query {
            continue;
        }
        distances.push((
            u32::try_from(row).expect("validated semantic row should fit u32"),
            cosine_distance(query_embedding, embeddings.row(row)),
        ));
    }
    distances.select_nth_unstable_by(limit - 1, |left, right| {
        left.1
            .total_cmp(&right.1)
            .then_with(|| left.0.cmp(&right.0))
    });
    distances.truncate(limit);
    distances.sort_unstable_by(|left, right| {
        left.1
            .total_cmp(&right.1)
            .then_with(|| left.0.cmp(&right.0))
    });
    distances.into_iter().map(|(row, _)| row).collect()
}
