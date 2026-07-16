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
    collections::{BTreeMap, BinaryHeap, HashSet},
};

use rayon::prelude::*;

use super::{
    NeighborIndex, ProjectorEmbeddings, SemanticGraphError, kernel::cosine_distance,
    normalize_neighbors,
};
use crate::salt::{
    hash::{ContentHash, ContentHasher},
    landmark::LandmarkCandidate,
};

/// Exact-audit neighbor count.
pub(crate) const AUDIT_NEIGHBORS: usize = 50;

/// Minimum admitted ANN recall.
pub(crate) const MINIMUM_RECALL: f64 = 0.89;

/// Selects a deterministic audit sample balanced across categorical strata.
///
/// Complete stratum tuples form cells. Cells are ordered by a versioned hash,
/// rows within each cell are independently hash-ordered, and selection proceeds
/// round-robin across cells. The resulting sample therefore cannot be chosen by
/// a caller to hide low-recall regions.
///
/// # Errors
///
/// Returns an error unless candidates form a complete permutation of the
/// generation-row domain.
pub(crate) fn stratified_audit_sample(
    candidates: &[LandmarkCandidate],
    row_count: usize,
    maximum: core::num::NonZeroUsize,
    seed: u64,
) -> Result<Vec<u32>, SemanticGraphError> {
    if candidates.len() != row_count {
        return Err(SemanticGraphError::AuditCandidateCount {
            rows: row_count,
            candidates: candidates.len(),
        });
    }
    let mut seen = vec![false; row_count];
    let mut cells = BTreeMap::<[u32; 7], Vec<u32>>::new();
    for candidate in candidates {
        let row = candidate.row.as_usize();
        if row >= row_count {
            return Err(SemanticGraphError::AuditCandidateRow {
                row: candidate.row.as_u32(),
                rows: row_count,
            });
        }
        if core::mem::replace(&mut seen[row], true) {
            return Err(SemanticGraphError::DuplicateAuditCandidateRow {
                row: candidate.row.as_u32(),
            });
        }
        cells
            .entry([
                candidate.density,
                candidate.language,
                candidate.source,
                candidate.entity_role,
                candidate.type_family,
                candidate.community,
                candidate.temporal_cohort,
            ])
            .or_default()
            .push(candidate.row.as_u32());
    }

    let mut cells = cells
        .into_iter()
        .map(|(stratum, mut rows)| {
            rows.sort_unstable_by_key(|row| audit_priority(seed, *row, &stratum, b"row"));
            (audit_priority(seed, 0, &stratum, b"cell"), stratum, rows)
        })
        .collect::<Vec<_>>();
    cells.sort_unstable_by_key(|(priority, stratum, _rows)| (*priority, *stratum));
    let target = maximum.get().min(row_count);
    let mut sample = Vec::with_capacity(target);
    let mut offset = 0;
    while sample.len() < target {
        let mut advanced = false;
        for (_priority, _stratum, rows) in &cells {
            if let Some(&row) = rows.get(offset) {
                sample.push(row);
                advanced = true;
                if sample.len() == target {
                    break;
                }
            }
        }
        debug_assert!(advanced, "complete candidates should advance the sample");
        offset += 1;
    }
    Ok(sample)
}

fn audit_priority(seed: u64, row: u32, stratum: &[u32; 7], domain: &[u8]) -> u64 {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.stratified-ann-audit.v1");
    hasher.update(domain);
    hasher.update(&seed.to_le_bytes());
    hasher.update(&row.to_le_bytes());
    for value in stratum {
        hasher.update(&value.to_le_bytes());
    }
    u64::from_le_bytes(
        hasher.finish().as_bytes()[..8]
            .try_into()
            .expect("SHA-256 digest should contain eight bytes"),
    )
}

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
    /// Returns an error when recall is below `0.89`.
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
