//! Weighted stratified landmark selection.
//!
//! Selection is weighted sampling without replacement by exponential clocks: candidate `i` receives
//! the priority
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
//! The corpus-scale passes run in parallel and deterministically: priorities come from one
//! generator per fixed-size candidate chunk, each seeded by the caller's generator, and every phase
//! reduces thread-local top-`k` heaps into the unique best set under the (priority, index) total
//! order. A rerun over equal candidates with an equally seeded generator selects identical rows at
//! any thread count.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use alloc::collections::BinaryHeap;
use core::{
    cmp::Ordering,
    error::Error,
    fmt, mem,
    num::NonZero,
    ops::{Index, IndexMut},
};
use std::collections::HashSet;

use rand::{Rng, RngExt as _, SeedableRng};
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelRefIterator as _, ParallelIterator as _},
    slice::{ParallelSlice as _, ParallelSliceMut as _},
};
use zerocopy::{LE, U32};

use crate::{bitset::BitSet, dataset::NodeRowId, math::UnitFraction};

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
    /// The uniform weight.
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
pub(crate) struct LandmarkCandidate {
    pub row: NodeRowId,
    pub sampling_weight: SamplingWeight,
    /// The candidate's value on every stratification axis.
    pub axes: SubgroupAxes,
    /// Whether the row was a landmark of the prior generation.
    pub prior_landmark: bool,
}

impl LandmarkCandidate {
    /// Returns whether the candidate carries the subgroup's value.
    #[inline]
    const fn belongs_to(self, subgroup: Subgroup) -> bool {
        self.axes[subgroup.dimension] == subgroup.value
    }
}

/// Capacity and retention settings for one selection.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SelectionOptions {
    /// The landmark capacity `M`.
    ///
    /// At most this many rows are selected, fewer only when the corpus is smaller. The `u32` width
    /// is the [`LandmarkOrdinal`] encoding's contract: every selection position fits the persisted
    /// ordinal form.
    pub maximum_count: NonZero<u32>,
    /// Fraction of the capacity reserved for prior landmarks when enough are on offer.
    ///
    /// Retention stabilizes generation-to-generation orientation. Defaults to 0.25.
    // The default is an unvalidated starting point; the temporal-drift
    // and landmark rank-correlation criteria revise it from evidence.
    pub retained_fraction: UnitFraction = const { UnitFraction::new(0.25).unwrap() },
}

/// A reference to a landmark by its position in a [`LandmarkSelection`].
///
/// Ordinals are dense and zero-based: the value is the position of the landmark's node row in the
/// selection's ascending row order. The little-endian representation is the persisted form, so a
/// column of these ordinals is written to and read from artifact files without conversion.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialOrd,
    Ord,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct LandmarkOrdinal(U32<LE>);

impl LandmarkOrdinal {
    /// Creates an ordinal referencing the landmark at `position`.
    #[inline]
    #[must_use]
    pub(crate) const fn new(position: u32) -> Self {
        Self(U32::new(position))
    }

    /// Returns the referenced selection position.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u32 {
        self.0.get()
    }

    /// Returns the ordinal as an index into a landmark-aligned column.
    #[inline]
    #[must_use]
    pub(crate) const fn usize(self) -> usize {
        self.get() as usize
    }
}

/// Canonically ordered selected rows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LandmarkSelection {
    rows: Box<[NodeRowId]>,
    retained_count: usize,
}

impl LandmarkSelection {
    /// Borrows the selected rows, strictly ascending.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> &[NodeRowId] {
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

    /// Returns the ordinal of a selected row, or `None` when the row is not a landmark.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the selection length is bounded by the u32 capacity at construction"
    )]
    #[inline]
    #[must_use]
    pub(crate) fn ordinal(&self, row: NodeRowId) -> Option<LandmarkOrdinal> {
        let position = self.rows.binary_search(&row).ok()?;
        Some(LandmarkOrdinal::new(position as u32))
    }
}

/// The selection inputs are unsatisfiable or malformed.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum SelectionError {
    /// No candidates were offered.
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

/// Candidates per parallel work item.
///
/// For priorities this is also the seeding unit: one generator stream serves this many candidates,
/// so which stream draws for which candidate is fixed by this constant alone and results are
/// independent of thread count. The constant is pinned rather than configurable because changing it
/// changes selections for equal seeds. 4096 candidates give each task tens of microseconds of work,
/// large enough that per-task overhead disappears against the scans.
const PARALLEL_CHUNK: usize = 4096;

/// Selects at most the configured capacity, honoring minimums and retention.
///
/// `candidates` arrive in strictly ascending row order; `rng` seeds the priority streams. The
/// selection satisfies every subgroup minimum, then retains prior landmarks up to `ceil(capacity *
/// retained_fraction)` when enough are on offer, then fills to capacity, all by ascending
/// exponential-clock priority.
///
/// # Errors
///
/// Returns an error for an empty corpus, unordered candidate rows, duplicate minimums, or minimums
/// the corpus or capacity cannot satisfy.
pub(crate) fn select_landmarks<R>(
    candidates: &[LandmarkCandidate],
    minimums: &[SubgroupMinimum],
    options: SelectionOptions,
    mut rng: R,
) -> Result<LandmarkSelection, SelectionError>
where
    R: Rng + SeedableRng,
{
    validate(candidates, minimums)?;

    let capacity = (options.maximum_count.get() as usize).min(candidates.len());
    let priorities = priorities::<R>(candidates, &mut rng);

    let mut selected = BitSet::new(candidates.len());
    let mut selected_count = 0_usize;
    let mut retained_count = 0_usize;

    let mut ordered_minimums = minimums.to_vec();
    ordered_minimums.sort_unstable_by_key(|minimum| minimum.subgroup);
    // Rows selected for earlier minimums count toward later ones: a
    // row satisfies every subgroup it belongs to. The counters advance
    // at mark time instead of rescanning the corpus per minimum.
    let mut subgroup_counts = vec![0_usize; ordered_minimums.len()];

    for position in 0..ordered_minimums.len() {
        let minimum = ordered_minimums[position];
        let required = minimum
            .count
            .get()
            .saturating_sub(subgroup_counts[position]);
        if selected_count + required > capacity {
            return Err(SelectionError::MinimumExceedsCapacity {
                requested: selected_count + required,
                capacity,
            });
        }

        let chosen = best_indices(candidates, &priorities, &selected, required, |candidate| {
            candidate.belongs_to(minimum.subgroup)
        });
        if chosen.len() != required {
            return Err(SelectionError::InsufficientSubgroup {
                subgroup: minimum.subgroup,
                required: minimum.count.get(),
                available: subgroup_counts[position] + chosen.len(),
            });
        }

        for &index in &chosen {
            for (count, later) in subgroup_counts
                .iter_mut()
                .zip(&ordered_minimums)
                .skip(position + 1)
            {
                if candidates[index].belongs_to(later.subgroup) {
                    *count += 1;
                }
            }
        }
        retained_count += mark(&mut selected, candidates, &chosen);
        selected_count += required;
    }

    let retained_target = retained_target(capacity, options.retained_fraction);
    let retained_needed = retained_target
        .saturating_sub(retained_count)
        .min(capacity - selected_count);
    let retained = best_indices(
        candidates,
        &priorities,
        &selected,
        retained_needed,
        |candidate| candidate.prior_landmark,
    );
    selected_count += retained.len();
    retained_count += mark(&mut selected, candidates, &retained);

    let fill = best_indices(
        candidates,
        &priorities,
        &selected,
        capacity - selected_count,
        |_| true,
    );
    retained_count += mark(&mut selected, candidates, &fill);

    let rows: Vec<NodeRowId> = selected.iter().map(|index| candidates[index].row).collect();

    Ok(LandmarkSelection {
        rows: rows.into_boxed_slice(),
        retained_count,
    })
}

/// Draws every candidate's exponential-clock priority, in parallel.
///
/// One generator serves each [`PARALLEL_CHUNK`] of candidates, seeded from the caller's generator
/// in chunk order.
fn priorities<R>(candidates: &[LandmarkCandidate], rng: &mut R) -> Vec<f64>
where
    R: Rng + SeedableRng,
{
    let seeds: Vec<u64> = core::iter::repeat_with(|| rng.random())
        .take(candidates.len().div_ceil(PARALLEL_CHUNK))
        .collect();

    let mut priorities = vec![0.0_f64; candidates.len()];
    priorities
        .par_chunks_mut(PARALLEL_CHUNK)
        .zip(candidates.par_chunks(PARALLEL_CHUNK))
        .zip(seeds)
        .for_each(|((priorities, candidates), seed)| {
            let mut rng = R::seed_from_u64(seed);
            for (priority, candidate) in priorities.iter_mut().zip(candidates) {
                // 1 - U maps the generator's [0, 1) onto (0, 1],
                // keeping the logarithm finite.
                *priority = -(1.0 - rng.random::<f64>()).ln() / candidate.sampling_weight.get();
            }
        });

    priorities
}

fn validate(
    candidates: &[LandmarkCandidate],
    minimums: &[SubgroupMinimum],
) -> Result<(), SelectionError> {
    if candidates.is_empty() {
        return Err(SelectionError::EmptyCorpus);
    }

    if let Some(position) = candidates
        .par_windows(2)
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

/// Returns `ceil(capacity * retained_fraction)`.
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
/// Only candidates satisfying `predicate` qualify; fewer return when the pool is smaller.
///
/// Workers fold thread-local heaps of the `count` best candidates and the heaps merge pairwise: the
/// result is the unique best set under the (priority, index) total order, independent of how the
/// scan splits across threads.
fn best_indices(
    candidates: &[LandmarkCandidate],
    priorities: &[f64],
    selected: &BitSet,
    count: usize,
    predicate: impl Fn(LandmarkCandidate) -> bool + Sync,
) -> Vec<usize> {
    if count == 0 {
        return Vec::new();
    }

    candidates
        .par_iter()
        .enumerate()
        .with_min_len(PARALLEL_CHUNK)
        .fold(BinaryHeap::new, |mut heap, (index, &candidate)| {
            if !selected.contains(index) && predicate(candidate) {
                push_bounded(
                    &mut heap,
                    RankedCandidate {
                        priority: priorities[index],
                        index,
                    },
                    count,
                );
            }
            heap
        })
        .reduce(BinaryHeap::new, |mut merged, heap| {
            for ranked in heap {
                push_bounded(&mut merged, ranked, count);
            }
            merged
        })
        .into_iter()
        .map(|ranked| ranked.index)
        .collect()
}

/// Pushes into a max-heap keeping only the `bound` smallest entries.
fn push_bounded(heap: &mut BinaryHeap<RankedCandidate>, ranked: RankedCandidate, bound: usize) {
    if heap.len() < bound {
        heap.push(ranked);
        return;
    }

    if heap.peek().is_some_and(|worst| ranked < *worst) {
        heap.pop();
        heap.push(ranked);
    }
}

/// Inserts the chosen indices and returns how many carried the prior landmark flag.
fn mark(selected: &mut BitSet, candidates: &[LandmarkCandidate], indices: &[usize]) -> usize {
    let mut retained = 0;
    for &index in indices {
        selected.insert(index);
        if candidates[index].prior_landmark {
            retained += 1;
        }
    }

    retained
}

/// A candidate ordered by ascending priority, ties by candidate index.
#[derive(Debug, Copy, Clone)]
struct RankedCandidate {
    priority: f64,
    index: usize,
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
            .then_with(|| self.index.cmp(&other.index))
    }
}
