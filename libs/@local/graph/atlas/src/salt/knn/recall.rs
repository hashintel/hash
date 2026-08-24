//! Exact recall spot check for approximate search backends.
//!
//! For each sampled node row, [`spot_check`] compares an approximate query with a brute-force
//! cosine ranking over the same projector matrix. Both rankings exclude the query row and resolve
//! equal distances by ascending row. Recall is the total intersection count divided by the total
//! number of exact neighbours across the sample, and the check admits a backend when that
//! aggregate's lower bound clears the configured [minimum](SpotCheckOptions::minimum_recall).
//!
//! The check sizes the sample in three stages, because the criterion is an aggregate mean whose
//! per-row variance is a corpus property. A pilot measures the mean's deviation, the aggregate's
//! clearance of the minimum, and the rate the brute force runs at. Those measurements size one
//! fresh verdict sample. Its count resolves the *measured* clearance at the configured
//! [confidence](SpotCheckOptions::confidence), with a floor at the pilot's size and a cap from the
//! corpus and from what the [budget](SpotCheckOptions::budget) buys at the measured rate. The
//! verdict sample alone decides, and it decides by interval, because [`RecallAdmission`] reads the
//! recall's one-sided bound against the minimum, never the point estimate. No fixed margin shows up
//! anywhere. What a decision has to resolve is the clearance the run measures, so a backend far
//! above the floor settles at the pilot's size and one near the floor draws until the budget stops
//! it.
//!
//! The pilot sizes but does not vote. A bound holds at its stated confidence only over data the
//! sizing never saw, so the check draws the verdict sample fresh and reads it once. A check
//! that re-read a growing sample until the bound cleared the floor admits a backend sitting exactly
//! on the floor sooner or later, whatever confidence it printed. The knobs are scale-free, and the
//! check measures both the variance and the clearance rather than reading them from configuration.
//! (An acceptance-sampling budget, which was this check's original sizing, certifies all-pass
//! criteria and guarantees nothing about a mean: per-row recall is strongly bimodal, and at the
//! acceptance-sized 688 rows the check refused sound backends on sampling noise.)
//!
//! The exact side of the check stands alone as [`ExactReference`]: one sampled brute-force
//! reference scores any number of backends or backend settings, so a parameter sweep pays the exact
//! rankings once instead of once per grid point. [`spot_check`] is the one-backend composition of
//! the two halves.

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

// The defaults are the backend admission criterion, recall@50 ≥ 0.89:
// the criterion is aggregate recall over the sample, so a long per-row
// tail cannot fail a backend whose aggregate holds.
const DEFAULT_NEIGHBOURS: NonZero<usize> = nz!(50);
const DEFAULT_MINIMUM_RECALL: UnitFraction = unit_fraction!(0.89);
// A one-in-a-hundred risk that the aggregate's sampling error exceeds
// the reported resolution in the admitting direction. The sample grows
// as the square of the normal quantile, so the sample size prices the level in rows. 0.999 costs
// ~1.8x the sample this one sizes, and 0.95 costs half of it while admitting one backend in twenty
// whose true aggregate sits below the floor.
const DEFAULT_CONFIDENCE: OpenUnitFraction = open_unit_fraction!(0.99);
// The acceptance-era sample size, kept as the pilot: large enough to
// read the per-row deviation within a few percent, small enough that
// a decisively good or bad backend settles at ~19s of brute force.
const DEFAULT_PILOT: NonZero<usize> = nz!(688);
// How long a build may spend proving its own admission. The value is a policy decision about a
// machine's time rather than a measured quantity. Ten minutes covers the sizing at the scale the
// check runs at: the full-scale backend sweep (985,932 rows) measured healthy builds at ~0.902
// against the 0.89 floor with a per-row deviation of ~0.32 (near-tie rows score
// ~0.5 on any ANN index), so a healthy build's clearance sizes ~3,850
// rows, ~108s of brute force, and a build clearing by half of that
// sizes four times as many. Past the budget the check reports the
// resolution it reached instead of spending a run's afternoon on a
// difference no decision turns on.
const DEFAULT_BUDGET: Duration = Duration::from_secs(600);

/// Pinned sampling and admission settings for one recall spot check.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SpotCheckOptions {
    /// Exact neighbours compared per sampled row.
    ///
    /// A corpus smaller than this compares every non-self row. This is the `k` of the measured
    /// recall@k, independent of the persisted table's neighbour count.
    pub neighbours: NonZero<usize> = DEFAULT_NEIGHBOURS,
    /// Minimum admitted aggregate recall over the sample.
    pub minimum_recall: UnitFraction = DEFAULT_MINIMUM_RECALL,
    /// One-sided confidence that the aggregate's sampling error stays inside the reported
    /// [resolution](RecallSpotCheck::resolution).
    ///
    /// Above one half, so the sizing quantile stays non-negative; the check refuses a smaller
    /// confidence before it samples.
    pub confidence: OpenUnitFraction = DEFAULT_CONFIDENCE,
    /// Rows of the sizing pilot.
    ///
    /// A corpus smaller than this compares every row exhaustively. The pilot measures the per-row deviation, the aggregate's clearance of the minimum, and the rate the brute force runs at, and its size floors the verdict sample, because a normal bound over a sample too small to estimate its own deviation resolves nothing.
    pub pilot: NonZero<usize> = DEFAULT_PILOT,
    /// Wall clock the verdict sample may spend, at the rate the pilot measured.
    ///
    /// A sizing beyond the budget's reach draws what the budget affords and records the resolution
    /// it achieved. [`ZERO`](Duration::ZERO) draws the verdict sample at the pilot's size.
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
    /// What this sample measured, not what sized it: the pilot's own reading of the spread is what
    /// chose this sample's size.
    pub deviation: DNonNegative,
    /// The admission minimum the check ran under.
    pub minimum_recall: UnitFraction,
    /// The one-sided sampling resolution the verdict sample achieved, in recall units.
    ///
    /// The half-width `z · deviation / sqrt(sampled_rows)` the [admission](Self::admission)
    /// reading compares against the minimum, narrowed by the finite-population factor. Zero
    /// when the sample is the corpus, because a census has no sampling error to bound.
    pub resolution: DNonNegative,
    /// The one-sided confidence the resolution holds at.
    pub confidence: OpenUnitFraction,
}

/// What one recall spot check demonstrated about its backend.
///
/// The reading compares the aggregate's one-sided interval with the admission minimum, so it
/// separates a backend proven good from one proven bad from a sample that settles neither.
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

    /// Returns what the sample demonstrated about the configured admission minimum.
    ///
    /// Admission asks the interval rather than the point estimate. This reading admits a backend
    /// when its recall's lower bound clears the minimum. It refuses one when the upper bound falls
    /// below the minimum, and it reports [`Unresolved`](RecallAdmission::Unresolved) when the
    /// achieved [resolution](Self::resolution) spans the minimum. A sample that ran out of budget
    /// has measured something, though not the thing the floor asks about.
    ///
    /// Each side spends the confidence once, and a one-sided quantile bounds both risks: for any
    /// one true recall only one of the two errors is possible, so admitting a backend below the
    /// minimum and refusing one above it each stay at `1 - confidence`.
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

/// Returns the `limit` exact nearest non-self neighbours of `query`.
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
/// The sample and its exact neighbour lists depend only on the corpus and the sampling draw, so one
/// reference scores any number of backends or backend settings against identical queries.
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
    /// `embeddings` holds the projector representations in row order; a mapped `f32[T, 512]`
    /// artifact yields the slice directly. A `sample_size` beyond the corpus compares every row,
    /// and a `neighbours` beyond the corpus compares every non-self row.
    ///
    /// # Errors
    ///
    /// Returns an error when the corpus holds fewer than two rows.
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
    /// the per-row spread, and admission criteria live with the caller.
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
    /// reading carries raw counts and the per-row spread, and admission criteria live with the
    /// caller.
    ///
    /// # Errors
    ///
    /// Returns an error when the backend fails a query.
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
/// Derived from the aggregate counts and the sum of squared per-row recalls.
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

    // Per-row recalls lie in [0, 1], so the squared sum stays within the row count and the
    // clamped variance is finite non-negative. The root of such a value is in domain.
    DNonNegative::new_unchecked(variance.sqrt())
}

/// Returns the rows that resolve the pilot's measured clearance of the admission minimum.
///
/// [`mean_sample_size`]'s identity, with the clearance the pilot measured standing where a
/// configured margin otherwise would. What a decision has to resolve is how far the aggregate sits
/// from the floor, and only the run knows that.
///
/// A caller that has already read a quantile out of `confidence` leaves one way for the sizing to
/// come back empty: an aggregate sitting exactly on the floor, which no finite sample resolves and
/// which therefore asks for every row a budget allows.
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

/// Returns the rows `budget` buys at the rate `measured` rows took to sample and score.
///
/// The exact reference scans the whole corpus per sampled row, so the pilot's own cost per row is
/// the verdict sample's cost per row. The budget converts to rows against a rate this machine
/// demonstrated in the same run, never against a per-row cost recorded from another one. A pilot
/// too fast to time affords everything.
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
/// `z * deviation / sqrt(n)`, narrowed by the finite-population factor `sqrt((N - n) / (N - 1))`:
/// the aggregate is a mean over rows drawn without replacement from a corpus of `N`, so a sample
/// that reaches the corpus has no sampling error left to bound and the point estimate is the
/// population value.
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

    // The caller refused a confidence at or below one half, so the quantile is non-negative;
    // the deviation, the root, and the clamped correction are non-negative by construction.
    DNonNegative::new_unchecked(quantile * scored.deviation / sampled.sqrt() * correction)
}

/// Sizes and reads one staged recall check, scoring sampled rows through `score`.
///
/// A pilot runs first, its measurements size the verdict sample, and the fresh verdict sample alone
/// decides. Both draws come from the one generator, and the two entry points differ only in what
/// `score` compares against.
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
        // A one-sided bound needs a non-negative quantile: a confidence at or below one half
        // would size no sample and read a negative resolution.
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
        // A pilot that covered the corpus is a census. No sample size remains to choose, so the
        // sizing had no freedom to bias and the reading is exactly what the pilot measured.
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

/// Measures recall of constructed lists against exact cosine rankings, sizing the sample in three
/// stages.
///
/// The sizing mirrors [`spot_check`], and scoring reads the lists in place, so the verdict sample
/// pays only for its exact rankings.
///
/// # Errors
///
/// Returns an error when the corpus holds fewer than two rows or the confidence is degenerate
/// ([`SampleConfidence`](KnnError::SampleConfidence)).
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
/// Both draws come from the one generator, so a seeded check replays exactly whenever the budget
/// leaves the sizing alone. A run whose verdict sample the budget truncates samples what its own
/// machine afforded, and records the [resolution](RecallSpotCheck::resolution) it reached.
///
/// # Errors
///
/// Returns an error when the corpus has at most one row, when the confidence is degenerate
/// ([`SampleConfidence`](KnnError::SampleConfidence)), or when a backend query fails.
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
