//! The persisted paired-movement evidence body and its aggregation.
//!
//! [`PairedMovementEvidence`] is the block the metadata document embeds beside the rung
//! measurements: the draw metadata a replay re-derives, then a tri-state outcome. A
//! [`MovementOutcome::Measured`] body carries the aggregate families, and the other two
//! structurally cannot. [`MovementOutcome::Vacuous`] records an empty pair domain, while
//! [`MovementOutcome::Failed`] retains a typed refusal beside the completed draw counts. Every
//! aggregate family sits beside its population count, and its value fields exist exactly when
//! that count is positive, so neither an empty population nor an empty stratum can read as a
//! measured zero. The body holds no pair or row identity, and its size is a function of the
//! quantile grid and the strata alone.
//!
//! Aggregation forms each per-pair difference from one reading's own fields in `f64` and never
//! subtracts rung aggregates. Means commute with subtraction while fractions and quantiles do
//! not, so the shortcut would fabricate readings no pair produced. Quantiles follow the nearest
//! rank, and every accumulating sum is one serial `f64` fold in draw order, so one draw
//! reproduces its aggregates bit for bit.
//!
//! The collateral strata stand on the candidate population. Every nonparticipant row's
//! anchor-distance reading defines the ten boundaries, so the strata are a function of the
//! census rather than the draw, and each stratum's candidate and selected counts read how the
//! draw spread across the census.

#[cfg(test)]
mod tests;

use super::{
    census::CensusError,
    identity::{DrawSalt, RuleIdentity},
    movement::{ControlMovement, MovementError, PairMovement},
};
use crate::{
    identity::NodeRowId,
    math::{DFinite, DNonNegative, NonFinitePoint, UnitFraction},
};

/// The collateral stratum count.
const DECILES: u32 = 10;

/// The paired-movement evidence body of one ladder record.
///
/// The body persists no pair or row identity. A corpus holder re-derives the selected
/// identities by recognizing the rule, re-deriving the salt, and rerunning the keyed order, so
/// the omission limits the payload rather than claiming secrecy. The outcome
/// flattens beside these fields under its `outcome` tag.
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
    /// The drawn pair count `n`, the candidates bounded by the pair-sample cap
    /// ([`SAMPLE_CAP`](super::census::SAMPLE_CAP)).
    pub pairs_selected: u64,
    /// The nonparticipant corpus row count `Q`.
    pub control_candidates: u64,
    /// The drawn control count `m = min(Q, n)`.
    pub controls_selected: u64,
    /// What the readout resolved to.
    #[serde(flatten)]
    pub outcome: MovementOutcome<I>,
}

/// What one paired-movement readout resolved to.
///
/// The variants are structural. Aggregates exist only inside [`Self::Measured`], so a vacuous
/// or failed readout cannot carry a partial family, and the tag alone tells a reader the whole
/// shape.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case", tag = "outcome")]
pub(crate) enum MovementOutcome<I> {
    /// A completed nonempty pair measurement.
    Measured {
        /// The aggregate families over the drawn pairs.
        pairs: PairAggregates,
        /// The collateral strata over the drawn controls.
        ///
        /// A nonempty candidate population yields every stratum, individually empty when the
        /// draw is thin. No strata at all under the `Q = 0` reading, which keeps every
        /// control count zero and every control value field absent.
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
/// Each difference forms per pair from one [`PairMovement`]'s own fields. A negative distance
/// change contracts, and a negative rank change improves rank, so the fractions read the share
/// of pairs the canonical rung moved toward their partners.
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
    /// Every difference forms directly from a reading's own fields in `f64`, never by
    /// subtracting persisted rung aggregates. Means commute with subtraction while fractions
    /// and quantiles do not, so the subtraction shortcut fabricates readings no pair produced.
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

            // The strict-less is a plain numeric comparison, because a subtraction never
            // produces `-0.0` under round-to-nearest, so the total order's `-0.0 < +0.0` case
            // is unreachable here.
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
/// The value fields of one aggregate family. The population count lives beside the family, on
/// [`PairAggregates::count`] for the pair families and on [`ControlDecile::selected`] for a
/// stratum's displacement family, and the family exists exactly when that count is positive.
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
    /// The mean folds the readings serially in the given order. The quantiles sort a copy
    /// ascending. The draw order breaks reading ties by stable identity, which keeps the sort
    /// total without ever moving a value across a rank, so the ascending value sequence alone
    /// reproduces every persisted quantile and the identities stay out of the aggregation.
    ///
    /// # Panics
    ///
    /// This panics when `readings` is empty. An aggregate family exists only for a positive
    /// population.
    pub(crate) fn over(readings: &[DFinite]) -> Self {
        assert!(
            !readings.is_empty(),
            "an aggregate family exists only for a positive population"
        );

        // One fixed serial fold in draw order. `Iterator::sum` happens to fold in order too,
        // but the loop states the contract rather than inheriting it.
        let mut sum = 0.0_f64;
        for &reading in readings {
            sum += reading.get();
        }
        #[expect(
            clippy::cast_precision_loss,
            reason = "reading populations stay far below exact f64 integer precision"
        )]
        // Finite with no check. Every reading is a frame distance difference or a rank
        // difference, bounded below 2¹³¹. The population is bounded by the corpus rows, below
        // 2³². The serial fold therefore stays below 2¹⁶³, far inside the `f64` exponent range.
        let mean = DFinite::new_unchecked(sum / readings.len() as f64);

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
/// The strata partition the anchor-distance axis at each tenth of the candidate population, so
/// the boundaries are a function of the census rather than the draw. The candidate count reads
/// the stratum's share of the census, and the selected count reads the stratum's share of the
/// draw.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ControlDecile {
    /// The stratum's upper anchor-distance boundary, the nearest-rank reading at its tenth of
    /// the candidate population.
    pub upper: DNonNegative,
    /// Candidate rows this stratum holds.
    pub candidates: u64,
    /// Drawn rows this stratum holds.
    pub selected: u64,
    /// The displacement family over the stratum's drawn rows, present exactly when `selected`
    /// is positive.
    pub displacement: Option<MovementAggregate>,
}

impl ControlDecile {
    /// Builds the ten collateral strata.
    ///
    /// `candidates` holds every nonparticipant row's zero-rung nearest-anchor distance and is
    /// sorted in place. `readings` holds the drawn controls' readings in draw order, and each
    /// drawn reading re-derives through the one metric, so it is one of the candidate readings.
    /// A reading joins the first stratum whose upper boundary reaches it. Equal readings
    /// therefore share a stratum, and a boundary tie leaves the later stratum without
    /// candidates.
    ///
    /// Returns no strata when the candidate population is empty. That is the `Q = 0`
    /// reading: every control count stays zero and every control value field stays absent.
    ///
    /// # Panics
    ///
    /// This panics when readings arrive while the candidate population is empty, or when a
    /// reading exceeds the census maximum. Both contradict the draw's own construction.
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

            // Candidates at or below the boundary, cumulatively. The tenth boundary is the
            // population maximum, so the final stratum absorbs the remainder.
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
/// Each variant mirrors its producer field for field, so the persisted reason names exactly
/// what refused. [`CensusError`] supplies the index contradictions and [`MovementError`] the
/// frame refusals.
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
    /// The rung frames disagree on the corpus row count.
    FrameRows {
        /// The zero-condition frame's row count.
        zero: u64,
        /// The canonical frame's row count.
        canonical: u64,
    },
    /// A rung frame has a point with a NaN or infinite component.
    NonFinitePoint {
        /// The refusing frame's rung.
        rung: Rung,
        /// The first row whose point is non-finite.
        row: I,
    },
}

impl<I> FailureReason<I> {
    /// Translates one rung frame's index refusal.
    fn frame(rung: Rung, error: NonFinitePoint<I>) -> Self {
        Self::NonFinitePoint {
            rung,
            row: error.id,
        }
    }
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
            MovementError::Zero(error) => Self::frame(Rung::Zero, error),
            MovementError::Canonical(error) => Self::frame(Rung::Canonical, error),
        }
    }
}

/// The rung frame a failure names.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Rung {
    /// The zero-condition frame.
    Zero,
    /// The canonical frame.
    Canonical,
}

/// Reads the nearest-rank quantile at `fraction` over ascending readings.
///
/// The reading is the first whose cumulative unit count reaches `fraction` of the population.
/// With population `N`, that is the reading at one-based rank `⌈fraction · N⌉`, evaluated in
/// `f64` so every replay computes the same rank.
///
/// # Panics
///
/// This panics when `sorted` is empty. An aggregate family exists only for a positive
/// population.
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
