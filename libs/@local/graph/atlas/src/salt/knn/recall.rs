//! Exact recall spot check for approximate search backends.
//!
//! For each sampled node row, [`spot_check`] compares an approximate
//! query with a brute-force cosine ranking over the same projector
//! matrix. Both rankings exclude the query row and resolve equal
//! distances by ascending row. Recall is the total intersection count
//! divided by the total number of exact neighbours across the sample,
//! and a backend is accepted at [`MINIMUM_RECALL`].
//!
//! The sample is uniform without replacement, sized by
//! [`acceptance_sample_size`] with the same defect-rate and confidence
//! budget as the representation spot check.

use alloc::collections::BinaryHeap;
use core::cmp::Ordering;

use rand::Rng;
use rayon::prelude::*;

use super::{NearestNeighboursIndex, error::KnnError, table::InvalidKnn};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::VecN,
    random::{acceptance_sample_size, sample_indices_vec},
};

/// Exact neighbours compared per sampled row.
pub(crate) const AUDIT_NEIGHBOURS: usize = 50;

/// Minimum admitted aggregate recall.
pub(crate) const MINIMUM_RECALL: f64 = 0.89;

// The acceptance bound sizes the sample (688 rows certify a 1% defect
// rate at 99.9% confidence when all pass); the gate itself is the
// SPEC 3.4 aggregate recall over the sample, so a long per-row tail
// cannot fail a backend whose aggregate holds.
const SPOT_CHECK_DEFECT_RATE: f64 = 0.01;
const SPOT_CHECK_CONFIDENCE: f64 = 0.999;

/// Aggregate exact-recall evidence for one backend and corpus.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RecallSpotCheck {
    /// Distinct rows compared.
    pub sampled_rows: usize,
    /// Exact neighbours compared per row.
    pub neighbours_per_row: usize,
    /// Exact neighbours the approximate results contained.
    pub matched: u64,
    /// Exact neighbours across the whole sample.
    pub expected: u64,
}

impl RecallSpotCheck {
    /// Returns the aggregate recall in `[0, 1]`.
    #[inline]
    #[must_use]
    pub(crate) fn recall(&self) -> f64 {
        #[expect(
            clippy::cast_precision_loss,
            reason = "spot-check edge counts remain far below exact f64 integer precision"
        )]
        let recall = self.matched as f64 / self.expected as f64;
        recall
    }

    /// Returns whether the backend meets the admission gate.
    #[inline]
    #[must_use]
    pub(crate) fn meets_minimum(&self) -> bool {
        self.recall() >= MINIMUM_RECALL
    }
}

/// Measures recall@50 of `index` against exact cosine rankings.
///
/// `embeddings` is the row-major projector matrix the backend indexed;
/// row order defines the row domain. Sampled rows are queried through
/// [`search_by_id`](NearestNeighboursIndex::search_by_id) and compared
/// in parallel.
///
/// # Errors
///
/// Returns an error when the corpus holds fewer than two rows or the
/// backend fails a query.
pub(crate) fn spot_check<I>(
    index: &I,
    embeddings: &[[f32; PROJECTOR_DIMENSIONS]],
    rng: impl Rng,
) -> Result<RecallSpotCheck, KnnError<I::Error>>
where
    I: NearestNeighboursIndex + Sync,
    I::Error: Send,
{
    let rows = embeddings.len();
    if rows < 2 {
        return Err(InvalidKnn::InsufficientRows { rows }.into());
    }
    let neighbours_per_row = AUDIT_NEIGHBOURS.min(rows - 1);
    let sampled_rows = acceptance_sample_size(SPOT_CHECK_DEFECT_RATE, SPOT_CHECK_CONFIDENCE)
        .expect("the pinned spot-check parameters lie in the open unit interval")
        .min(rows);
    let sample = sample_indices_vec(rng, rows, sampled_rows).into_vec();

    let matched = sample
        .par_iter()
        .map(|&row| {
            let id = NodeRowId::new(u64::try_from(row).expect("node rows fit u64"));
            let mut approximate: Vec<usize> = index
                .search_by_id(id, neighbours_per_row)
                .map_err(KnnError::Backend)?
                .into_iter()
                // A neighbour outside the row domain can never match an
                // exact neighbour; malformedness is the table build's
                // concern, the spot check only scores.
                .filter_map(|neighbour| usize::try_from(neighbour.id.get()).ok())
                .collect();
            approximate.sort_unstable();
            approximate.dedup();

            let matches = exact_neighbours(embeddings, row, neighbours_per_row)
                .into_iter()
                .filter(|exact| approximate.binary_search(exact).is_ok())
                .count();
            Ok::<_, KnnError<I::Error>>(u64::try_from(matches).expect("match counts fit u64"))
        })
        .try_reduce(|| 0, |left, right| Ok(left + right))?;

    let expected =
        u64::try_from(sampled_rows * neighbours_per_row).expect("spot-check edge counts fit u64");
    Ok(RecallSpotCheck {
        sampled_rows,
        neighbours_per_row,
        matched,
        expected,
    })
}

/// Returns the `limit` exact nearest non-self neighbours of `query`.
fn exact_neighbours(
    embeddings: &[[f32; PROJECTOR_DIMENSIONS]],
    query: usize,
    limit: usize,
) -> Vec<usize> {
    let query_embedding = VecN::from_ref(&embeddings[query]);
    let mut nearest = BinaryHeap::with_capacity(limit);
    for (row, embedding) in embeddings.iter().enumerate() {
        if row == query {
            continue;
        }
        let candidate = ExactNeighbour {
            row,
            distance: query_embedding.cosine_distance(VecN::from_ref(embedding)),
        };
        if nearest.len() == limit {
            if nearest.peek().is_none_or(|farthest| candidate >= *farthest) {
                continue;
            }
            nearest.pop();
        }
        nearest.push(candidate);
    }
    nearest
        .into_sorted_vec()
        .into_iter()
        .map(|neighbour| neighbour.row)
        .collect()
}

#[derive(Debug, Copy, Clone)]
struct ExactNeighbour {
    row: usize,
    distance: f32,
}

impl PartialEq for ExactNeighbour {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for ExactNeighbour {}

impl PartialOrd for ExactNeighbour {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ExactNeighbour {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.distance
            .total_cmp(&other.distance)
            .then_with(|| self.row.cmp(&other.row))
    }
}
