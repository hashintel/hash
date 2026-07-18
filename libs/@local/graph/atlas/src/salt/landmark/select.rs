//! Weighted stratified landmark selection.
//!
//! Selection is weighted sampling without replacement by exponential
//! clocks: candidate `i` receives the priority
//!
//! ```text
//! t_i = -ln(U_i) / w_i,
//! ```
//!
//! `U_i` drawn uniformly from `(0, 1]` and `w_i` the candidate's
//! sampling weight, and the smallest priorities win. Selection runs in
//! three phases over one shared set of priorities: subgroup minimums
//! first, then prior landmarks up to the retained target, then a free
//! fill to capacity. Later phases never evict earlier picks, so every
//! minimum still holds in the final selection.
//!
//! Priorities come from the caller's seeded generator in candidate
//! order, so a rerun over equal candidates with an equally seeded
//! generator selects identical rows.
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

use rand::{Rng, RngExt as _};
use zerocopy::{LE, U32};

use crate::dataset::NodeRowId;

/// A landmark-stratification axis.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
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

/// Categorical values on every stratification axis, indexed by
/// [`SubgroupDimension`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
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

/// Selection metadata for one candidate node row.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LandmarkCandidate {
    pub row: NodeRowId,
    /// Relative selection propensity, finite and strictly positive.
    pub sampling_weight: f64,
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
    /// The landmark capacity `M`: at most this many rows are selected,
    /// fewer only when the corpus is smaller. The `u32` width is the
    /// [`LandmarkOrdinal`] encoding's contract: every selection
    /// position fits the persisted ordinal form.
    pub maximum_count: NonZero<u32>,
    /// Fraction of the capacity reserved for prior landmarks when
    /// enough are on offer, in `[0, 1]`. Retention stabilizes
    /// generation-to-generation orientation. Defaults to 0.25.
    // The default is an unvalidated starting point (legacy required
    // the value as config, setting no precedent); the temporal-drift
    // and landmark rank-correlation gates revise it from evidence.
    pub retained_fraction: f64 = 0.25,
}

/// A reference to a landmark by its position in a [`LandmarkSelection`].
///
/// Ordinals are dense and zero-based: the value is the position of the
/// landmark's node row in the selection's ascending row order. The
/// little-endian representation is the persisted form, so a column of
/// these ordinals is written to and read from artifact files without
/// conversion.
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

    /// Returns the ordinal of a selected row, or `None` when the row
    /// is not a landmark.
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
    /// The retained fraction lies outside `[0, 1]`.
    InvalidRetainedFraction { value: f64 },
    /// A sampling weight is not finite and strictly positive.
    InvalidSamplingWeight { index: usize, value: f64 },
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
            Self::InvalidRetainedFraction { value } => {
                write!(fmt, "the retained fraction {value} lies outside [0, 1]")
            }
            Self::InvalidSamplingWeight { index, value } => write!(
                fmt,
                "candidate {index} carries the sampling weight {value}, which is not finite and \
                 strictly positive",
            ),
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

/// Selects at most the configured capacity, honoring minimums and
/// retention.
///
/// `candidates` arrive in strictly ascending row order; `rng` drives
/// the priorities. The selection satisfies every subgroup minimum,
/// then retains prior landmarks up to
/// `ceil(capacity * retained_fraction)` when enough are on offer, then
/// fills to capacity, all by ascending exponential-clock priority.
///
/// # Errors
///
/// Returns an error for an empty corpus, unordered candidate rows, a
/// non-positive or non-finite sampling weight, a retained fraction
/// outside `[0, 1]`, duplicate minimums, or minimums the corpus or
/// capacity cannot satisfy.
pub(crate) fn select_landmarks(
    candidates: &[LandmarkCandidate],
    minimums: &[SubgroupMinimum],
    options: SelectionOptions,
    mut rng: impl Rng,
) -> Result<LandmarkSelection, SelectionError> {
    validate(candidates, minimums, options)?;

    let capacity = (options.maximum_count.get() as usize).min(candidates.len());
    let priorities: Vec<f64> = candidates
        .iter()
        .map(|candidate| {
            // 1 - U maps the generator's [0, 1) onto (0, 1], keeping
            // the logarithm finite.
            -(1.0 - rng.random::<f64>()).ln() / candidate.sampling_weight
        })
        .collect();

    let mut selected = vec![false; candidates.len()];
    let mut selected_count = 0;

    let mut ordered_minimums = minimums.to_vec();
    ordered_minimums.sort_unstable_by_key(|minimum| minimum.subgroup);
    for minimum in ordered_minimums {
        // Rows selected for earlier minimums count toward this one: a
        // row satisfies every subgroup it belongs to.
        let already_selected = candidates
            .iter()
            .zip(&selected)
            .filter(|&(candidate, &is_selected)| {
                is_selected && candidate.belongs_to(minimum.subgroup)
            })
            .count();
        let required = minimum.count.get().saturating_sub(already_selected);
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
                available: already_selected + chosen.len(),
            });
        }

        mark(&mut selected, &chosen);
        selected_count += required;
    }

    let retained_target = retained_target(capacity, options.retained_fraction);
    let retained_selected = candidates
        .iter()
        .zip(&selected)
        .filter(|&(candidate, &is_selected)| is_selected && candidate.prior_landmark)
        .count();
    let retained_needed = retained_target
        .saturating_sub(retained_selected)
        .min(capacity - selected_count);
    let retained = best_indices(
        candidates,
        &priorities,
        &selected,
        retained_needed,
        |candidate| candidate.prior_landmark,
    );
    selected_count += retained.len();
    mark(&mut selected, &retained);

    let fill = best_indices(
        candidates,
        &priorities,
        &selected,
        capacity - selected_count,
        |_| true,
    );
    mark(&mut selected, &fill);

    let rows: Vec<NodeRowId> = candidates
        .iter()
        .zip(&selected)
        .filter_map(|(candidate, &is_selected)| is_selected.then_some(candidate.row))
        .collect();
    let retained_count = candidates
        .iter()
        .zip(&selected)
        .filter(|&(candidate, &is_selected)| is_selected && candidate.prior_landmark)
        .count();

    Ok(LandmarkSelection {
        rows: rows.into_boxed_slice(),
        retained_count,
    })
}

fn validate(
    candidates: &[LandmarkCandidate],
    minimums: &[SubgroupMinimum],
    options: SelectionOptions,
) -> Result<(), SelectionError> {
    if candidates.is_empty() {
        return Err(SelectionError::EmptyCorpus);
    }

    if !(options.retained_fraction.is_finite() && (0.0..=1.0).contains(&options.retained_fraction))
    {
        return Err(SelectionError::InvalidRetainedFraction {
            value: options.retained_fraction,
        });
    }

    for (index, candidate) in candidates.iter().enumerate() {
        if !candidate.sampling_weight.is_finite() || candidate.sampling_weight <= 0.0 {
            return Err(SelectionError::InvalidSamplingWeight {
                index,
                value: candidate.sampling_weight,
            });
        }

        if index > 0 && candidates[index - 1].row >= candidate.row {
            return Err(SelectionError::UnorderedCandidates { index });
        }
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
fn retained_target(capacity: usize, retained_fraction: f64) -> usize {
    (capacity as f64 * retained_fraction).ceil() as usize
}

/// Returns the indices of the `count` smallest-priority unselected
/// candidates satisfying `predicate`, or fewer when the pool is
/// smaller.
fn best_indices(
    candidates: &[LandmarkCandidate],
    priorities: &[f64],
    selected: &[bool],
    count: usize,
    predicate: impl Fn(LandmarkCandidate) -> bool,
) -> Vec<usize> {
    if count == 0 {
        return Vec::new();
    }

    let mut heap = BinaryHeap::with_capacity(count);
    for (index, candidate) in candidates.iter().copied().enumerate() {
        if selected[index] || !predicate(candidate) {
            continue;
        }

        let ranked = RankedCandidate {
            priority: priorities[index],
            index,
        };
        if heap.len() < count {
            heap.push(ranked);
            continue;
        }

        if heap.peek().is_some_and(|worst| ranked < *worst) {
            heap.pop();
            heap.push(ranked);
        }
    }

    heap.into_iter().map(|ranked| ranked.index).collect()
}

#[inline]
fn mark(selected: &mut [bool], indices: &[usize]) {
    for &index in indices {
        selected[index] = true;
    }
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
