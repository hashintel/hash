//! Weighted stratified landmark selection.
//!
//! For candidate `i`, let wᵢ > 0 be its sampling weight and Uᵢ a uniform draw in (0, 1]. The
//! exponential-clock model assigns tᵢ = −ln(Uᵢ) / wᵢ and selects the smallest priorities without
//! replacement. In continuous arithmetic each clock has rate wᵢ. The implementation uses discrete
//! `f64` draws and rounded logarithms and division. Extreme weights can overflow priorities to
//! infinity or underflow them to zero. Candidate index breaks every priority tie.
//!
//! One shared priority set serves the subgroup minimums, prior-landmark retention, and the free
//! fill. Minimums run in [`Subgroup`] order. Earlier selections count toward every later subgroup
//! they belong to, and later phases never evict them. Every successful selection therefore
//! satisfies all minimums. This greedy procedure can exhaust capacity even when another set could
//! satisfy overlapping minimums.
//!
//! Retention targets the ceiling of the computed f64 product C · f, with C = min(`maximum_count`,
//! candidate count) and f = `retained_fraction`. The u32 capacity limit keeps C exactly
//! representable in f64. Multiplication can round before the ceiling, giving a target different
//! from ceil(C · f) in real arithmetic. Prior rows already selected for minimums count toward the
//! target. Remaining capacity limits additional retention, and the free fill can select more prior
//! rows than the target.
//!
//! Priorities come from one seeded generator per fixed-size candidate chunk. Each phase collects
//! eligible candidates in parallel and selects the unique best set under the `(priority, index)`
//! total order. Equal candidates, options and generator streams select identical rows at any thread
//! count with the same floating-point behavior. The returned rows ascend by row id.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::{
    cmp::Ordering,
    error::Error,
    fmt,
    num::NonZero,
    ops::{Index, IndexMut},
};
use std::collections::HashSet;

use hashql_core::id::{Id, IdArray, IdSlice, IdVec, bit_vec::DenseBitSet};
use rand::{Rng, RngExt as _, SeedableRng};
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelIterator as _, ParallelIterator as _},
    slice::ParallelSlice as _,
};

use crate::math::{DPositive, UnitFraction};

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
    hashql_core::id::Id,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[id(const)]
#[repr(u8)]
pub(crate) enum SubgroupDimension {
    Density,
    Language,
    Source,
    EntityRole,
    TypeFamily,
    Community,
    TemporalCohort,
}

impl SubgroupDimension {
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
pub(crate) struct SubgroupAxes(
    IdArray<SubgroupDimension, u32, { SubgroupDimension::VARIANT_COUNT }>,
);

const impl Index<SubgroupDimension> for SubgroupAxes {
    type Output = u32;

    #[inline]
    fn index(&self, index: SubgroupDimension) -> &u32 {
        &self.0[index]
    }
}

const impl IndexMut<SubgroupDimension> for SubgroupAxes {
    #[inline]
    fn index_mut(&mut self, index: SubgroupDimension) -> &mut u32 {
        &mut self.0[index]
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

/// Selection metadata for one candidate node row.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LandmarkCandidate<N> {
    pub row: N,
    /// Relative sampling weight.
    ///
    /// Equal weights give equal priority distributions before subgroup and retention constraints.
    pub sampling_weight: DPositive,
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
    /// Set this explicitly, as it has no default. Selection returns at most this many rows, fewer only when the corpus is smaller. Every selection position fits the persisted [`LandmarkOrdinal`] encoding.
    pub maximum_count: NonZero<u32>,
    /// Target fraction of prior landmarks, 0.25 by default.
    ///
    /// Retention stabilizes generation-to-generation orientation.
    // The default is an unvalidated starting point; the temporal-drift
    // and landmark rank-correlation criteria revise it from evidence.
    pub retained_fraction: UnitFraction = const { UnitFraction::new(0.25).unwrap() },
    /// Candidates per generator stream: the priority pass's seeding and parallel work unit.
    ///
    /// By default, uses 4,096 candidates. This value fixes which stream draws for each candidate. Equal-seed replay requires the same chunk size.
    pub parallel_chunk: NonZero<usize> = PARALLEL_CHUNK,
}

hashql_core::id::newtype! {
    /// A reference to a landmark by its position in a [`LandmarkSelection`].
    ///
    /// Ordinals are dense and zero-based: each value is the position of a selected row in ascending row order. Its little-endian bytes are also its persisted representation.
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
    /// `map` must preserve strictly ascending row order. Ordinal `i` continues to name the `i`-th
    /// selected row, preserving assignments and coordinates indexed by those ordinals.
    ///
    /// # Panics
    ///
    /// This panics when the mapped rows decrease.
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

/// A malformed input or a constraint the greedy selection cannot satisfy.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SelectionError {
    /// The corpus offers no candidates.
    EmptyCorpus,
    /// Candidate rows are not strictly ascending.
    UnorderedCandidates { index: usize },
    /// A subgroup carries more than one minimum.
    DuplicateMinimum { subgroup: Subgroup },
    /// Earlier picks plus the next minimum's unmet count exceed the capacity.
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
        priorities.par_chunks_mut(chunk),
        candidates.par_chunks(chunk),
        seeds.into_par_iter(),
    )
        .into_par_iter()
        .for_each(|(priorities, candidates, seed)| {
            let mut rng = R::seed_from_u64(seed);

            for (priority, candidate) in priorities.iter_mut().zip(candidates) {
                // 1 − U maps the generator's [0, 1) onto (0, 1], keeping the logarithm finite.
                // Division by an extreme weight can still overflow.
                *priority = -(1.0 - rng.random::<f64>()).ln() / candidate.sampling_weight;
            }
        });

    priorities
}

/// Checks the selection inputs before any sampling.
///
/// # Errors
///
/// Returns [`SelectionError`] for empty or unordered candidates or duplicate minimums, checked in
/// that order. An ordering error names the first row that does not exceed its predecessor.
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

/// Returns the ceiling of the computed f64 retention product.
///
/// A capacity at most `u32::MAX` converts exactly to f64. The product with `retained_fraction` can
/// still round before ceil. The result converts to usize with saturation.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    reason = "the product of a bounded capacity and a unit-interval fraction is a small \
              non-negative integer count"
)]
#[inline]
const fn retained_target(capacity: usize, retained_fraction: UnitFraction) -> usize {
    (capacity as f64 * retained_fraction).ceil() as usize
}

/// Replaces `output` with up to `count` smallest-priority unselected candidate indices.
///
/// Only candidates satisfying `predicate` qualify. Output order is unspecified, but the selected
/// set is unique under the `(priority, index)` total order, independent of how the parallel scan
/// splits.
///
/// # Panics
///
/// For a nonzero `count`, this panics when `selected` does not cover the candidate domain or an
/// eligible candidate has no entry in `priorities`.
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
        .par_iter_enumerated()
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

/// Marks the chosen indices and counts their prior-landmark flags.
///
/// # Panics
///
/// This panics when an index lies outside `candidates` or the selected-set domain.
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
/// A 4,096-candidate chunk amortizes task setup across a block of candidates. Its size is part of
/// the seeded selection's replay inputs.
pub(crate) const PARALLEL_CHUNK: NonZero<usize> = const { NonZero::new(4096).unwrap() };

/// Selects weighted landmark rows subject to greedy minimums and a retention target.
///
/// `candidates` must have strictly ascending row ids. On success, the selection satisfies every
/// subgroup minimum and fills min(`maximum_count`, candidate count) positions. Minimums take
/// precedence over retention, as described in the [selection model](super::select).
///
/// # Complexity
///
/// Every minimum, the retention phase and the free fill scan the candidate domain. Priorities and
/// eligible-candidate storage require O(N) space for N candidates, even when the selected capacity
/// is small. Updating overlapping minimum counts additionally visits later minimums for each pick.
///
/// # Errors
///
/// Returns [`SelectionError`] for malformed inputs or a minimum that the greedy procedure cannot
/// satisfy. Capacity failure describes the current picks, not global infeasibility.
#[tracing::instrument(skip_all)]
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
