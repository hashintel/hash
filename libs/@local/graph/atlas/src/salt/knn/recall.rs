//! Exact recall spot check for approximate search backends.
//!
//! For each sampled node row, [`spot_check`] compares an approximate query with a brute-force
//! cosine ranking over the same projector matrix. Both rankings exclude the query row and resolve
//! equal distances by ascending row. Recall is the total intersection count divided by the total
//! number of exact neighbours across the sample, and a backend is accepted at the configured
//! [minimum](SpotCheckOptions::minimum_recall).
//!
//! The sample is sized in two stages (Stein's procedure), because the criterion is an aggregate
//! mean whose per-row variance is a corpus property: a pilot sample measures the mean's deviation,
//! [`mean_sample_size`] derives the count that resolves the configured
//! [margin](SpotCheckOptions::margin) at the configured [confidence](SpotCheckOptions::confidence),
//! and a second sample of that size delivers the verdict when the pilot is too small. The knobs are
//! scale-free and the variance is measured, never configured. (An acceptance-sampling budget - this
//! check's original sizing - certifies all-pass criteria and carries no guarantee about a mean:
//! per-row recall is strongly bimodal, and at the acceptance-sized 688 rows the check refused sound
//! backends on sampling noise.)
//!
//! The exact side of the check stands alone as [`ExactReference`]: one sampled brute-force
//! reference scores any number of backends or backend settings, so a parameter sweep pays the exact
//! rankings once instead of once per grid point. [`spot_check`] is the one-backend composition of
//! the two halves.

use alloc::collections::BinaryHeap;
use core::{cmp::Ordering, default::Default, num::NonZero};

use rand::Rng;
use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};

use super::{
    NearestNeighboursIndex, construction::NeighbourLists, error::KnnError,
    table::KnnValidationError,
};
use crate::{
    dataset::{NodeRowId, PROJECTOR_DIMENSIONS},
    math::AlignedVecN,
    random::{mean_sample_size, sample_indices_vec},
};

// The defaults are the backend admission criterion, recall@50 >= 0.89:
// the criterion is aggregate recall over the sample, so a long per-row
// tail cannot fail a backend whose aggregate holds.
const DEFAULT_NEIGHBOURS: NonZero<usize> =
    NonZero::new(50).expect("the default comparison depth is nonzero");
const DEFAULT_MINIMUM_RECALL: f64 = 0.89;
// The margin is what the check must resolve: the full-scale backend
// sweep (985,932 rows) measured healthy builds at ~0.902 against the
// 0.89 floor, so a coarser margin cannot distinguish a healthy build
// from a degraded one, and a finer margin buys certainty about
// differences no decision turns on. At the sweep's measured per-row
// deviation (~0.32; near-tie rows score ~0.5 on any ANN index) the
// pair sizes the final sample at ~3,850 rows, ~108s of brute force at
// a million rows - and the two-stage procedure re-derives that count
// from the pilot's measured deviation, so a corpus with harder
// near-tie structure automatically samples more.
const DEFAULT_MARGIN: f64 = 0.012;
const DEFAULT_CONFIDENCE: f64 = 0.99;
// The acceptance-era sample size, kept as the pilot: large enough to
// read the per-row deviation within a few percent, small enough that
// a decisively good or bad backend settles at ~19s of brute force.
const DEFAULT_PILOT: NonZero<usize> = NonZero::new(688).expect("the default pilot size is nonzero");

/// Pinned sampling and admission settings for one recall spot check.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SpotCheckOptions {
    /// Exact neighbours compared per sampled row.
    ///
    /// A corpus smaller than this compares every non-self row. This is the `k` of the measured
    /// recall@k, independent of the persisted table's neighbour count. Defaults to 50.
    pub neighbours: NonZero<usize> = DEFAULT_NEIGHBOURS,
    /// Minimum admitted aggregate recall over the sample, in `[0, 1]`. Defaults to 0.89.
    pub minimum_recall: f64 = DEFAULT_MINIMUM_RECALL,
    /// The aggregate error the sample must resolve, in recall units.
    ///
    /// Defaults to 0.012, the smallest recall difference an admission decision turns on.
    pub margin: f64 = DEFAULT_MARGIN,
    /// One-sided confidence that the aggregate's sampling error stays inside the margin.
    ///
    /// Strictly inside `(0, 1)`. Defaults to 0.99.
    pub confidence: f64 = DEFAULT_CONFIDENCE,
    /// Rows of the variance pilot; a corpus smaller than this compares every row exhaustively.
    ///
    /// Defaults to 688.
    pub pilot: NonZero<usize> = DEFAULT_PILOT,
}

const impl Default for SpotCheckOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Aggregate exact-recall evidence for one backend and corpus.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RecallSpotCheck {
    /// Distinct rows compared in the verdict sample.
    pub sampled_rows: u64,
    /// Exact neighbours compared per row.
    pub neighbours_per_row: u64,
    /// Exact neighbours the approximate results contained.
    pub matched: u64,
    /// Exact neighbours across the whole sample.
    pub expected: u64,
    /// Sample standard deviation of per-row recall over the verdict sample.
    ///
    /// The measured spread that sized it.
    pub deviation: f64,
    /// The admission minimum the check was configured with.
    pub minimum_recall: f64,
    /// The aggregate error the sample was sized to resolve.
    pub margin: f64,
    /// The one-sided confidence the sample was sized at.
    pub confidence: f64,
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

    /// Returns whether the backend meets the configured admission minimum.
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

/// One sampled brute-force reference, reusable across backends.
///
/// The sample and its exact neighbour lists depend only on the corpus and the sampling draw, so one
/// reference scores any number of backends or backend settings against identical queries.
#[derive(Debug)]
pub(crate) struct ExactReference {
    /// Sampled rows and their exact neighbours, ascending within each row's list.
    queries: Vec<(NodeRowId, Vec<NodeRowId>)>,
    /// Exact neighbours compared per row.
    neighbours_per_row: usize,
}

impl ExactReference {
    /// Returns the sampled query count.
    #[inline]
    #[must_use]
    pub(crate) const fn sampled_rows(&self) -> usize {
        self.queries.len()
    }

    /// Returns the exact neighbours compared per row.
    #[inline]
    #[must_use]
    pub(crate) const fn neighbours_per_row(&self) -> usize {
        self.neighbours_per_row
    }

    /// Samples query rows and computes their exact cosine rankings in parallel.
    ///
    /// `embeddings` holds the projector representations in row order; a mapped `f32[T, 512]`
    /// artifact yields the slice directly. A `sample_size` beyond the corpus compares every row,
    /// and a `neighbours` beyond the corpus compares every non-self row.
    ///
    /// # Errors
    ///
    /// Returns an error when the corpus holds fewer than two rows.
    pub(crate) fn new<E>(
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        neighbours: NonZero<usize>,
        sample_size: NonZero<usize>,
        rng: impl Rng,
    ) -> Result<Self, KnnError<E>> {
        let rows = embeddings.len();
        if rows < 2 {
            return Err(KnnValidationError::InsufficientRows { rows }.into());
        }

        let neighbours_per_row = neighbours.get().min(rows - 1);
        let sampled_rows = sample_size.get().min(rows);

        let sample = sample_indices_vec(rng, rows, sampled_rows).into_vec();
        let queries = sample
            .par_iter()
            .map(|&row| {
                let id = NodeRowId::new(row as u64);
                let mut exact: Vec<NodeRowId> =
                    exact_neighbours(embeddings, id, neighbours_per_row)
                        .into_iter()
                        .collect();
                exact.sort_unstable();
                (id, exact)
            })
            .collect();

        Ok(Self {
            queries,
            neighbours_per_row,
        })
    }

    /// Scores constructed lists against the reference rankings.
    ///
    /// Sampled rows read their list prefix at the reference depth and compare in parallel; lists
    /// narrower than the reference depth score what they hold. The reading carries raw counts and
    /// the per-row spread; admission criteria live with the caller.
    pub(crate) fn score_lists(&self, lists: &NeighbourLists) -> Scoring {
        let depth = self.neighbours_per_row.min(lists.width());
        let (matched, squares) = self
            .queries
            .par_iter()
            .map(|(id, exact)| {
                let mut approximate: Vec<NodeRowId> = lists.row(id.usize())[..depth]
                    .iter()
                    .map(|neighbour| neighbour.id)
                    .collect();
                approximate.sort_unstable();

                let matches = exact
                    .iter()
                    .filter(|exact| approximate.binary_search(exact).is_ok())
                    .count();

                #[expect(
                    clippy::cast_precision_loss,
                    reason = "per-row match counts stay below the comparison depth"
                )]
                let row_recall = matches as f64 / self.neighbours_per_row as f64;

                (matches as u64, row_recall * row_recall)
            })
            .reduce(
                || (0, 0.0),
                |(matched, squares), (row_matched, row_square)| {
                    (matched + row_matched, squares + row_square)
                },
            );

        let sampled_rows = self.queries.len() as u64;
        let neighbours_per_row = self.neighbours_per_row as u64;
        let expected = sampled_rows * neighbours_per_row;

        Scoring {
            sampled_rows,
            neighbours_per_row,
            matched,
            expected,
            deviation: deviation(self.queries.len(), matched, expected, squares),
        }
    }

    /// Scores a backend's queries against the reference rankings.
    ///
    /// Sampled rows are queried through [`search_by_id`](NearestNeighboursIndex::search_by_id) and
    /// compared in parallel. The reading carries raw counts and the per-row spread; admission
    /// criteria live with the caller.
    ///
    /// # Errors
    ///
    /// Returns an error when the backend fails a query.
    pub(crate) fn score<I>(&self, index: &I) -> Result<Scoring, KnnError<I::Error>>
    where
        I: NearestNeighboursIndex + Sync,
        I::Error: Send,
    {
        let (matched, squares) = self
            .queries
            .par_iter()
            .map(|(id, exact)| {
                // A neighbour outside the row domain can never match an exact neighbour;
                // malformedness is the table build's concern, the spot check only scores.
                let mut approximate: Vec<NodeRowId> = index
                    .search_by_id(*id, self.neighbours_per_row)
                    .map_err(KnnError::Backend)?
                    .into_iter()
                    .map(|neighbour| neighbour.id)
                    .collect();
                approximate.sort_unstable();
                approximate.dedup();

                let matches = exact
                    .iter()
                    .filter(|exact| approximate.binary_search(exact).is_ok())
                    .count();

                #[expect(
                    clippy::cast_precision_loss,
                    reason = "per-row match counts stay below the comparison depth"
                )]
                let row_recall = matches as f64 / self.neighbours_per_row as f64;

                Ok::<_, KnnError<I::Error>>((matches as u64, row_recall * row_recall))
            })
            .try_reduce(
                || (0, 0.0),
                |(matched, squares), (row_matched, row_square)| {
                    Ok((matched + row_matched, squares + row_square))
                },
            )?;

        let sampled_rows = self.queries.len() as u64;
        let neighbours_per_row = self.neighbours_per_row as u64;
        let expected = sampled_rows * neighbours_per_row;

        Ok(Scoring {
            sampled_rows,
            neighbours_per_row,
            matched,
            expected,
            deviation: deviation(self.queries.len(), matched, expected, squares),
        })
    }
}

/// One backend's reading against a reference.
///
/// Raw counts and the measured per-row spread, prior to any admission criterion.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Scoring {
    /// Distinct rows compared.
    pub sampled_rows: u64,
    /// Exact neighbours compared per row.
    pub neighbours_per_row: u64,
    /// Exact neighbours the approximate results contained.
    pub matched: u64,
    /// Exact neighbours across the whole sample.
    pub expected: u64,
    /// Sample standard deviation of per-row recall.
    pub deviation: f64,
}

impl Scoring {
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
}

/// Computes the sample standard deviation of per-row recall.
///
/// Derived from the aggregate counts and the sum of squared per-row recalls.
///
/// The per-row sum needs no separate accumulator: it is the matched total divided by the comparison
/// depth.
fn deviation(rows: usize, matched: u64, expected: u64, squares: f64) -> f64 {
    if rows < 2 {
        return 0.0;
    }

    #[expect(
        clippy::cast_precision_loss,
        reason = "spot-check edge counts remain far below exact f64 integer precision"
    )]
    let (count, mean) = (rows as f64, matched as f64 / expected as f64);
    // Squares can dip below the mean term by rounding when the spread
    // is tiny; the clamp keeps the root real.
    let variance = (count * mean).mul_add(-mean, squares).max(0.0) / (count - 1.0);

    variance.sqrt()
}

/// Measures recall of constructed lists against exact cosine rankings, sizing the sample in two
/// stages.
///
/// The sizing mirrors [`spot_check`]: a pilot sample measures the per-row spread, the derived
/// count resolves the configured margin at the configured confidence, and a fresh sample of that
/// size delivers the verdict when the pilot is too small. Scoring reads the lists in place, so
/// the resample pays only its exact rankings.
///
/// # Errors
///
/// Returns an error when the corpus holds fewer than two rows or the margin or confidence is
/// degenerate ([`SampleBudget`](KnnError::SampleBudget)).
pub(crate) fn spot_check_lists<E>(
    lists: &NeighbourLists,
    embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    options: SpotCheckOptions,
    mut rng: impl Rng,
) -> Result<RecallSpotCheck, KnnError<E>> {
    let rows = embeddings.len();
    let pilot = ExactReference::new(embeddings, options.neighbours, options.pilot, &mut rng)?;
    let piloted = pilot.score_lists(lists);

    let required = mean_sample_size(piloted.deviation, options.margin, options.confidence).ok_or(
        KnnError::SampleBudget {
            margin: options.margin,
            confidence: options.confidence,
        },
    )?;

    let scored = match NonZero::new(required) {
        // The pilot resolves the margin (or already covers the whole
        // corpus, which no resample can improve).
        Some(required) if required.get() > pilot.sampled_rows() && pilot.sampled_rows() < rows => {
            ExactReference::new::<E>(embeddings, options.neighbours, required, &mut rng)?
                .score_lists(lists)
        }
        _ => piloted,
    };

    Ok(RecallSpotCheck {
        sampled_rows: scored.sampled_rows,
        neighbours_per_row: scored.neighbours_per_row,
        matched: scored.matched,
        expected: scored.expected,
        deviation: scored.deviation,
        minimum_recall: options.minimum_recall,
        margin: options.margin,
        confidence: options.confidence,
    })
}

/// Measures recall of `index` against exact cosine rankings, sizing the sample in two stages.
///
/// `embeddings` holds the projector representations the backend indexed, in row order; a mapped
/// `f32[T, 512]` artifact yields the slice directly. A pilot sample measures the per-row spread,
/// [`mean_sample_size`] derives the count resolving the configured margin at the configured
/// confidence from it, and when the pilot is too small a fresh sample of that size delivers the
/// verdict (Stein's two-stage procedure). A pilot that already covers the corpus is exhaustive and
/// decides directly. Both draws come from the one generator, so a seeded check replays exactly.
///
/// # Errors
///
/// Returns an error when the corpus holds fewer than two rows, the margin or confidence is
/// degenerate ([`SampleBudget`](KnnError::SampleBudget)), or the backend fails a query.
pub(crate) fn spot_check<I>(
    index: &I,
    embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    options: SpotCheckOptions,
    mut rng: impl Rng,
) -> Result<RecallSpotCheck, KnnError<I::Error>>
where
    I: NearestNeighboursIndex + Sync,
    I::Error: Send,
{
    let rows = embeddings.len();
    let pilot = ExactReference::new(embeddings, options.neighbours, options.pilot, &mut rng)?;
    let piloted = pilot.score(index)?;

    let required = mean_sample_size(piloted.deviation, options.margin, options.confidence).ok_or(
        KnnError::SampleBudget {
            margin: options.margin,
            confidence: options.confidence,
        },
    )?;

    let scored = match NonZero::new(required) {
        // The pilot resolves the margin (or already covers the whole
        // corpus, which no resample can improve).
        Some(required) if required.get() > pilot.sampled_rows() && pilot.sampled_rows() < rows => {
            ExactReference::new(embeddings, options.neighbours, required, &mut rng)?.score(index)?
        }
        _ => piloted,
    };

    Ok(RecallSpotCheck {
        sampled_rows: scored.sampled_rows,
        neighbours_per_row: scored.neighbours_per_row,
        matched: scored.matched,
        expected: scored.expected,
        deviation: scored.deviation,
        minimum_recall: options.minimum_recall,
        margin: options.margin,
        confidence: options.confidence,
    })
}
