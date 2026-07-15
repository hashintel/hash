//! Exact recall gate for approximate semantic search.
//!
//! For each explicitly selected row, the audit compares an ANN query with a
//! brute-force cosine ranking over the same 512-component matrix. Both
//! rankings exclude the query row and resolve equal distances by generation
//! row index. Recall is the total intersection count divided by the total
//! number of exact neighbors across all sampled rows.
#![expect(
    clippy::little_endian_bytes,
    reason = "audit identities use canonical little-endian scalar encodings"
)]

use std::{
    cmp::Ordering,
    collections::{BinaryHeap, HashSet},
};

use rayon::prelude::*;

use super::{
    NeighborIndex, ProjectorEmbeddings, SemanticGraphError, kernel::cosine_distance,
    normalize_neighbors,
};
use crate::salt::hash::{ContentHash, ContentHasher};

/// Exact-audit neighbor count.
pub(crate) const AUDIT_NEIGHBORS: usize = 50;

/// Minimum admitted ANN recall.
pub(crate) const MINIMUM_RECALL: f64 = 0.95;

/// Aggregate exact-recall evidence for one backend and corpus.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RecallAudit {
    pub backend: ContentHash,
    pub sample: ContentHash,
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

    /// Returns the identity of the backend, sampled rows, shape, and exact result.
    #[must_use]
    pub(crate) fn content_hash(self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.exact-ann-audit.v1");
        hasher.update(self.backend.as_bytes());
        hasher.update(self.sample.as_bytes());
        for value in [self.sample_rows, self.neighbors_per_row] {
            hasher.update(
                &u64::try_from(value)
                    .expect("audit counts should fit u64")
                    .to_le_bytes(),
            );
        }
        hasher.update(&self.matched.to_le_bytes());
        hasher.update(&self.expected.to_le_bytes());
        hasher.update(&self.recall.to_bits().to_le_bytes());
        hasher.finish()
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

    let mut canonical_sample = sample.to_vec();
    canonical_sample.sort_unstable();
    let mut sample_hasher = ContentHasher::new(b"hash.graph.atlas.salt.exact-ann-audit-sample.v1");
    for row in canonical_sample {
        sample_hasher.update(&row.to_le_bytes());
    }
    Ok(RecallAudit {
        backend: index.identity(),
        sample: sample_hasher.finish(),
        sample_rows: sample.len(),
        neighbors_per_row,
        matched,
        expected,
        recall,
    })
}

fn exact_neighbors(embeddings: ProjectorEmbeddings<'_>, query: usize, limit: usize) -> Vec<u32> {
    let query_embedding = embeddings.row(query);
    let mut nearest = BinaryHeap::with_capacity(limit);
    for row in 0..embeddings.len() {
        if row == query {
            continue;
        }
        let candidate = ExactNeighbor {
            row: u32::try_from(row).expect("validated semantic row should fit u32"),
            distance: cosine_distance(query_embedding, embeddings.row(row)),
        };
        if nearest.len() < limit {
            nearest.push(candidate);
        } else if nearest.peek().is_some_and(|farthest| candidate < *farthest) {
            nearest.pop();
            nearest.push(candidate);
        }
    }
    nearest
        .into_sorted_vec()
        .into_iter()
        .map(|neighbor| neighbor.row)
        .collect()
}

#[derive(Debug, Copy, Clone)]
struct ExactNeighbor {
    row: u32,
    distance: f64,
}

impl PartialEq for ExactNeighbor {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for ExactNeighbor {}

impl PartialOrd for ExactNeighbor {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ExactNeighbor {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.distance
            .total_cmp(&other.distance)
            .then_with(|| self.row.cmp(&other.row))
    }
}
