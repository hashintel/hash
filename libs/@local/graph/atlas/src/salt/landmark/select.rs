use core::{cmp::Ordering, fmt};
use std::{
    collections::{BinaryHeap, HashSet},
    num::NonZeroUsize,
};

use super::error::LandmarkError;
use crate::salt::{
    hash::{ContentHash, ContentHasher},
    identity::GenerationRowId,
};

/// A supported landmark-stratification axis.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub(crate) enum StratumDimension {
    Density = 0,
    Language = 1,
    Source = 2,
    EntityRole = 3,
    TypeFamily = 4,
    Community = 5,
    TemporalCohort = 6,
}

/// One categorical value on a landmark-stratification axis.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Stratum {
    pub dimension: StratumDimension,
    pub value: u32,
}

impl fmt::Display for Stratum {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?}:{}", self.dimension, self.value)
    }
}

/// A required minimum number of landmarks from one subgroup.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SubgroupMinimum {
    pub stratum: Stratum,
    pub count: NonZeroUsize,
}

/// Selection metadata for one generation row.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LandmarkCandidate {
    pub row: GenerationRowId,
    pub sampling_weight: f64,
    pub density: u32,
    pub language: u32,
    pub source: u32,
    pub entity_role: u32,
    pub type_family: u32,
    pub community: u32,
    pub temporal_cohort: u32,
    pub prior_landmark: bool,
}

impl LandmarkCandidate {
    #[inline]
    fn belongs_to(self, stratum: Stratum) -> bool {
        let value = match stratum.dimension {
            StratumDimension::Density => self.density,
            StratumDimension::Language => self.language,
            StratumDimension::Source => self.source,
            StratumDimension::EntityRole => self.entity_role,
            StratumDimension::TypeFamily => self.type_family,
            StratumDimension::Community => self.community,
            StratumDimension::TemporalCohort => self.temporal_cohort,
        };
        value == stratum.value
    }
}

/// Capacity, retention, and deterministic priority seed.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LandmarkConfig {
    pub maximum_count: NonZeroUsize,
    pub retained_fraction: f64,
    pub seed: u64,
}

/// Canonically ordered selected rows and reproducibility metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LandmarkSelection {
    rows: Box<[GenerationRowId]>,
    retained_count: usize,
    content_hash: ContentHash,
}

impl LandmarkSelection {
    /// Borrows selected rows in ascending generation-row order.
    #[must_use]
    #[inline]
    pub(crate) fn rows(&self) -> &[GenerationRowId] {
        &self.rows
    }

    /// Returns how many selected rows were prior landmarks.
    #[must_use]
    #[inline]
    pub(crate) const fn retained_count(&self) -> usize {
        self.retained_count
    }

    /// Returns the selected-row artifact identity.
    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

/// Selects at most the configured capacity while satisfying subgroup minimums.
///
/// Weighted priorities use `-ln(U) / weight`, where `U` is derived from a
/// versioned SHA-256 domain over the seed, row, and all categorical strata.
/// Selecting the smallest priorities is weighted sampling without replacement.
/// The algorithm keeps only `O(M)` heap entries beyond its corpus-sized
/// selection bitmap.
///
/// # Errors
///
/// This returns an error for an empty corpus, invalid weights or retention,
/// duplicate rows or minimums, impossible subgroup minimums, or minimums that
/// consume more than the bounded capacity.
pub(crate) fn select_landmarks(
    candidates: &[LandmarkCandidate],
    config: LandmarkConfig,
    minimums: &[SubgroupMinimum],
) -> Result<LandmarkSelection, LandmarkError> {
    validate(candidates, config, minimums)?;

    let capacity = config.maximum_count.get().min(candidates.len());
    let priorities = candidates
        .iter()
        .map(|candidate| priority(*candidate, config.seed))
        .collect::<Vec<_>>();
    let mut selected = vec![false; candidates.len()];
    let mut selected_count = 0;
    let mut ordered_minimums = minimums.to_vec();
    ordered_minimums.sort_unstable_by_key(|minimum| minimum.stratum);

    for minimum in ordered_minimums {
        let already_selected = candidates
            .iter()
            .zip(&selected)
            .filter(|(candidate, is_selected)| {
                **is_selected && candidate.belongs_to(minimum.stratum)
            })
            .count();
        let required = minimum.count.get().saturating_sub(already_selected);
        if selected_count + required > capacity {
            return Err(LandmarkError::MinimumExceedsCapacity {
                requested: selected_count + required,
                capacity,
            });
        }
        let chosen = best_indices(candidates, &priorities, &selected, required, |candidate| {
            candidate.belongs_to(minimum.stratum)
        });
        if chosen.len() != required {
            let available = already_selected + chosen.len();
            return Err(LandmarkError::InsufficientSubgroup {
                stratum: minimum.stratum,
                required: minimum.count.get(),
                available,
            });
        }
        mark_selected(&mut selected, chosen);
        selected_count += required;
    }

    let retained_target = retained_target(capacity, config.retained_fraction);
    let retained_selected = candidates
        .iter()
        .zip(&selected)
        .filter(|(candidate, is_selected)| **is_selected && candidate.prior_landmark)
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
    mark_selected(&mut selected, retained);

    let remaining = capacity - selected_count;
    let fill = best_indices(candidates, &priorities, &selected, remaining, |_| true);
    mark_selected(&mut selected, fill);

    let mut rows = candidates
        .iter()
        .zip(selected)
        .filter_map(|(candidate, selected)| selected.then_some(candidate.row))
        .collect::<Vec<_>>();
    rows.sort_unstable();
    let retained_count = candidates
        .iter()
        .filter(|candidate| candidate.prior_landmark && rows.binary_search(&candidate.row).is_ok())
        .count();
    let content_hash = selection_hash(&rows);
    Ok(LandmarkSelection {
        rows: rows.into_boxed_slice(),
        retained_count,
        content_hash,
    })
}

fn validate(
    candidates: &[LandmarkCandidate],
    config: LandmarkConfig,
    minimums: &[SubgroupMinimum],
) -> Result<(), LandmarkError> {
    if candidates.is_empty() {
        return Err(LandmarkError::EmptyCorpus);
    }
    if !config.retained_fraction.is_finite()
        || config.retained_fraction.is_sign_negative()
        || config.retained_fraction > 1.0
    {
        return Err(LandmarkError::InvalidRetainedFraction {
            value: config.retained_fraction,
        });
    }
    let mut rows = HashSet::with_capacity(candidates.len());
    for (index, candidate) in candidates.iter().enumerate() {
        if !candidate.sampling_weight.is_finite() || candidate.sampling_weight <= 0.0 {
            return Err(LandmarkError::InvalidSamplingWeight {
                index,
                value: candidate.sampling_weight,
            });
        }
        if !rows.insert(candidate.row) {
            return Err(LandmarkError::DuplicateRow {
                row: candidate.row.as_u32(),
            });
        }
    }
    let mut strata = HashSet::with_capacity(minimums.len());
    for minimum in minimums {
        if !strata.insert(minimum.stratum) {
            return Err(LandmarkError::DuplicateMinimum {
                stratum: minimum.stratum,
            });
        }
    }
    Ok(())
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    reason = "the bounded capacity target is an integer count"
)]
#[inline]
fn retained_target(capacity: usize, retained_fraction: f64) -> usize {
    (capacity as f64 * retained_fraction).ceil() as usize
}

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
            row: candidate.row,
            index,
        };
        if heap.len() < count {
            heap.push(ranked);
        } else if heap.peek().is_some_and(|worst| ranked < *worst) {
            heap.pop();
            heap.push(ranked);
        }
    }
    heap.into_iter().map(|ranked| ranked.index).collect()
}

#[inline]
fn mark_selected(selected: &mut [bool], indices: Vec<usize>) {
    for index in indices {
        selected[index] = true;
    }
}

#[expect(
    clippy::cast_precision_loss,
    reason = "53 random hash bits map exactly into the f64 unit interval"
)]
fn priority(candidate: LandmarkCandidate, seed: u64) -> f64 {
    let mut hasher = ContentHasher::new(b"salt-landmark-priority-v1");
    hasher.update(&seed.to_le_bytes());
    hasher.update(&candidate.row.as_u32().to_le_bytes());
    for value in [
        candidate.density,
        candidate.language,
        candidate.source,
        candidate.entity_role,
        candidate.type_family,
        candidate.community,
        candidate.temporal_cohort,
    ] {
        hasher.update(&value.to_le_bytes());
    }
    let digest = hasher.finish();
    let random_bits = u64::from_le_bytes(
        digest.as_bytes()[..8]
            .try_into()
            .expect("digest prefix is eight bytes"),
    ) >> 11;
    let unit = (random_bits as f64 + 1.0) / ((1_u64 << 53) as f64 + 1.0);
    -unit.ln() / candidate.sampling_weight
}

fn selection_hash(rows: &[GenerationRowId]) -> ContentHash {
    let mut hasher = ContentHasher::new(b"salt-landmark-selection-v1");
    for row in rows {
        hasher.update(&row.as_u32().to_le_bytes());
    }
    hasher.finish()
}

#[derive(Debug, Copy, Clone)]
struct RankedCandidate {
    priority: f64,
    row: GenerationRowId,
    index: usize,
}

impl PartialEq for RankedCandidate {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.priority.to_bits() == other.priority.to_bits() && self.row == other.row
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
            .then_with(|| self.row.cmp(&other.row))
    }
}
