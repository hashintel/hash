//! Sampled recall against brute-force cosine rankings.
//!
//! For each sampled row, the check compares an approximate neighbour list with the brute-force
//! ranking over the same projector matrix. The reference excludes the query row and resolves equal
//! kernel distances by ascending row. Recall counts literal neighbour-id intersections, including
//! when independently computed distances differ near a tie. "Exact" describes exhaustive ranking by
//! the crate's floating-point cosine kernel.
//!
//! # Sampling and decision
//!
//! A pilot estimates the per-row standard deviation, the aggregate's clearance of the configured
//! [minimum](SpotCheckOptions::minimum_recall), and the scoring rate. These measurements size one
//! fresh verdict sample, floored at the pilot's size and capped by the corpus and the
//! [budget](SpotCheckOptions::budget) at the measured rate. The verdict sample alone decides. If
//! the pilot already covers the corpus, it is a census and supplies the verdict directly.
//!
//! Let `N` be the corpus size, `n` the number of sampled rows, and `k` the number of exact non-self
//! neighbours per row. For each sampled row `i`, Rᵢ is its intersection count divided by `k`. The
//! aggregate R̄ is the total intersection count divided by `n · k`, and `s` is the sample standard
//! deviation of the Rᵢ values. At [confidence](SpotCheckOptions::confidence) `c`, the normal
//! quantile `z = Φ⁻¹(c)` gives the implemented half-width h = z · s / √n · √((N − n) / (N − 1)). A
//! census has h = 0. For minimum μ, [`RecallAdmission`] admits when R̄ − h ≥ μ and refuses when
//! R̄ + h < μ. Otherwise the admission remains unresolved. Admission never uses the point estimate
//! alone when h > 0.
//!
//! The pilot's measured clearance δ = |R̄ − μ| sizes ceil((z · s / δ)²) verdict rows before the
//! floor and caps apply. Zero clearance requests the largest affordable sample. This targets the
//! difference the decision must resolve without a fixed margin. An all-pass defect-rate sample size
//! does not supply a bound on this mean's error.
//!
//! The interval uses a normal approximation with an estimated deviation. Its confidence is nominal,
//! not a finite-sample, distribution-free coverage guarantee. Small samples and zero observed
//! spread can understate uncertainty. Drawing the verdict afresh avoids reusing the pilot's
//! observed recall in the decision and avoids repeated stopping tests on a growing verdict sample.
//! Fresh draws may overlap the pilot's rows. The normal approximation's limitations remain despite
//! this separation.
//!
//! # Reuse and precision
//!
//! [`ExactReference`] keeps sampled brute-force rankings for scoring multiple backends or settings
//! against identical queries. [`spot_check_lists`] scores already-constructed lists. Seeded draws
//! repeat for fixed sample sizes. Floating-point reduction order can change the measured deviation
//! and resulting size or half-width in the final bits, and budget-limited sizing also depends on
//! measured wall time.

use alloc::collections::BinaryHeap;
use core::{cmp::Ordering, default::Default, num::NonZero, time::Duration};
use std::time::Instant;

use hashql_core::id::{Id, IdSlice};
use rand::Rng;
use rayon::iter::{IntoParallelRefIterator as _, ParallelIterator as _};

use super::{
    NearestNeighboursIndex, construction::NeighbourLists, error::KnnError,
    table::KnnValidationError,
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{
        AlignedVecN, DNonNegative, DPositive, NonNegative, OpenUnitFraction, UnitFraction, nz,
        open_unit_fraction, unit_fraction,
    },
    random::{mean_sample_size, normal_quantile, sample_ids},
};

// admission uses aggregate recall@50 ≥ 0.89 with its measured interval. It imposes no per-row
// recall floor.
/// The default `k` of the measured recall.
const DEFAULT_NEIGHBOURS: NonZero<usize> = nz!(50);
/// The default aggregate recall floor a backend must clear.
const DEFAULT_MINIMUM_RECALL: UnitFraction = unit_fraction!(0.89);
// sample size scales with the square of the normal quantile. At fixed spread and margin, 0.999 uses
// about 1.8 times the rows of 0.99, while 0.95 uses about half. These are nominal
// normal-approximation confidence levels.
/// The default confidence level of the admission.
const DEFAULT_CONFIDENCE: OpenUnitFraction = open_unit_fraction!(0.99);
// the pilot trades precision of its spread estimate against the cost of a full-corpus scan per
// sampled row. Reassess its size using the measured deviation and scoring rate across
// representative corpora.
/// The default pilot sample size.
const DEFAULT_PILOT: NonZero<usize> = nz!(688);
// ten minutes is a sizing policy that the pilot's measured rate converts into a row cap. The check
// itself runs without a wall-clock deadline. The 985,932-row backend sweep measured recall around
// 0.902 with per-row deviation around 0.32. At confidence 0.99, z ≈ 2.326 and clearance
// 0.902 − 0.89 = 0.012 request ceil((2.326 · 0.32 / 0.012)²) ≈ 3,848 rows before caps. Halving the
// clearance quadruples the request. The time-derived cap limits that growth, and the result
// reports the achieved width.
/// The default wall-clock budget of one check.
const DEFAULT_BUDGET: Duration = Duration::from_secs(600);

/// Pinned sampling and admission settings for one recall spot check.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SpotCheckOptions {
    /// Exact neighbours compared per sampled row.
    ///
    /// A corpus smaller than this compares every non-self row. This is the `k` of the measured
    /// recall@k, independent of the persisted table's neighbour count. By default, compares 50 neighbours.
    pub neighbours: NonZero<usize> = DEFAULT_NEIGHBOURS,
    /// Minimum admitted aggregate recall over the sample, 0.89 by default.
    pub minimum_recall: UnitFraction = DEFAULT_MINIMUM_RECALL,
    /// Nominal one-sided confidence for the normal-approximation interval, 0.99 by default.
    ///
    /// Values below one half are refused before sampling. At one half the quantile and reported [resolution](RecallSpotCheck::resolution) are zero.
    pub confidence: OpenUnitFraction = DEFAULT_CONFIDENCE,
    /// Rows of the sizing pilot.
    ///
    /// By default, samples 688 rows. A corpus no larger than this is compared exhaustively. Otherwise the pilot estimates the spread, clearance and scoring rate used to size the fresh verdict sample. Its size floors that sample.
    pub pilot: NonZero<usize> = DEFAULT_PILOT,
    /// Estimated verdict-sample time budget, ten minutes by default.
    ///
    /// The pilot's measured rate converts this duration into a row cap, floored at the pilot's size. This is a sizing estimate rather than a runtime deadline and excludes the pilot's own cost. [`ZERO`](Duration::ZERO) selects the pilot-size floor when the pilot has a positive measured duration. An unmeasurably short pilot imposes no time-derived cap.
    pub budget: Duration = DEFAULT_BUDGET,
}

const impl Default for SpotCheckOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Aggregate exact-recall evidence for one backend and corpus.
#[expect(
    private_interfaces,
    reason = "the typed readings serialize as plain numbers and reach an external reader through \
              the wire and `Display`; naming their concrete scalar types stays an in-crate \
              capability"
)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RecallSpotCheck {
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
    /// The pilot's separate deviation sizes this sample. This value describes the verdict rows.
    pub deviation: DNonNegative,
    /// The admission minimum the check ran under.
    pub minimum_recall: UnitFraction,
    /// The normal-approximation half-width of the verdict sample, in recall units.
    ///
    /// The [admission](Self::admission) reading uses h = z · s / √n · √((N − n) / (N − 1)), with
    /// `s` the verdict deviation, `n` its sample size, `N` the corpus size and `z` the normal
    /// quantile of the configured confidence. Zero when the sample is the corpus, because a census
    /// has no sampling error to bound.
    pub resolution: DNonNegative,
    /// The nominal one-sided confidence used for the resolution.
    pub confidence: OpenUnitFraction,
}

/// A recall interval's position relative to the configured admission minimum.
///
/// The interval has the normal-approximation limitations described in
/// [`recall`](crate::salt::knn::recall).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum RecallAdmission {
    /// The recall's lower bound clears the minimum.
    Admitted,
    /// The recall's interval spans the minimum: the sample demonstrates neither side of it.
    Unresolved,
    /// The recall's upper bound falls below the minimum.
    Refused,
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

    /// Classifies the recall interval against the configured admission minimum.
    ///
    /// Admits when the lower endpoint reaches the minimum and refuses when the upper endpoint falls
    /// below it. Otherwise returns [`Unresolved`](RecallAdmission::Unresolved), including when the
    /// budget-limited sample does not separate the interval from the minimum.
    ///
    /// For a fixed true recall, only one of false admission or false refusal is possible: the true
    /// value is either below the minimum or at least the minimum. Each comparison uses its
    /// corresponding one-sided normal quantile. Therefore no two-sided correction is needed to
    /// target either error separately, subject to the interval's normal-approximation limitations.
    #[inline]
    #[must_use]
    pub fn admission(&self) -> RecallAdmission {
        let recall = self.recall();

        if recall - self.resolution >= self.minimum_recall {
            RecallAdmission::Admitted
        } else if recall + self.resolution < self.minimum_recall {
            RecallAdmission::Refused
        } else {
            RecallAdmission::Unresolved
        }
    }
}

/// One brute-force reference neighbour, ordered by `(distance, row)`.
#[derive(Debug, Copy, Clone)]
struct ExactNeighbour<N> {
    row: N,
    distance: NonNegative,
}

impl<N> PartialEq for ExactNeighbour<N>
where
    N: Id,
{
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl<N> Eq for ExactNeighbour<N> where N: Id {}

impl<N> PartialOrd for ExactNeighbour<N>
where
    N: Id,
{
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<N> Ord for ExactNeighbour<N>
where
    N: Id,
{
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.distance
            .cmp(&other.distance)
            .then_with(|| self.row.cmp(&other.row))
    }
}

/// Returns up to `limit` non-self neighbours of `query` by exhaustive kernel ranking.
///
/// # Panics
///
/// This panics when `query` is outside `embeddings`.
fn exact_neighbours<N>(
    embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    query: N,
    limit: usize,
) -> impl IntoIterator<Item = N>
where
    N: Id,
{
    let query_embedding = &embeddings[query];

    let mut nearest = BinaryHeap::with_capacity(limit);
    for (row, embedding) in embeddings.iter_enumerated() {
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
/// The sample and its exact neighbour lists depend only on the corpus and the sampling draw. Reuse
/// one reference to score any number of backends or settings against identical queries.
#[derive(Debug)]
pub(crate) struct ExactReference<N> {
    /// Sampled rows and their exact neighbours, ascending within each row's list.
    queries: Vec<(N, Vec<N>)>,
    /// Exact neighbours compared per row.
    neighbours_per_row: usize,
}

impl<N> ExactReference<N>
where
    N: Id,
{
    /// Samples query rows and computes their exact cosine rankings in parallel.
    ///
    /// `embeddings` holds the projector representations in row order. A mapped `f32[T, 512]`
    /// artifact yields the slice directly. A `sample_size` beyond the corpus compares every row,
    /// and a `neighbours` beyond the corpus compares every non-self row.
    ///
    /// # Errors
    ///
    /// Returns [`KnnError`] when the corpus holds fewer than two rows.
    pub(crate) fn new<E>(
        embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
        neighbours: NonZero<usize>,
        sample_size: NonZero<usize>,
        rng: impl Rng,
    ) -> Result<Self, KnnError<N, E>> {
        let rows = embeddings.len();
        if rows < 2 {
            return Err(KnnValidationError::InsufficientRows { rows }.into());
        }

        let neighbours_per_row = neighbours.get().min(rows - 1);
        let sampled_rows = sample_size.get().min(rows);

        let sample: Vec<_> = sample_ids(rng, embeddings, sampled_rows).collect();
        let queries = sample
            .par_iter()
            .map(|&id| {
                let mut exact: Vec<_> = exact_neighbours(embeddings, id, neighbours_per_row)
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

    /// Scores constructed lists against the reference rankings.
    ///
    /// Sampled rows read their list prefix at the reference depth and compare in parallel. Lists
    /// narrower than the reference depth score what they hold. The reading carries raw counts and
    /// the per-row spread, without applying an admission minimum.
    ///
    /// # Panics
    ///
    /// This panics when a sampled query row is outside `lists`.
    pub(crate) fn score_lists(&self, lists: &NeighbourLists<N>) -> Scoring {
        let depth = self.neighbours_per_row.min(lists.width());
        let (matched, squares) = self
            .queries
            .par_iter()
            .map(|&(id, ref exact)| {
                let mut approximate: Vec<N> = lists.row(id)[..depth]
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
    /// This scoring queries sampled rows through
    /// [`search_by_id`](NearestNeighboursIndex::search_by_id) and compares them in parallel. The
    /// reading carries raw counts and the per-row spread, without applying an admission minimum.
    ///
    /// # Errors
    ///
    /// Returns [`KnnError`] when the backend fails a query.
    pub(crate) fn score<I>(&self, index: &I) -> Result<Scoring, KnnError<N, I::Error>>
    where
        I: NearestNeighboursIndex<N> + Sync,
        I::Error: Send,
    {
        let (matched, squares) = self
            .queries
            .par_iter()
            .map(|(id, exact)| {
                // A neighbour outside the row domain can never match an exact neighbour;
                // malformedness is the table build's concern, the spot check only scores.
                let mut approximate: Vec<N> = index
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

                Ok::<_, KnnError<N, I::Error>>((matches as u64, row_recall * row_recall))
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
    pub deviation: DNonNegative,
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
/// Computes sample deviation from aggregate counts and squared per-row recalls.
///
/// The per-row sum needs no separate accumulator: it is the matched total divided by the comparison
/// depth.
fn deviation(rows: usize, matched: u64, expected: u64, squares: f64) -> DNonNegative {
    if rows < 2 {
        return DNonNegative::ZERO;
    }

    #[expect(
        clippy::cast_precision_loss,
        reason = "spot-check edge counts remain far below exact f64 integer precision"
    )]
    let (count, mean) = (rows as f64, matched as f64 / expected as f64);
    // Squares can dip below the mean term by rounding when the spread is near zero. The clamp keeps
    // the root real.
    let variance = (count * mean).mul_add(-mean, squares).max(0.0) / (count - 1.0);

    // Per-row recalls lie in [0, 1]. Their squared sum is bounded by the row count, and the clamp
    // removes a negative rounding residual. The resulting finite, non-negative variance has a
    // finite, non-negative root.
    DNonNegative::new_unchecked(variance.sqrt())
}

/// Returns the rows that resolve the pilot's measured clearance of the admission minimum.
///
/// Uses [`mean_sample_size`] with the absolute difference between the pilot recall and the minimum
/// as its margin. A pilot exactly on the minimum returns [`usize::MAX`] before the corpus and
/// budget caps apply.
fn sizing_rows(
    piloted: &Scoring,
    minimum_recall: UnitFraction,
    confidence: OpenUnitFraction,
) -> usize {
    let clearance = (piloted.recall() - minimum_recall).abs();

    DPositive::new(clearance).map_or(usize::MAX, |clearance| {
        mean_sample_size(piloted.deviation, clearance, confidence)
    })
}

/// Estimates affordable rows from the measured sampling and scoring rate.
///
/// Each reference query scans the whole corpus. The pilot's rate estimates the verdict sample's
/// cost, without guaranteeing equal per-row time. A zero measured duration returns [`usize::MAX`].
fn budget_rows(budget: Duration, elapsed: Duration, measured: usize) -> usize {
    #[expect(
        clippy::cast_precision_loss,
        reason = "sample sizes stay far below exact f64 integer precision"
    )]
    let seconds_per_row = elapsed.as_secs_f64() / measured as f64;
    if seconds_per_row <= 0.0 {
        return usize::MAX;
    }

    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the quotient is non-negative, and the saturating float-to-integer conversion is \
                  the narrowing itself"
    )]
    let rows = (budget.as_secs_f64() / seconds_per_row) as usize;

    rows
}

/// Computes the one-sided half-width of the aggregate's sampling interval.
///
/// For sample size `n`, corpus size `N`, sample deviation `s` and normal quantile `z`, the
/// implemented width is z · s / √n · √((N − n) / (N − 1)). The correction makes a census's width
/// zero. For a proper subsample this is a plug-in normal approximation.
fn resolution(quantile: f64, scored: &Scoring, rows: usize) -> DNonNegative {
    #[expect(
        clippy::cast_precision_loss,
        reason = "sample and corpus sizes stay far below exact f64 integer precision"
    )]
    let (sampled, population) = (scored.sampled_rows as f64, rows as f64);

    if sampled <= 0.0 || population < 2.0 {
        return DNonNegative::ZERO;
    }

    let correction = ((population - sampled) / (population - 1.0))
        .max(0.0)
        .sqrt();

    // the confidence check excludes negative quantiles. The sample's deviation, the root and the
    // clamped correction are non-negative.
    DNonNegative::new_unchecked(quantile * scored.deviation / sampled.sqrt() * correction)
}

/// Sizes and reads one staged recall check, scoring sampled rows through `score`.
///
/// A pilot runs first, its measurements size the verdict sample, and the fresh verdict sample alone
/// decides. Both draws come from the one generator, and the two entry points differ only in what
/// `score` compares against.
///
/// # Errors
///
/// Returns [`KnnError`] when the confidence has a negative normal quantile, the corpus has fewer
/// than two rows, or `score` fails.
fn staged_check<N, E>(
    embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    options: SpotCheckOptions,
    mut rng: impl Rng,
    score: impl Fn(&ExactReference<N>) -> Result<Scoring, KnnError<N, E>>,
) -> Result<RecallSpotCheck, KnnError<N, E>>
where
    N: Id,
{
    let rows = embeddings.len();
    let quantile = normal_quantile(options.confidence);
    if quantile < 0.0 {
        // a confidence below one half gives a negative quantile and would produce a negative
        // resolution.
        return Err(KnnError::SampleConfidence {
            confidence: options.confidence,
        });
    }

    // Stage one. Timing the pilot inside the span that scores it prices
    // exactly the work the verdict sample repeats.
    let started = Instant::now();
    let pilot = ExactReference::new(embeddings, options.neighbours, options.pilot, &mut rng)?;
    let piloted = score(&pilot)?;
    let elapsed = started.elapsed();

    let scored = if pilot.sampled_rows() >= rows {
        // a census already measures every row. Reuse exactly that reading without a second
        // exhaustive pass.
        piloted
    } else {
        // Stages two and three. The pilot sizes the verdict sample
        // between its own size and the budget's reach; the verdict
        // sample decides, and the pilot takes no part in that reading.
        let floor = pilot.sampled_rows();
        let ceiling = budget_rows(options.budget, elapsed, floor)
            .max(floor)
            .min(rows);
        let size =
            sizing_rows(&piloted, options.minimum_recall, options.confidence).clamp(floor, ceiling);
        let size = NonZero::new(size).expect("the pilot's nonzero size floors the verdict sample");

        score(&ExactReference::new(
            embeddings,
            options.neighbours,
            size,
            &mut rng,
        )?)?
    };

    Ok(RecallSpotCheck {
        sampled_rows: scored.sampled_rows,
        neighbours_per_row: scored.neighbours_per_row,
        matched: scored.matched,
        expected: scored.expected,
        deviation: scored.deviation,
        minimum_recall: options.minimum_recall,
        resolution: resolution(quantile, &scored, rows),
        confidence: options.confidence,
    })
}

/// Measures recall of constructed lists against sampled brute-force rankings.
///
/// Uses the pilot and verdict sampling described in the [module](crate::salt::knn::recall). The
/// lists must cover the same row domain as `embeddings`.
///
/// # Errors
///
/// Returns [`KnnError`] when the confidence is below one half or the corpus holds fewer than two
/// rows.
///
/// # Panics
///
/// This panics when a sampled query row is outside `lists`.
#[tracing::instrument(skip_all)]
pub(crate) fn spot_check_lists<N, E>(
    lists: &NeighbourLists<N>,
    embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    options: SpotCheckOptions,
    rng: impl Rng,
) -> Result<RecallSpotCheck, KnnError<N, E>>
where
    N: Id,
{
    staged_check(embeddings, options, rng, |reference| {
        Ok(reference.score_lists(lists))
    })
}

/// Measures recall of `index` against exact cosine rankings, sizing the sample in three stages.
///
/// `embeddings` holds the projector representations the backend indexed, in row order, and a mapped
/// `f32[T, 512]` artifact yields the slice directly.
///
/// A pilot measures the per-row deviation, the aggregate's clearance of the minimum, and the
/// sampling rate. Those measurements size one fresh verdict sample, floored at the pilot's size and
/// capped by the corpus and the budget's reach, and that sample alone carries the
/// [admission](RecallSpotCheck::admission) reading. A pilot that already covers the corpus is
/// exhaustive and is itself the reading.
///
/// Both draws come from the one generator. Fixed-size seeded draws repeat, but floating-point
/// reduction order and measured timing can affect sizing and
/// [resolution](RecallSpotCheck::resolution).
///
/// # Errors
///
/// Returns [`KnnError`] when the confidence is below one half, the corpus holds fewer than two
/// rows, or a backend query fails.
#[cfg(test)] // The knn tests score fixture backends through the full sampling path.
pub(crate) fn spot_check<N, I>(
    index: &I,
    embeddings: &IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    options: SpotCheckOptions,
    rng: impl Rng,
) -> Result<RecallSpotCheck, KnnError<N, I::Error>>
where
    N: Id,
    I: NearestNeighboursIndex<N> + Sync,
    I::Error: Send,
{
    staged_check(embeddings, options, rng, |reference| reference.score(index))
}
