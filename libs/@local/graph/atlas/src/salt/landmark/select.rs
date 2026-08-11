//! Weighted stratified landmark selection.
//!
//! Selection uses weighted sampling without replacement by exponential clocks: candidate `i`
//! receives the priority
//!
//! ```text
//! t_i = -ln(U_i) / w_i,
//! ```
//!
//! `U_i` drawn uniformly from `(0, 1]` and `w_i` the candidate's sampling weight, and the smallest
//! priorities win. Selection runs in three phases over one shared set of priorities: subgroup
//! minimums first, then prior landmarks up to the retained target, then a free fill to capacity.
//! Later phases never evict earlier picks, so every minimum still holds in the final selection.
//!
//! The corpus-scale passes run in parallel and deterministically. Priorities come from one
//! generator per fixed-size candidate chunk, each seeded by the caller's generator, and every phase
//! reduces thread-local top-`k` heaps into the unique best set under the (priority, index) total
//! order. A rerun over equal candidates with an equally seeded generator selects identical rows at
//! any thread count.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::{
    cmp::Ordering,
    error::Error,
    fmt, mem,
    num::NonZero,
    ops::{Index, IndexMut},
};
use std::collections::HashSet;

use hashql_core::id::{Id, IdSlice, IdVec, bit_vec::DenseBitSet};
use rand::{Rng, RngExt as _, SeedableRng};
use rayon::{
    iter::{
        IndexedParallelIterator as _, IntoParallelIterator as _, IntoParallelRefIterator as _,
        ParallelIterator as _,
    },
    slice::{ParallelSlice as _, ParallelSliceMut as _},
};

use crate::math::UnitFraction;

/// A landmark-stratification axis.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u8)]
pub(crate) enum SubgroupDimension {
    Density = 0,
    Language = 1,
    Source = 2,
    EntityRole = 3,
    TypeFamily = 4,
    Community = 5,
    TemporalCohort = 6,
}

impl SubgroupDimension {
    /// The number of stratification axes.
    pub(crate) const COUNT: usize = mem::variant_count::<Self>();

    /// Returns the axis name.
    const fn name(self) -> &'static str {
        match self {
            Self::Density => "density",
            Self::Language => "language",
            Self::Source => "source",
            Self::EntityRole => "entity-role",
            Self::TypeFamily => "type-family",
            Self::Community => "community",
            Self::TemporalCohort => "temporal-cohort",
        }
    }
}

/// Categorical values on every stratification axis, indexed by [`SubgroupDimension`].
#[derive(
    Debug,
    Copy,
    Clone,
    Default,
    zerocopy::ByteEq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
pub(crate) struct SubgroupAxes([u32; SubgroupDimension::COUNT]);

const impl Index<SubgroupDimension> for SubgroupAxes {
    type Output = u32;

    #[inline]
    fn index(&self, index: SubgroupDimension) -> &u32 {
        &self.0[index as usize]
    }
}

const impl IndexMut<SubgroupDimension> for SubgroupAxes {
    #[inline]
    fn index_mut(&mut self, index: SubgroupDimension) -> &mut u32 {
        &mut self.0[index as usize]
    }
}

/// One categorical value on a stratification axis.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Subgroup {
    pub dimension: SubgroupDimension,
    pub value: u32,
}

impl fmt::Display for Subgroup {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}:{}", self.dimension.name(), self.value)
    }
}

/// A required minimum number of landmarks from one subgroup.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SubgroupMinimum {
    pub subgroup: Subgroup,
    pub count: NonZero<usize>,
}

/// A candidate's relative selection propensity.
///
/// Finite and strictly positive, valid by construction.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd)]
pub(crate) struct SamplingWeight(f64);

impl SamplingWeight {
    /// The neutral sampling weight, giving every row equal likelihood.
    pub(crate) const UNIFORM: Self = Self(1.0);

    /// Validates a weight.
    ///
    /// Returns [`None`] unless the value is finite and strictly positive.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: f64) -> Option<Self> {
        if !(value.is_finite() && value > 0.0) {
            return None;
        }

        Some(Self(value))
    }

    /// Returns the weight.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> f64 {
        self.0
    }
}

/// Selection metadata for one candidate node row.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LandmarkCandidate<N> {
    pub row: N,
    pub sampling_weight: SamplingWeight,
    /// The candidate's value on every stratification axis.
    pub axes: SubgroupAxes,
    /// Whether the row was a landmark of the prior generation.
    pub prior_landmark: bool,
}

impl<N> LandmarkCandidate<N> {
    /// Returns whether the candidate carries the subgroup's value.
    #[inline]
    const fn belongs_to(&self, subgroup: Subgroup) -> bool {
        self.axes[subgroup.dimension] == subgroup.value
    }
}

/// Capacity and retention settings for one selection.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SelectionOptions {
    /// The landmark capacity `M`.
    ///
    /// Selection returns at most this many rows, fewer only when the corpus is smaller. The `u32` width is the [`LandmarkOrdinal`] encoding's contract: every selection position fits the persisted ordinal form.
    pub maximum_count: NonZero<u32>,
    /// Fraction of the capacity reserved for prior landmarks when enough are on offer.
    ///
    /// Retention stabilizes generation-to-generation orientation.
    // The default is an unvalidated starting point; the temporal-drift
    // and landmark rank-correlation criteria revise it from evidence.
    pub retained_fraction: UnitFraction = const { UnitFraction::new(0.25).unwrap() },
    /// Candidates per generator stream: the priority pass's seeding and parallel work unit.
    ///
    /// This value fixes which stream draws for which candidate, so equal seeds reproduce equal selections only under an equal chunk. The manifest echo records the chunk beside the seed. The chunk holds enough candidates that per-task overhead disappears against the scans.
    pub parallel_chunk: NonZero<usize> = PARALLEL_CHUNK,
}

hashql_core::id::newtype! {
    /// A reference to a landmark by its position in a [`LandmarkSelection`].
    ///
    /// Ordinals are dense and zero-based: the value is the position of the landmark's node row in the selection's ascending row order. The little-endian representation is the persisted form, so a column of these ordinals moves to and from artifact files without conversion.
    #[id(endian = little, unaligned, derive(Step), const)]
    pub(crate) struct LandmarkOrdinal(u32)
}

/// Canonically ordered selected rows.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct LandmarkSelection<N> {
    rows: Box<IdSlice<LandmarkOrdinal, N>>,
    retained_count: usize,
}

impl<N> LandmarkSelection<N>
where
    N: Id,
{
    /// Borrows the selected rows, strictly ascending.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> &IdSlice<LandmarkOrdinal, N> {
        &self.rows
    }

    /// Returns the number of selected landmarks.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> usize {
        self.rows.len()
    }

    /// Returns how many selected rows were prior landmarks.
    #[inline]
    #[must_use]
    pub(crate) const fn retained_count(&self) -> usize {
        self.retained_count
    }

    /// Maps every selected row through `map`, preserving ordinals and the retained count.
    ///
    /// The selection's vocabulary is positional, where ordinal `i` names the `i`-th selected row. A
    /// row translation therefore composes without touching the assignment or the layout built
    /// against it.
    ///
    /// # Panics
    ///
    /// This panics when the mapped rows break the strictly ascending row order. A strictly
    /// increasing `map` preserves it.
    #[must_use]
    pub(crate) fn map_rows<M>(&self, map: impl FnMut(N) -> M) -> LandmarkSelection<M>
    where
        M: Id,
    {
        let rows: Box<[M]> = self.rows.iter().copied().map(map).collect();
        assert!(
            rows.is_sorted(),
            "the mapped selection keeps its strictly ascending row order",
        );

        let rows = IdSlice::from_boxed_slice(rows);
        LandmarkSelection {
            rows,
            retained_count: self.retained_count,
        }
    }

    /// Returns the ordinal of a selected row, or `None` when the row is not a landmark.
    #[inline]
    #[must_use]
    pub(crate) fn ordinal(&self, row: N) -> Option<LandmarkOrdinal> {
        let position = self.rows.binary_search(&row).ok()?;

        Some(position)
    }
}

/// The selection inputs are unsatisfiable or malformed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SelectionError {
    /// The corpus offers no candidates.
    EmptyCorpus,
    /// Candidate rows are not strictly ascending.
    UnorderedCandidates { index: usize },
    /// A subgroup carries more than one minimum.
    DuplicateMinimum { subgroup: Subgroup },
    /// The minimums together demand more rows than the capacity.
    MinimumExceedsCapacity { requested: usize, capacity: usize },
    /// A subgroup offers fewer candidates than its minimum demands.
    InsufficientSubgroup {
        subgroup: Subgroup,
        required: usize,
        available: usize,
    },
}

impl fmt::Display for SelectionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::EmptyCorpus => fmt.write_str("landmark selection needs at least one candidate"),
            Self::UnorderedCandidates { index } => write!(
                fmt,
                "candidate {index} breaks the strictly ascending row order",
            ),
            Self::DuplicateMinimum { subgroup } => {
                write!(fmt, "the subgroup {subgroup} carries more than one minimum")
            }
            Self::MinimumExceedsCapacity {
                requested,
                capacity,
            } => write!(
                fmt,
                "the subgroup minimums demand {requested} rows of a capacity of {capacity}",
            ),
            Self::InsufficientSubgroup {
                subgroup,
                required,
                available,
            } => write!(
                fmt,
                "the subgroup {subgroup} offers {available} candidates where its minimum demands \
                 {required}",
            ),
        }
    }
}

impl Error for SelectionError {}

hashql_core::id::newtype! {
    /// A candidate's position in the selection input, in ascending row order.
    #[id(derive(Step))]
    pub(crate) struct CandidateId(u64)
}

hashql_core::id::newtype! {
    /// A minimum's position in the subgroup-ordered minimums.
    ///
    /// Candidates and minimums index unrelated domains, so mixing a [`MinimumId`] with a [`CandidateId`] is a type error rather than a silent off-by-everything.
    #[id(derive(Step))]
    pub(crate) struct MinimumId(u64)
}

/// A candidate ordered by ascending priority, ties by candidate index.
#[derive(Debug, Copy, Clone)]
struct RankedCandidate {
    id: CandidateId,
    priority: f64,
}

impl PartialEq for RankedCandidate {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for RankedCandidate {}

impl PartialOrd for RankedCandidate {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for RankedCandidate {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .total_cmp(&other.priority)
            .then_with(|| self.id.cmp(&other.id))
    }
}

/// Draws every candidate's exponential-clock priority, in parallel.
///
/// One generator serves each `chunk` of candidates, seeded from the caller's generator in chunk
/// order.
fn priorities<N, R>(
    candidates: &IdSlice<CandidateId, LandmarkCandidate<N>>,
    chunk: NonZero<usize>,
    rng: &mut R,
) -> IdVec<CandidateId, f64>
where
    N: Id,
    R: Rng + SeedableRng,
{
    let seeds: Vec<u64> = rng
        .random_iter()
        .take(candidates.len().div_ceil(chunk.get()))
        .collect();

    let mut priorities = IdVec::from_elem(0.0_f64, candidates.len());

    (
        priorities.as_raw_mut().par_chunks_mut(chunk.get()),
        candidates.as_raw().par_chunks(chunk.get()),
        seeds.into_par_iter(),
    )
        .into_par_iter()
        .for_each(|(priorities, candidates, seed)| {
            let mut rng = R::seed_from_u64(seed);

            for (priority, candidate) in priorities.iter_mut().zip(candidates) {
                // 1 - U maps the generator's [0, 1) onto (0, 1], keeping the logarithm finite.
                *priority = -(1.0 - rng.random::<f64>()).ln() / candidate.sampling_weight.get();
            }
        });

    priorities
}

fn validate<N>(
    candidates: &IdSlice<CandidateId, LandmarkCandidate<N>>,
    minimums: &IdSlice<MinimumId, SubgroupMinimum>,
) -> Result<(), SelectionError>
where
    N: Id,
{
    if candidates.is_empty() {
        return Err(SelectionError::EmptyCorpus);
    }

    if let Some(position) = candidates
        .as_raw()
        .par_array_windows::<2>()
        .position_first(|pair| matches!(pair, [left, right] if left.row >= right.row))
    {
        return Err(SelectionError::UnorderedCandidates {
            index: position + 1,
        });
    }

    let mut subgroups = HashSet::with_capacity(minimums.len());
    for minimum in minimums {
        if !subgroups.insert(minimum.subgroup) {
            return Err(SelectionError::DuplicateMinimum {
                subgroup: minimum.subgroup,
            });
        }
    }

    Ok(())
}

/// Returns `ceil(capacity · retained_fraction)`.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    reason = "the product of a bounded capacity and a unit-interval fraction is a small \
              non-negative integer count"
)]
#[inline]
fn retained_target(capacity: usize, retained_fraction: UnitFraction) -> usize {
    (capacity as f64 * retained_fraction.get()).ceil() as usize
}

/// Returns the indices of the `count` smallest-priority unselected candidates.
///
/// Only candidates satisfying `predicate` qualify, and fewer return when the pool is smaller.
///
/// Workers filter in parallel and one exact selection cuts the (priority, index) total order at
/// `count`: the result is the unique best set, independent of how the scan splits across threads.
fn best_indices<N>(
    candidates: &IdSlice<CandidateId, LandmarkCandidate<N>>,
    priorities: &IdSlice<CandidateId, f64>,
    selected: &DenseBitSet<CandidateId>,
    count: usize,
    output: &mut Vec<CandidateId>,
    predicate: impl Fn(LandmarkCandidate<N>) -> bool + Sync,
) where
    N: Id,
{
    output.clear();

    if count == 0 {
        return;
    }

    let mut ranked: Vec<RankedCandidate> = candidates
        .as_raw()
        .par_iter()
        .enumerate()
        .map(|(index, candidate)| (CandidateId::from_usize(index), candidate))
        .with_min_len(PARALLEL_CHUNK.get())
        .filter(|&(id, &candidate)| !selected.contains(id) && predicate(candidate))
        .map(|(id, _)| RankedCandidate {
            id,
            priority: priorities[id],
        })
        .collect();

    if ranked.len() > count {
        ranked.select_nth_unstable(count - 1);
        ranked.truncate(count);
    }

    output.extend(ranked.into_iter().map(|ranked| ranked.id));
}

/// Inserts the chosen indices and returns how many carried the prior landmark flag.
fn mark<N>(
    selected: &mut DenseBitSet<CandidateId>,
    candidates: &IdSlice<CandidateId, LandmarkCandidate<N>>,
    indices: &[CandidateId],
) -> usize {
    let mut retained = 0;

    for &index in indices {
        let candidate = &candidates[index];

        selected.insert(index);
        if candidate.prior_landmark {
            retained += 1;
        }
    }

    retained
}

/// Candidates per parallel work item.
///
/// 4096 candidates give each task tens of microseconds of work, large enough that per-task overhead
/// disappears against the scans.
pub(crate) const PARALLEL_CHUNK: NonZero<usize> = const { NonZero::new(4096).unwrap() };

/// Selects at most the configured capacity, honoring minimums and retention.
///
/// `candidates` arrive in strictly ascending row order, and `rng` seeds the priority streams. The
/// selection satisfies every subgroup minimum, then retains prior landmarks up to `ceil(capacity *
/// retained_fraction)` when enough are on offer, then fills to capacity, all by ascending
/// exponential-clock priority.
///
/// # Errors
///
/// Returns an error for an empty corpus, unordered candidate rows, duplicate minimums, or minimums
/// the corpus or capacity cannot satisfy.
pub(crate) fn select_landmarks<N, R>(
    candidates: &IdSlice<CandidateId, LandmarkCandidate<N>>,
    minimums: &IdSlice<MinimumId, SubgroupMinimum>,
    options: SelectionOptions,
    mut rng: R,
) -> Result<LandmarkSelection<N>, SelectionError>
where
    N: Id,
    R: Rng + SeedableRng,
{
    validate(candidates, minimums)?;

    let capacity = (options.maximum_count.get() as usize).min(candidates.len());
    let priorities = priorities(candidates, options.parallel_chunk, &mut rng);
    let mut chosen = Vec::new();

    let mut selected = DenseBitSet::new_empty(candidates.len());
    let mut retained_count = 0_usize;

    let mut ordered_minimums: IdVec<MinimumId, SubgroupMinimum> = minimums.to_owned();
    ordered_minimums.sort_unstable_by_key(|minimum| minimum.subgroup);

    // Rows selected for earlier minimums count toward later ones: a
    // row satisfies every subgroup it belongs to. The counters advance
    // at mark time instead of rescanning the corpus per minimum.
    let mut subgroup_counts = IdVec::from_elem(0, ordered_minimums.len());

    for (id, minimum) in ordered_minimums.iter_enumerated() {
        let required = minimum.count.get().saturating_sub(subgroup_counts[id]);
        let requested = selected.count() + required;

        if requested > capacity {
            return Err(SelectionError::MinimumExceedsCapacity {
                requested,
                capacity,
            });
        }

        best_indices(
            candidates,
            &priorities,
            &selected,
            required,
            &mut chosen,
            |candidate| candidate.belongs_to(minimum.subgroup),
        );
        if chosen.len() != required {
            return Err(SelectionError::InsufficientSubgroup {
                subgroup: minimum.subgroup,
                required: minimum.count.get(),
                available: subgroup_counts[id] + chosen.len(),
            });
        }

        for &chosen_id in &chosen {
            let candidate = candidates[chosen_id];
            for (later_id, later) in ordered_minimums.iter_enumerated().skip(id.as_usize() + 1) {
                if candidate.belongs_to(later.subgroup) {
                    subgroup_counts[later_id] += 1;
                }
            }
        }

        retained_count += mark(&mut selected, candidates, &chosen);
    }

    let retained_target = retained_target(capacity, options.retained_fraction);
    let retained_needed = retained_target
        .saturating_sub(retained_count)
        .min(capacity - selected.count());
    best_indices(
        candidates,
        &priorities,
        &selected,
        retained_needed,
        &mut chosen,
        |candidate| candidate.prior_landmark,
    );
    retained_count += mark(&mut selected, candidates, &chosen);

    best_indices(
        candidates,
        &priorities,
        &selected,
        capacity - selected.count(),
        &mut chosen,
        |_| true,
    );
    retained_count += mark(&mut selected, candidates, &chosen);

    let selected_rows: Vec<_> = selected.into_iter().map(|id| candidates[id].row).collect();
    Ok(LandmarkSelection {
        rows: IdSlice::from_boxed_slice(selected_rows.into_boxed_slice()),
        retained_count,
    })
}
