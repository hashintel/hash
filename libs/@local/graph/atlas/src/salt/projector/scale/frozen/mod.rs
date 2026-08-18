//! The frozen ruler: per-pair contrast denominators declared once at the relation boundary.
//!
//! The contrast violation divides by `σ₀(e) = √((ρ₀(i)+ε)(ρ₀(j)+ε))`, and every input to that
//! expression is measured once on the zero-condition field at the relation-activation boundary
//! `K` - the recorded training step before which no relation gradient has flowed into any
//! parameter - then declared a constant of the estimand. The declaration is what makes the ruler
//! lawful where its two neighbours are not: a live ruler hands the optimizer its own unit of
//! account, and a detached copy of a live quantity lies about the derivative. A constant fixed at
//! the boundary does neither - no gradient exists through it because nothing live enters it, and
//! no pre-freeze channel exists because `K` precedes the first relation gradient by definition.
//!
//! Each `ρ₀` is the median 2D distance from a row to its nearest semantic neighbours - the same
//! reading as the live [`LocalScales`](super::LocalScales), taken once, over a neighbour index
//! set that freezes with the value. The set matters as much as the number: the per-row band
//! bounds every row's displacement from the boundary field, a median is 1-Lipschitz in the
//! uniform norm of its inputs, so the frozen `ρ₀` mis-states the live local scale by at most
//! twice the band - entry by entry, over the same index set. Re-selecting neighbours at
//! comparison time would compare medians over different sets and void the bound, so
//! [`FrozenRuler::live_scales`] reads the live field over the frozen sets and consumes no
//! neighbour table.
//!
//! `ε = ε_rel · s_ref` shifts coincident rows (`ρ₀ = 0`) off zero. The factored form is unit
//! covariance: `σ₀` must be homogeneous of degree one in world units, so the declared number
//! `ε_rel` is dimensionless and the units come from `s_ref`, the RMS spread of the boundary field
//! about its centroid - strictly positive on any publishable map, and indifferent to the
//! duplicate stratum that zeroes the median of `ρ₀`. The declared `ε_rel` must sit inside a
//! two-sided dimensionless window: at least `κ_ε · β_proj` when the replicate band exists, so the
//! duplicate stratum's response to band-legal movement stays bounded by `2/κ_ε` instead of
//! growing as `1/ε`; at most the declared quantile of the positive `ρ₀` over `s_ref`, so the
//! regularizer stays small against the corpus's own local-scale distribution. An empty window
//! says replicate noise is not small against that distribution, and no ruler regularization is
//! honest there - the freeze refuses rather than squeezes.
//!
//! Every freeze-time failure is one refusal class, [`InvalidRuler`]: a reference that cannot
//! exist, an undeclared or out-of-window `ε_rel`, a degenerate spread, and a value-domain
//! violation all mean the estimand's denominator does not exist, so no training starts. None of
//! them changes behaviour - there is no degraded mode.

#[cfg(test)]
mod tests;

mod refusal;

use hashql_core::id::{Id, IdMatrix, IdSlice, IdVec};
use rayon::{
    iter::{IntoParallelIterator as _, ParallelIterator as _},
    slice::ParallelSliceMut as _,
};

pub(crate) use self::refusal::InvalidRuler;
use super::{LOCAL_SCALE_NEIGHBOURS, NonFiniteScale, insert_nearest, sorted_median};
use crate::{
    math::{
        DNonNegative, DPositive, FinitePointField, NonNegative, Positive, PositiveUnitFraction,
        Vec2,
    },
    salt::knn::{construction::NeighbourSlot, table::KnnView},
};

/// The band-conditioned lower half of the `ε_rel` window.
///
/// Present when the replicate-band artifact exists. The lower test `ε_rel ≥ κ_ε · β_proj` binds
/// through it. Without a band artifact the lower test cannot bind, and the window keeps its upper
/// half and the representation checks alone.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RulerFloor {
    /// `κ_ε`: the dimensionless sensitivity constant. The duplicate stratum's response to
    /// band-legal zero-field movement is bounded by `2/κ_ε`, so this constant prices how much
    /// coincident-stratum sensitivity the objective tolerates. Its value is an open owner
    /// decision. Its role in the lower test is not.
    pub kappa_epsilon: Positive,
    /// `β_proj`: the dimensionless per-row projection radius, the band constraint's size in
    /// units of `s_ref`.
    pub projection_band: Positive,
}

/// The declared constants a ruler freeze validates.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RulerParameters {
    /// `ε_rel`: the dimensionless regularizer. Its value is an open owner decision inside the
    /// window. The window itself is fixed.
    pub epsilon_rel: Positive,
    /// The declared quantile defining the window's upper bound: `q⁺(ρ₀)` is the smallest
    /// positive local scale with at least this share of the positive scales at or below it.
    pub scale_quantile: PositiveUnitFraction,
    /// The window's lower half, present when the band artifact exists.
    pub floor: Option<RulerFloor>,
}

/// The frozen ruler: everything `σ₀` reads, measured at the boundary and constant thereafter.
#[derive(Debug, PartialEq)]
pub(crate) struct FrozenRuler<N> {
    /// `ρ₀` per row: the median 2D distance to the frozen neighbour set on the boundary field.
    scales: Box<IdSlice<N, NonNegative>>,
    /// `ρ₀ + ε` per row, precomputed at the freeze so the per-pair read is one product and one
    /// root. In the typed domain by the two representation checks: at least `ε`, and finite
    /// under the largest scale. The add happens once here instead of once per pair, with the
    /// same f32 arithmetic, so the precomputation is value-identical.
    shifted: Box<IdSlice<N, Positive>>,
    /// The frozen neighbour index sets hold one row of slots per node row, each set in
    /// ascending stored-distance order with ties in row order.
    neighbours: IdMatrix<N, NeighbourSlot, N>,
    /// `s_ref`: the boundary field's RMS spread about its centroid.
    reference_spread: Positive,
    /// `ε_rel` as declared.
    epsilon_rel: Positive,
    /// `ε = ε_rel · s_ref` in the working precision.
    epsilon: Positive,
}

impl<N> FrozenRuler<N>
where
    N: Id,
{
    /// Measures the ruler on the boundary field and validates every declared constant.
    ///
    /// The checks run in declaration order: local scales and their index sets over the
    /// zero-condition field, the reference spread, the window's upper bound from the positive
    /// scales, window emptiness and membership, then the two representation checks on the
    /// absolute epsilon. The first failed check is the refusal. Rows measure in parallel, and
    /// every reduction is bit-deterministic under any thread schedule: the results are declared
    /// constants persisted with the generation, so a replay must reproduce them exactly.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidRuler`] carrying the first failed check: a non-finite scale reading, a
    /// spread outside the positive f32 domain, no positive scale to read the window's upper
    /// bound from, an empty window, an out-of-window `ε_rel`, or an epsilon whose coincident or
    /// densest pair product leaves the value domain.
    ///
    /// The field covers the table's rows and the table stores at least one neighbour per row -
    /// wiring contracts checked in debug builds, since both artifacts come from one generation.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the declared constant lives in the working f32 precision; the domain check \
                  reads the narrowed value"
    )]
    pub(crate) fn freeze(
        zero_field: &FinitePointField<N>,
        knn: &KnnView<'_, N>,
        parameters: RulerParameters,
    ) -> Result<Self, InvalidRuler<N>> {
        debug_assert_eq!(
            zero_field.len(),
            knn.rows(),
            "the boundary field and the neighbour table should cover the same rows"
        );
        debug_assert!(
            knn.neighbours() > 0,
            "the neighbour table should store at least one neighbour per row"
        );

        let set_len = knn.neighbours().min(LOCAL_SCALE_NEIGHBOURS);

        let measurements: Vec<_> = (0..zero_field.len())
            .into_par_iter()
            .map(|row| freeze_row(zero_field, knn, N::from_usize(row), set_len))
            .collect();

        if let Some(row) = measurements
            .iter()
            .position(|&(scale, _)| !scale.is_finite())
        {
            return Err(InvalidRuler::NonFiniteScale {
                row: N::from_usize(row),
            });
        }

        // The spread reduction is bit-deterministic under any thread schedule (the field's
        // contract): the narrowed value becomes a declared constant persisted with the
        // generation, so a replay must reproduce it exactly. Finite with no scan: the boundary
        // forward refuses a diverged frame before any freeze sees it.
        let spread = zero_field.rms_spread();
        let reference_spread =
            Positive::new(spread as f32).ok_or(InvalidRuler::SpreadOutOfDomain { spread })?;

        let quantile_scale =
            positive_quantile(measurements.iter().map(|&(scale, _)| scale), parameters)
                .ok_or(InvalidRuler::NoPositiveScale)?;

        // The window is dimensionless, and both bounds and the membership tests read in f64.
        let epsilon_rel = DPositive::from(parameters.epsilon_rel);
        let ceiling = DNonNegative::from(quantile_scale) / DPositive::from(reference_spread);
        let floor = parameters.floor.map(|floor| {
            DPositive::from(floor.kappa_epsilon) * DPositive::from(floor.projection_band)
        });

        if let Some(floor) = floor
            && floor > ceiling
        {
            return Err(InvalidRuler::EmptyWindow { floor, ceiling });
        }

        if epsilon_rel > ceiling || floor.is_some_and(|floor| epsilon_rel < floor) {
            return Err(InvalidRuler::OutOfWindow {
                epsilon_rel: parameters.epsilon_rel,
                floor,
                ceiling,
            });
        }

        // The representation checks mirror the runtime arithmetic: the pair product is an f32
        // product whose f64 square is exact, so the floor comparison bounds every runtime
        // product at or above the domain's minimum. A coincident pair's product is exactly
        // ε², and the freeze requires it at or above the domain's floor so the product never
        // rounds to zero. An ε_rel small against s_ref underflows the narrowed ε itself to
        // zero, and the refusal then carries the exact double product, the reading no working
        // precision holds.
        let Some(epsilon) = parameters.epsilon_rel.checked_mul(reference_spread) else {
            return Err(InvalidRuler::RepresentationFloor {
                epsilon_abs: DPositive::from(parameters.epsilon_rel)
                    * DPositive::from(reference_spread),
            });
        };

        let epsilon_exact = DPositive::from(epsilon);
        if epsilon_exact * epsilon_exact < DPositive::from(Positive::MIN) {
            return Err(InvalidRuler::RepresentationFloor {
                epsilon_abs: epsilon_exact,
            });
        }

        let largest = measurements
            .iter()
            .map(|&(scale, _)| scale)
            .max()
            .expect("the table validation guarantees at least two rows");
        // The exact double sum of two working-precision values stays finite, at most 2¹²⁹, so
        // the check compares its square against the f32 maximum rather than the sum itself. A
        // sum whose square clears that bound sits near 2⁶⁴, far under where f32 overflows, so
        // the narrowed runtime sum cannot overflow once the check passes.
        let shifted_exact = DNonNegative::from(largest) + DPositive::from(epsilon);
        if shifted_exact * shifted_exact >= DPositive::from(Positive::MAX) {
            return Err(InvalidRuler::RepresentationCeiling {
                shifted_scale: shifted_exact,
            });
        }

        let mut scales = IdVec::with_capacity(measurements.len());
        let mut neighbours = Vec::with_capacity(measurements.len() * set_len);
        for &(scale, ref set) in &measurements {
            scales.push(scale);
            neighbours.extend_from_slice(&set[..set_len]);
        }

        // Every scale is at most the checked largest, and rounding is monotone, so the typed
        // add cannot leave the domain.
        let shifted: IdVec<_, _> = scales.iter().map(|&scale| scale + epsilon).collect();

        Ok(Self {
            scales: scales.into_boxed_slice(),
            shifted: shifted.into_boxed_slice(),
            neighbours: IdMatrix::from_flat(neighbours, set_len),
            reference_spread,
            epsilon_rel: parameters.epsilon_rel,
            epsilon,
        })
    }

    /// Returns the pair's denominator `σ₀ = √((ρ₀(source)+ε)(ρ₀(target)+ε))`.
    ///
    /// The reads hit the precomputed ε-shifted scales, so one call is two loads, a product, and
    /// a root. Total in the typed domain by the freeze-time checks: the floor keeps a coincident
    /// pair's product `ε²` at or above the domain's minimum positive value, the ceiling keeps
    /// the densest pair's product finite, and rounding is monotone between them.
    ///
    /// # Panics
    ///
    /// This panics when either row is outside the node-row domain.
    #[inline]
    #[must_use]
    pub(crate) fn denominator(&self, source: N, target: N) -> Positive {
        (self.shifted[source] * self.shifted[target]).sqrt()
    }

    /// Measures the live field's local scales over the frozen neighbour sets.
    ///
    /// This is the staleness comparison's reading: the band bounds every row's displacement from
    /// the boundary field, each frozen set is fixed, and a median is 1-Lipschitz in the uniform
    /// norm of its inputs, so `|live − frozen| ≤ 2·band` holds row by row - over the frozen sets
    /// and only there. Rows are independent and computed in parallel.
    ///
    /// # Errors
    ///
    /// Returns [`NonFiniteScale`] naming the smallest affected row when a live distance
    /// overflows the finite range (pre-divergence coordinates).
    ///
    /// The coordinates cover the frozen row count - a wiring contract checked in debug builds,
    /// since the field and the ruler come from one run.
    pub(crate) fn live_scales(
        &self,
        coordinates: &FinitePointField<N>,
    ) -> Result<Box<IdSlice<N, NonNegative>>, NonFiniteScale<N>> {
        debug_assert_eq!(
            coordinates.len(),
            self.scales.len(),
            "coordinates and the frozen ruler should cover the same rows"
        );

        let set_len = self.neighbours.columns();
        let scales: Vec<_> = (0..coordinates.len())
            .into_par_iter()
            .map(|row| {
                let row = N::from_usize(row);
                let mut distances = [NonNegative::ZERO; LOCAL_SCALE_NEIGHBOURS];
                for (distance, &neighbour) in distances.iter_mut().zip(self.frozen_set(row).iter())
                {
                    *distance = coordinates[row].distance(coordinates[neighbour]);
                }
                distances[..set_len].sort_unstable();

                sorted_median(&distances[..set_len])
            })
            .collect();

        if let Some(row) = scales.iter().position(|scale| !scale.is_finite()) {
            return Err(NonFiniteScale {
                row: N::from_usize(row),
            });
        }

        Ok(IdSlice::from_boxed_slice(scales.into_boxed_slice()))
    }

    /// Borrows one row's frozen neighbour index set.
    ///
    /// Entries are in ascending stored-distance order with ties in row order, exactly as
    /// selected at the freeze.
    ///
    /// # Panics
    ///
    /// This panics when the row is outside the node-row domain.
    #[inline]
    #[must_use]
    pub(crate) const fn frozen_set(&self, row: N) -> &IdSlice<NeighbourSlot, N>
    where
        N: [const] Id,
    {
        self.neighbours.row(row)
    }

    /// Borrows the frozen local scales `ρ₀` in node-row order.
    #[inline]
    #[must_use]
    pub(crate) fn scales(&self) -> &IdSlice<N, NonNegative> {
        &self.scales
    }

    /// Borrows the frozen neighbour index sets as one matrix, a set per node row.
    #[inline]
    #[must_use]
    pub(super) const fn neighbour_sets(&self) -> &IdMatrix<N, NeighbourSlot, N> {
        &self.neighbours
    }

    /// Returns `s_ref`, the boundary field's RMS spread about its centroid.
    #[inline]
    #[must_use]
    pub(crate) const fn reference_spread(&self) -> Positive {
        self.reference_spread
    }

    /// Returns the declared dimensionless `ε_rel`.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon_rel(&self) -> Positive {
        self.epsilon_rel
    }

    /// Returns `ε = ε_rel · s_ref` in the working precision.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(&self) -> Positive {
        self.epsilon
    }

    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> usize {
        self.scales.len()
    }

    /// Consumes the ruler into its scale table and neighbour sets.
    ///
    /// Both containers leave as the typed values the freeze built, without a copy, for the
    /// evidence record that outlives the ruler.
    #[must_use]
    pub(crate) fn into_tables(
        self,
    ) -> (Box<IdSlice<N, NonNegative>>, IdMatrix<N, NeighbourSlot, N>) {
        (self.scales, self.neighbours)
    }
}

/// Measures one row's frozen scale and captures its neighbour index set.
///
/// Selection matches the live scale's: the nearest entries by (stored distance, row id). Unused
/// trailing set slots hold `N::MAX` and are never read - `set_len` bounds every consumer.
fn freeze_row<N>(
    field: &IdSlice<N, Vec2>,
    knn: &KnnView<'_, N>,
    row: N,
    set_len: usize,
) -> (NonNegative, [N; LOCAL_SCALE_NEIGHBOURS])
where
    N: Id,
{
    // The nearest entries by (stored distance, row id), lexicographic and total by the types.
    let mut nearest = [(NonNegative::MAX, N::MAX); LOCAL_SCALE_NEIGHBOURS];
    for neighbour in knn.row(row) {
        insert_nearest(&mut nearest, (neighbour.distance, neighbour.id));
    }

    let mut set = [N::MAX; LOCAL_SCALE_NEIGHBOURS];
    let mut distances = [NonNegative::ZERO; LOCAL_SCALE_NEIGHBOURS];
    for (slot, &(_, neighbour)) in set.iter_mut().zip(&nearest[..set_len]) {
        *slot = neighbour;
    }
    for (distance, &neighbour) in distances.iter_mut().zip(&set[..set_len]) {
        *distance = field[row].distance(field[neighbour]);
    }
    distances[..set_len].sort_unstable();

    (sorted_median(&distances[..set_len]), set)
}

/// Returns the declared order statistic of the positive scales, or [`None`] when none exist.
///
/// The reading is the smallest positive scale with at least a `scale_quantile` share of the
/// positive scales at or below it: rank `⌈q·m⌉` of the ascending positive scales. The sort runs
/// in parallel. Equal scales are interchangeable, so instability changes nothing.
fn positive_quantile(
    scales: impl Iterator<Item = NonNegative>,
    parameters: RulerParameters,
) -> Option<NonNegative> {
    let mut positive: Vec<_> = scales.filter(|scale| *scale > 0.0).collect();
    if positive.is_empty() {
        return None;
    }
    positive.par_sort_unstable();

    #[expect(
        clippy::cast_precision_loss,
        reason = "row counts sit far below 2^53, so the count converts exactly"
    )]
    let mass = parameters.scale_quantile * positive.len() as f64;
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the quantile lies in (0, 1], so the ceiling lies in [1, len] and fits usize"
    )]
    let rank = mass.ceil() as usize;

    Some(positive[rank.clamp(1, positive.len()) - 1])
}
