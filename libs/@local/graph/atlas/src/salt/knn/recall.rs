//! Exact recall spot check for approximate search backends.
//!
//! For each sampled node row, [`spot_check`] compares an approximate
//! query with a brute-force cosine ranking over the same projector
//! matrix. Both rankings exclude the query row and resolve equal
//! distances by ascending row. Recall is the total intersection count
//! divided by the total number of exact neighbours across the sample,
//! and a backend is accepted at the configured
//! [minimum](SpotCheckOptions::minimum_recall).
//!
//! The sample is uniform without replacement, sized by
//! [`acceptance_sample_size`] from a configured defect-rate and
//! confidence budget.

use alloc::collections::BinaryHeap;
use core::{cmp::Ordering, default::Default, num::NonZero};

use rand::Rng;
use rayon::prelude::*;

use super::{NearestNeighboursIndex, error::KnnError, table::KnnValidationError};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
    random::{acceptance_sample_size, sample_indices_vec},
};

// The defaults are the backend admission criterion, recall@50 >= 0.89:
// the criterion is aggregate recall over the sample, so a long per-row
// tail cannot fail a backend whose aggregate holds. The acceptance bound
// sizes the sample (688 rows certify a 1% defect rate at 99.9%
// confidence when all pass).
const DEFAULT_NEIGHBOURS: NonZero<usize> =
    NonZero::new(50).expect("the default comparison depth is nonzero");
const DEFAULT_MINIMUM_RECALL: f64 = 0.89;
const DEFAULT_DEFECT_RATE: f64 = 0.01;
const DEFAULT_CONFIDENCE: f64 = 0.999;

/// Pinned sampling and admission settings for one recall spot check.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SpotCheckOptions {
    /// Exact neighbours compared per sampled row; a corpus smaller
    /// than this compares every non-self row. This is the `k` of the
    /// measured recall@k, independent of the persisted table's
    /// neighbour count. Defaults to 50.
    pub neighbours: NonZero<usize> = DEFAULT_NEIGHBOURS,
    /// Minimum admitted aggregate recall over the sample, in
    /// `[0, 1]`. Defaults to 0.89.
    pub minimum_recall: f64 = DEFAULT_MINIMUM_RECALL,
    /// Defect rate the sample size certifies, strictly inside
    /// `(0, 1)`; see [`acceptance_sample_size`]. Smaller rates grow
    /// the sample. Defaults to 0.01.
    pub defect_rate: f64 = DEFAULT_DEFECT_RATE,
    /// Confidence of the certification, strictly inside `(0, 1)`;
    /// see [`acceptance_sample_size`]. Higher confidence grows the
    /// sample. Defaults to 0.999.
    pub confidence: f64 = DEFAULT_CONFIDENCE,
}

const impl Default for SpotCheckOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Aggregate exact-recall evidence for one backend and corpus.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RecallSpotCheck {
    /// Distinct rows compared.
    pub sampled_rows: u64,
    /// Exact neighbours compared per row.
    pub neighbours_per_row: u64,
    /// Exact neighbours the approximate results contained.
    pub matched: u64,
    /// Exact neighbours across the whole sample.
    pub expected: u64,
    /// The admission minimum the check was configured with.
    pub minimum_recall: f64,
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

    /// Returns whether the backend meets the configured admission
    /// minimum.
    #[inline]
    #[must_use]
    pub(crate) fn meets_minimum(&self) -> bool {
        self.recall() >= self.minimum_recall
    }
}

#[derive(Debug, Copy, Clone)]
struct ExactNeighbour {
    row: NodeRowId,
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

/// Returns the `limit` exact nearest non-self neighbours of `query`.
fn exact_neighbours(
    embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    query: NodeRowId,
    limit: usize,
) -> impl IntoIterator<Item = NodeRowId> {
    let query_embedding = &embeddings[query.usize()];

    let mut nearest = BinaryHeap::with_capacity(limit);
    for (row, embedding) in embeddings.iter().enumerate() {
        let row = NodeRowId::new(row as u64);
        if row == query {
            continue;
        }

        let candidate = ExactNeighbour {
            row,
            distance: query_embedding.cosine_distance(embedding),
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
}

/// Measures recall of `index` against exact cosine rankings.
///
/// `embeddings` holds the projector representations the backend
/// indexed, in row order; a mapped `f32[T, 512]` artifact yields the
/// slice directly. Sampled rows are queried through
/// [`search_by_id`](NearestNeighboursIndex::search_by_id) and compared
/// in parallel.
///
/// # Errors
///
/// Returns an error when the corpus holds fewer than two rows, the
/// sampling budget lies outside the open unit interval, or the
/// backend fails a query.
pub(crate) fn spot_check<I>(
    index: &I,
    embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    options: SpotCheckOptions,
    rng: impl Rng,
) -> Result<RecallSpotCheck, KnnError<I::Error>>
where
    I: NearestNeighboursIndex + Sync,
    I::Error: Send,
{
    let rows = embeddings.len();
    if rows < 2 {
        return Err(KnnValidationError::InsufficientRows { rows }.into());
    }

    let neighbours_per_row = options.neighbours.get().min(rows - 1);
    let sampled_rows = acceptance_sample_size(options.defect_rate, options.confidence)
        .ok_or(KnnError::SampleBudget {
            defect_rate: options.defect_rate,
            confidence: options.confidence,
        })?
        .min(rows);

    let sample = sample_indices_vec(rng, rows, sampled_rows).into_vec();
    let matched = sample
        .par_iter()
        .map(|&row| {
            let id = NodeRowId::new(row as u64);

            // A neighbour outside the row domain can never match an exact neighbour; malformedness
            // is the table build's concern, the spot check only scores.
            let mut approximate: Vec<NodeRowId> = index
                .search_by_id(id, neighbours_per_row)
                .map_err(KnnError::Backend)?
                .into_iter()
                .map(|neighbour| neighbour.id)
                .collect();
            approximate.sort_unstable();
            approximate.dedup();

            let matches = exact_neighbours(embeddings, id, neighbours_per_row)
                .into_iter()
                .filter(|exact| approximate.binary_search(exact).is_ok())
                .count();

            Ok::<_, KnnError<I::Error>>(matches as u64)
        })
        .try_reduce(|| 0, |left, right| Ok(left + right))?;

    let sampled_rows = sampled_rows as u64;
    let neighbours_per_row = neighbours_per_row as u64;
    let expected = sampled_rows * neighbours_per_row;

    Ok(RecallSpotCheck {
        sampled_rows,
        neighbours_per_row,
        matched,
        expected,
        minimum_recall: options.minimum_recall,
    })
}
