//! Sampling settings and corpus-size checks for a quality probe.

use alloc::borrow::Cow;
use core::num::NonZero;

use super::error::ProbeError;
use crate::math::nz;

// recorded representation-baseline readings over the 985,932-row development corpus were 0.883,
// 0.890 and 0.893 at k = 15, 30 and 50 (2,196,562 edges, 49 types, 1,024 anchors, 4,096
// comparisons, seed 0). Keeping those sizes permits comparison without interpolation. That one
// landmark-baseline generation motivates the reporting scale, not fidelity thresholds. the defaults
// request (256 + 4,096) · 3,072 f32 canonical components, about 53.5 MB of payload, with k well
// inside the aggregate's k ≤ m/2 domain. The uniform anchor sample supplies no minimum count for
// any subgroup.
/// The default anchor sample size.
const DEFAULT_ANCHORS: NonZero<usize> = nz!(256);
/// The default size of the shared comparison universe.
const DEFAULT_COMPARISONS: NonZero<usize> = nz!(4096);
/// The default neighbourhood sizes, in reporting order.
const DEFAULT_NEIGHBOURHOODS: &[NonZero<usize>] = &[nz!(15), nz!(30), nz!(50)];
/// The default horizon multiplier of the intrusion and extrusion readings.
const DEFAULT_HORIZON_FACTOR: NonZero<usize> = nz!(2);
// The pair draws are independent conditional on fixed anchors and comparison rows, but all anchors
// reuse each pair. Averaging one pair's verdicts across anchors gives a value in [0, 1] with
// variance at most 1/4. Therefore averaging 64 independent pair means has conditional standard
// error at most 0.5/√64 = 0.0625, not the 0.5/√16,384 = 0.00390625 bound for 256 · 64 independent
// verdicts. This bounds the pair-sampling contribution, not the additional uncertainty from anchor
// and comparison sampling.
/// The default shared triplet-pair sample size.
const DEFAULT_TRIPLET_PAIRS: usize = 64;

/// Sampling and neighbourhood settings for one probe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProbeOptions {
    /// Sampled anchor rows: the queries every reading aggregates over.
    ///
    /// Uses 256 by default.
    pub anchors: NonZero<usize> = DEFAULT_ANCHORS,
    /// Sampled comparison rows: the shared universe the sampled pass ranks.
    ///
    /// Uses 4,096 by default. More rows measure finer neighbourhood scales at the same k and grow the canonical fetch linearly.
    pub comparisons: NonZero<usize> = DEFAULT_COMPARISONS,
    /// Neighbourhood sizes to read at, in reporting order.
    ///
    /// Uses `[15, 30, 50]` by default. The list must name at least one size, each at most half both comparison universes. Recall rising with k can suggest near-boundary reshuffling, but the trend alone does not identify its cause.
    pub neighbourhoods: Cow<'static, [NonZero<usize>]> = Cow::Borrowed(DEFAULT_NEIGHBOURHOODS),
    /// Horizon multiplier for the intrusion and extrusion readings.
    ///
    /// Uses 2 by default. A false neighbour counts as an intrusion or extrusion when its one-based opposite-space rank exceeds min(factor · k, universe), distinguishing distant ranks from swaps near the neighbourhood boundary.
    pub horizon_factor: NonZero<usize> = DEFAULT_HORIZON_FACTOR,
    /// Comparison-point pairs sampled for the triplet readings.
    ///
    /// Uses 64 by default. Each pair contains distinct comparison points, but pairs sample with replacement. Every anchor evaluates the same pairs. Conditional on the selected anchors and comparison rows, their mean is unbiased for agreement over all ordered pairs. The anchor-times-pair total is not a count of independent observations.
    ///
    /// Zero disables triplet sampling. The resulting report cannot pass admission because the triplet control requires observed triplets.
    pub triplet_pairs: usize = DEFAULT_TRIPLET_PAIRS,
}

const impl Default for ProbeOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Checks the probe design fits the corpus.
///
/// Checks the u32 row domain, a nonempty neighbourhood list and room for disjoint samples.
///
/// `anchors + comparisons` must fit usize. Neighbourhood shapes and aggregate arithmetic capacity
/// are separate conditions.
///
/// # Errors
///
/// Returns [`ProbeError`] for an oversized row domain, an empty neighbourhood list or insufficient
/// corpus rows, in that order.
///
/// # Panics
///
/// Panics on an overflowing anchor-plus-comparison count when integer overflow checks are enabled.
pub(super) fn validate_design<E>(rows: usize, options: &ProbeOptions) -> Result<(), ProbeError<E>> {
    // the corpus row count bounds sampled row positions and ranks narrowed to u32
    if u32::try_from(rows).is_err() {
        return Err(ProbeError::RowsExceedProbeDomain { rows });
    }
    if options.neighbourhoods.is_empty() {
        return Err(ProbeError::NoNeighbourhoods);
    }

    let anchors = options.anchors.get();
    let comparisons = options.comparisons.get();
    if rows < anchors + comparisons {
        return Err(ProbeError::Design {
            rows,
            anchors,
            comparisons,
        });
    }

    Ok(())
}
