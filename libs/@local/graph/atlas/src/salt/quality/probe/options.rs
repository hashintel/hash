//! Sampling settings and corpus-size checks for a quality probe.

use alloc::borrow::Cow;
use core::num::NonZero;

use super::error::ProbeError;

// The neighbourhood sizes match the suite's measured evidence:
// whole-probe readings of 0.883, 0.890 and 0.893 at
// k = 15, 30 and 50, the representation baseline of one run over the
// 985,932-row development corpus (2,196,562 edges, 49 types, 1,024
// anchors and 4,096 comparisons at seed 0). Reading at
// those sizes compares against that record without interpolation.
// The record anchors the sizes and the scale, not any threshold: it
// is one generation under the landmark-baseline placement rather
// than the trained projector, and the default thresholds gate
// evidence presence rather than fidelity. The anchor and comparison
// defaults bound the canonical fetch (anchors + comparisons rows of
// 3,072 f32 components, ~53 MB) while keeping subgroup cells at a few
// dozen anchors and the sampled neighbourhoods well inside the
// aggregate's k ≤ m/2 domain.
const DEFAULT_ANCHORS: NonZero<usize> =
    NonZero::new(256).expect("the default anchor count is nonzero");
const DEFAULT_COMPARISONS: NonZero<usize> =
    NonZero::new(4096).expect("the default comparison count is nonzero");
const DEFAULT_NEIGHBOURHOODS: &[NonZero<usize>] = &[
    NonZero::new(15).expect("the default neighbourhood sizes are nonzero"),
    NonZero::new(30).expect("the default neighbourhood sizes are nonzero"),
    NonZero::new(50).expect("the default neighbourhood sizes are nonzero"),
];
const DEFAULT_HORIZON_FACTOR: NonZero<usize> =
    NonZero::new(2).expect("the default horizon factor is nonzero");
// 64 shared pairs over 256 anchors read 16,384 triplet verdicts, but
// the design crosses the samples rather than drawing them
// independently: one pair sample serves every anchor and one anchor
// sample serves every pair, so the
// mean's error does not shrink as 1/√16,384. The pair-driven variance
// component shrinks only with the 64 pairs, which bounds the standard
// error at 0.5/√64 = 0.0625 of agreement in the worst case - 16× the
// 0.5/√16,384 = 0.0039 that reading the triplet count as independent
// draws suggests. How much of the verdict variance is pair-driven is
// not measured.
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
