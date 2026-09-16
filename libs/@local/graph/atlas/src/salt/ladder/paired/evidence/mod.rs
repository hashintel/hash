//! Persisted paired-movement outcomes and distribution summaries.
//!
//! [`PairedMovementEvidence`] records draw metadata beside an outcome.
//! [`MovementOutcome::Measured`] carries aggregate families. [`MovementOutcome::Vacuous`] records
//! an empty pair domain, and [`MovementOutcome::Failed`] retains a typed refusal with any completed
//! draw counts. Successful bodies omit selected identities. An endpoint failure can name a rejected
//! row. Produced bodies have a fixed quantile grid and at most ten strata.
//!
//! Aggregation forms every per-pair difference in `f64` and never subtracts step aggregates. For
//! pair i, Δdᵢ = dᵢ,canonical − dᵢ,zero and Δrᵢ = rankᵢ,canonical − rankᵢ,zero. Negative
//! differences indicate contraction or rank improvement. Fractions count strict negatives, and
//! nearest-rank quantiles summarize the difference populations. Means commute with subtraction in
//! real arithmetic, but separate rounded folds can differ. Quantiles and contraction fractions
//! require the paired readings themselves.
//!
//! Every accumulating sum uses a serial `f64` fold in draw order. Equal ordered readings reproduce
//! the same aggregates under the same arithmetic semantics. This does not establish equal upstream
//! frames or cross-platform square-root results.
//!
//! Collateral strata use all nonparticipants' distances to the sampled pair endpoints. Their
//! boundaries depend on the pair sample but not on which controls were selected. Candidate and
//! selected counts show the control sample's distribution across those boundaries. The producers
//! attach a displacement family exactly when a stratum has selected rows. These relationships are
//! not validated by deserialization.

#[cfg(test)]
mod tests;

use core::num::NonZero;

use super::{
    census::CensusError,
    identity::{DrawSalt, RuleIdentity},
    movement::{ControlMovement, MovementError, PairMovement},
};
use crate::{
    identity::NodeRowId,
    math::{DFinite, DNonNegative, DPositive, UnitFraction},
};

/// The collateral stratum count.
const DECILES: u32 = 10;

/// The paired-movement evidence body of one ladder record.
///
/// A successful body omits selected pair and row identities. They can be re-derived from the same
/// metadata, attraction index and draw conventions. This limits payload size without providing
/// secrecy. An endpoint failure can include a rejected row.
///
/// The outcome flattens beside the draw metadata under its `outcome` tag. Public fields and derived
/// deserialization do not validate count relationships, rule recognition or consistency between an
/// outcome and its metadata.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PairedMovementEvidence<I> {
    /// The draw rule that produced the sample.
    pub rule: RuleIdentity,
    /// The salt the rule derived from the generation's declared inputs.
    pub salt: DrawSalt,
    /// The rank-readout window `k`.
    pub rank_window: u64,
    /// The distinct force-bearing Proximal pair count `P`.
    pub pair_candidates: u64,
    /// The number of drawn pairs.
    ///
    /// The readout bounds this count by [`SAMPLE_CAP`](super::census::SAMPLE_CAP).
    pub pairs_selected: u64,
    /// The nonparticipant corpus row count Q, or zero when no control census completed.
    pub control_candidates: u64,
    /// The drawn control count `m = min(Q, n)`.
    pub controls_selected: u64,
    /// What the readout resolved to.
    #[serde(flatten)]
    pub outcome: MovementOutcome<I>,
}

/// What one paired-movement readout resolved to.
///
/// Aggregate fields exist only inside [`Self::Measured`]. A vacuous or failed value cannot carry a
/// partial family. Construction and deserialization do not validate a measured value's counts or
/// stratum contents.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case", tag = "outcome")]
pub(crate) enum MovementOutcome<I> {
    /// A completed nonempty pair measurement.
    Measured {
        /// The aggregate families over the drawn pairs.
        pairs: PairAggregates,
        /// The collateral strata over the drawn controls.
        ///
        /// The producer emits ten strata for a nonempty control population, with individually
        /// empty strata allowed. At Q = 0 it emits no strata.
        deciles: Vec<ControlDecile>,
    },
    /// The pair domain was empty (`P = 0`).
    ///
    /// The recognized rule and derived salt persist beside zero candidate and selected counts.
    /// No control census ran and no aggregate family exists.
    Vacuous,
    /// A typed refusal from the census or the movement readout.
    ///
    /// The body retains the rule, the salt, and whatever draw counts completed, and carries no
    /// partial aggregate family. The generation still publishes when every check outside this
    /// readout passes.
    Failed {
        /// What refused.
        reason: FailureReason<I>,
    },
}

/// The aggregate families over the drawn pairs.
///
/// Each difference forms per pair from one [`PairMovement`]'s own fields. Negative distance changes
/// indicate contraction, and negative rank changes indicate rank improvement.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PairAggregates {
    /// The population count `n`, every drawn pair.
    pub count: u64,
    /// The family over the per-pair distance change `Δd = d_c − d_0`, in world units.
    pub distance: MovementAggregate,
    /// The family over the per-pair local-rank change `Δr = rank_c − rank_0`.
    pub rank: MovementAggregate,
    /// The fraction of pairs whose distance contracted (`Δd < 0`).
    pub contracting: UnitFraction,
    /// The fraction of pairs whose rank improved (`Δr < 0`).
    pub rank_improving: UnitFraction,
}

impl PairAggregates {
    /// Aggregates the drawn pairs' readings, in draw order.
    ///
    /// Every difference forms directly from a reading's fields, never by subtracting step
    /// aggregates. Distance differences use `f64`, and differences of the `u32` ranks are exactly
    /// representable in `f64`. The difference populations must meet [`MovementAggregate::over`]'s
    /// finite-partial-sum requirement.
    ///
    /// # Panics
    ///
    /// This panics when `readings` is empty. A measured outcome exists only for a nonempty
    /// draw.
    pub(super) fn over(readings: &[PairMovement]) -> Self {
        assert!(
            !readings.is_empty(),
            "a measured outcome exists only for a nonempty draw"
        );

        let mut contracted: u64 = 0;
        let mut improved: u64 = 0;
        let mut distances = Vec::with_capacity(readings.len());
        let mut ranks = Vec::with_capacity(readings.len());
        for reading in readings {
            let distance = reading.distance_canonical - reading.distance_zero;
            let rank =
                DFinite::from(i64::from(reading.rank_canonical) - i64::from(reading.rank_zero));

            // Non-negative operands have canonical positive zero. Their difference cannot underflow
            // to a negative zero under round-to-nearest, and equal operands give positive zero.
            // Therefore the total-order comparison with zero agrees with numeric strict negativity
            // for these differences.
            if distance < DFinite::ZERO {
                contracted += 1;
            }
            if rank < DFinite::ZERO {
                improved += 1;
            }

            distances.push(distance);
            ranks.push(rank);
        }

        let count = readings.len() as u64;
        Self {
            count,
            distance: MovementAggregate::over(&distances),
            rank: MovementAggregate::over(&ranks),
            contracting: UnitFraction::ratio(contracted, count).expect(
                "the loop counts each reading at most once, so the part is within its total",
            ),
            rank_improving: UnitFraction::ratio(improved, count).expect(
                "the loop counts each reading at most once, so the part is within its total",
            ),
        }
    }
}

/// One reading family's nearest-rank quantiles and mean.
///
/// For produced pair and control evidence, the associated count lives on [`PairAggregates::count`]
/// or [`ControlDecile::selected`]. Those producers create a family exactly when the count is
/// positive. This type carries no count and validates no cross-field relationships on
/// deserialization.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct MovementAggregate {
    /// The nearest-rank reading at fraction 0.05.
    pub q05: DFinite,
    /// The nearest-rank reading at fraction 0.25.
    pub q25: DFinite,
    /// The nearest-rank reading at fraction 0.5, the median.
    pub q50: DFinite,
    /// The nearest-rank reading at fraction 0.75.
    pub q75: DFinite,
    /// The nearest-rank reading at fraction 0.95.
    pub q95: DFinite,
    /// The mean, one serial `f64` fold in draw order.
    pub mean: DFinite,
}

impl MovementAggregate {
    /// Aggregates one reading family, in draw order.
    ///
    /// The mean folds in the supplied order. Every running partial sum must remain finite.
    /// Individual [`DFinite`] values alone do not establish this requirement. The quantiles sort a
    /// copy using [`DFinite`]'s total order, which distinguishes zero signs. Equal values need no
    /// identity tie-break because exchanging them leaves each quantile unchanged.
    ///
    /// # Complexity
    ///
    /// O(n log n) work and O(n) copied values for n readings.
    ///
    /// # Panics
    ///
    /// This panics when `readings` is empty. An aggregate family exists only for a positive
    /// population.
    pub(crate) fn over(readings: &[DFinite]) -> Self {
        let Some(len) = NonZero::new(readings.len()) else {
            panic!("an aggregate family exists only for a positive population");
        };

        // Finite f32 frame coordinates bound wide distance differences below 2¹³¹ in magnitude.
        // With fewer than 2⁶⁴ readings on supported targets, those populations keep even the
        // absolute sum below 2¹⁹⁵, far inside f64. Therefore the paired-frame readout can use the
        // finite sum directly. Other inputs must meet the documented partial-sum requirement.
        let mut sum = DFinite::ZERO;
        for &reading in readings {
            sum += reading;
        }

        // dividing a finite sum by a count of at least one preserves finiteness.
        let mean = (sum / DPositive::from_usize(len)).finish_unchecked();

        let mut sorted = readings.to_vec();
        sorted.sort_unstable();

        Self {
            q05: nearest_rank(&sorted, 0.05),
            q25: nearest_rank(&sorted, 0.25),
            q50: nearest_rank(&sorted, 0.5),
            q75: nearest_rank(&sorted, 0.75),
            q95: nearest_rank(&sorted, 0.95),
            mean,
        }
    }
}

/// One collateral stratum of the control readout.
///
/// The strata partition distances to the sampled pair endpoints at each tenth of the full
/// nonparticipant population. Their boundaries depend on the pair sample, but not on the selected
/// control rows. Counts record each stratum's share of the census and the control sample.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ControlDecile {
    /// The stratum's inclusive upper anchor-distance boundary.
    ///
    /// The nearest-rank reading at its tenth of the candidate population.
    pub upper: DNonNegative,
    /// Candidate rows this stratum holds.
    pub candidates: u64,
    /// Drawn rows this stratum holds.
    pub selected: u64,
    /// The displacement family, produced exactly when `selected` is positive.
    ///
    /// Absence serializes as `null`. Deserialization does not check its relationship to
    /// `selected`.
    pub displacement: Option<MovementAggregate>,
}

impl ControlDecile {
    /// Builds the ten collateral strata.
    ///
    /// `candidates` holds every nonparticipant row's zero-step nearest-anchor distance and is
    /// sorted in place. `readings` must hold sampled controls from that population in draw order,
    /// using the same anchor positions and distance metric. Displacements must meet
    /// [`MovementAggregate::over`]'s partial-sum requirement. Membership and uniqueness are not
    /// checked.
    ///
    /// A reading joins the first stratum whose upper boundary reaches it. Equal readings share a
    /// stratum, and repeated boundaries leave later strata without candidates.
    ///
    /// Returns no strata when the candidate population is empty. That is the `Q = 0`
    /// reading: every control count stays zero and every control value field stays absent.
    ///
    /// # Panics
    ///
    /// Panics when `readings` is nonempty but `candidates` is empty, or when a reading's anchor
    /// distance exceeds the candidate maximum.
    pub(super) fn over(candidates: &mut [DNonNegative], readings: &[ControlMovement]) -> Vec<Self> {
        if candidates.is_empty() {
            assert!(
                readings.is_empty(),
                "a control is only drawn from a nonempty candidate domain"
            );

            return Vec::new();
        }
        candidates.sort_unstable();

        let mut uppers = Vec::with_capacity(DECILES as usize);
        let mut census = Vec::with_capacity(DECILES as usize);
        let mut below = 0;
        for tenth in 1..=DECILES {
            let upper = nearest_rank(candidates, f64::from(tenth) / 10.0);

            // count candidates cumulatively through each boundary, with the tenth at the population
            // maximum.
            let cumulative = candidates.partition_point(|&reading| reading <= upper);
            uppers.push(upper);
            census.push((cumulative - below) as u64);
            below = cumulative;
        }

        let mut members: Vec<Vec<DFinite>> = vec![Vec::new(); DECILES as usize];
        for reading in readings {
            let stratum = uppers
                .iter()
                .position(|&upper| reading.anchor_distance <= upper)
                .expect("a drawn control is a candidate, so its reading is in the census range");
            members[stratum].push(DFinite::from(reading.displacement));
        }

        uppers
            .into_iter()
            .zip(census)
            .zip(members)
            .map(|((upper, in_census), displacements)| Self {
                upper,
                candidates: in_census,
                selected: displacements.len() as u64,
                displacement: (!displacements.is_empty())
                    .then(|| MovementAggregate::over(&displacements)),
            })
            .collect()
    }
}

/// The typed refusal a failed readout retains.
///
/// Each variant retains every field of its producer. [`CensusError`] supplies index contradictions
/// and [`MovementError`] supplies frame-length disagreement. Finiteness belongs to the input field
/// contract, with no failure variant here.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case", tag = "cause")]
pub(crate) enum FailureReason<I> {
    /// A group's edge range contradicts the index's edge region.
    GroupRange {
        /// The group's position in the group region.
        group: u64,
        /// The range's first edge position.
        start: u64,
        /// The range's one-past-last edge position.
        end: u64,
        /// The edge count the range must stay within.
        edges: u64,
    },
    /// An edge names an endpoint at or beyond the corpus row count.
    Endpoint {
        /// The edge's position in the edge region.
        edge: u64,
        /// The named row.
        row: I,
        /// The corpus row count.
        rows: u64,
    },
    /// The step frames disagree on the corpus row count.
    FrameRows {
        /// The zero-condition frame's row count.
        zero: u64,
        /// The canonical frame's row count.
        canonical: u64,
    },
}

impl<I> From<CensusError<I>> for FailureReason<I> {
    fn from(error: CensusError<I>) -> Self {
        match error {
            CensusError::GroupRange {
                group,
                start,
                end,
                edges,
            } => Self::GroupRange {
                group,
                start,
                end,
                edges,
            },
            CensusError::Endpoint { edge, row, rows } => Self::Endpoint { edge, row, rows },
        }
    }
}

impl From<MovementError> for FailureReason<NodeRowId> {
    fn from(error: MovementError) -> Self {
        match error {
            MovementError::Rows { zero, canonical } => Self::FrameRows {
                zero: zero as u64,
                canonical: canonical as u64,
            },
        }
    }
}

/// Reads the nearest-rank quantile at `fraction` over ascending readings.
///
/// `sorted` must be ascending and nonempty, and `fraction` must lie in (0,1]. The one-based rank is
/// ceil(fraction · N), with both the conversion of N and the product evaluated in `f64`. The
/// rounded product can select a different rank than exact rational arithmetic at a boundary.
///
/// # Panics
///
/// Panics when `sorted` is empty or the computed rank is zero or exceeds its length.
fn nearest_rank<T: Copy>(sorted: &[T], fraction: f64) -> T {
    debug_assert!(
        fraction > 0.0 && fraction <= 1.0,
        "a quantile fraction lies in (0, 1]"
    );

    #[expect(
        clippy::cast_precision_loss,
        reason = "reading populations stay far below exact f64 integer precision"
    )]
    let population = sorted.len() as f64;
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the rank is a positive product of a fraction with the population, so it never \
                  exceeds the population and never carries a sign"
    )]
    let rank = (fraction * population).ceil() as usize;
    sorted[rank - 1]
}
