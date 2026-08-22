//! The per-row band projection enforces family (ii)'s constitutive constraint and keeps the
//! record that makes its non-binding claim evidence.
//!
//! The estimand is declared subject to `‖x₀(n) − x₀^ref(n)‖ ≤ band` for every node row `n` -
//! each row of the live zero-condition field may move at most `band` world units from its
//! position in the boundary snapshot `Z_K`. Every row is bound, participants and gauge anchors
//! and holdout endpoints and bystanders alike, because the reference-corruption failure mode is
//! global. Per row rather than in RMS because an RMS ball leaves a fixed-cardinality attack set
//! per-row room that grows as `√N` with the corpus. The bound is enforced by
//! projection rather than penalized: at every enforcement point a row past the radius moves
//! back to the ball around its own reference position, so the field the loss reads never exists
//! outside the constraint. The radius is the same-frame reconstruction `band = β · s_ref(Z_K)` -
//! `β` is the stage's declared dimensionless value (the target's `β_proj`, or a calibration
//! cohort's `β_cal`, assigned by the schedule, not by this module) and `s_ref` is the boundary
//! field's own RMS spread, so nothing but a dimensionless number ever crosses generations.
//!
//! The whole-field application is the only witness of what it censored in the constitutive
//! field, so that enforcing operation maintains the run's [`EnforcementRecord`] as it applies
//! and is the record's one writer. The record accumulates the clipped row-application count
//! (whose positivity is the `ever_clipped` bit - a clip is exactly a moved row, so within the
//! record the bit and the count cannot disagree), the maximum pre-projection overshoot of the
//! enforced radius in units of `s_ref`, and each row's running maximum normalized displacement
//! `u(n) = max_t ‖z_pre(n,t) − z_K(n)‖ / s_ref` over every application. Every reading is taken
//! before the projection moves anything, because an evaluation-time or final-field reading
//! misses exactly the excursion-and-return movement a radius censors. The record runs from the
//! boundary step it opened at through the run's final evaluation and has no reset operation:
//! calibration cohorts admit `β_noise` only when every run's readings are zero, and an interval
//! with a hole is the censorship that rule exists to refuse.
//!
//! The constraint also binds row values read through another realization of the same field.
//! [`BandProjection::project`] applies the identical clip law to one such value and records
//! nothing. On a backend whose kernels vary with the execution shape, two realizations of one
//! row can read different bytes, so a value near the radius can clip in the per-row form while
//! the recorded field reads unclipped. That disagreement is the design: the record describes
//! the constitutive field alone. In a run whose objective reads a second realization, a clean
//! `ever_clipped` therefore does not certify that the objective ran unconstrained. The per-row
//! running maxima are readings of the constitutive field alone, taken pre-clip at every
//! application: a value that clipped only in another realization never reaches the record, in
//! the maxima or anywhere else.
//!
//! The record's honesty rests on the arithmetic. A clipped row is placed at `band − margin`
//! rather than exactly at the radius, with `margin` sized at the freeze to dominate every
//! narrowing
//! error of the stored f32 coordinates - that makes the projection idempotent in the stored
//! precision, so a parked row re-reads strictly inside and cannot re-clip on the next
//! application to inflate the record by rounding alone. A freeze whose margin would consume the
//! radius refuses, since at that magnitude the stored precision cannot represent the
//! constraint's own boundary. And a non-finite row refuses before any byte moves: divergence
//! becomes a named refusal instead of a panic inside the landing arithmetic, and the record
//! never reads a diverged field as clean.

mod enforce;
mod record;
mod refusal;
#[cfg(test)]
mod tests;

use hashql_core::id::Id;
use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::{ParallelSlice as _, ParallelSliceMut as _},
};

use self::enforce::EnforcementPass;
pub(crate) use self::{
    record::{ClipJacobian, EnforcementRecord},
    refusal::BandRefusal,
};
use crate::math::{DNonNegative, DPositive, DVec2, FinitePointField, Positive, Vec2, d_positive};

/// Rows per parallel chunk in the enforcement pass.
///
/// Fixed chunk boundaries keep every reduction bit-deterministic under any thread schedule, and
/// the per-chunk partials combine by integer sum and maximum, which are order-independent
/// besides.
const ROW_CHUNK: usize = 4096;

/// The landing margin as a fraction of the snapshot's coordinate extent.
///
/// Narrowing a projected coordinate to f32 moves it by at most half an ulp of its own magnitude,
/// bounded by the extent times `2⁻²⁴` per component. A margin of `2⁻²²` extents dominates the
/// two-component norm error with a factor of two to spare for the f64 arithmetic in between.
const MARGIN_SCALE: DPositive = d_positive!(1.0 / 4_194_304.0);

/// The landing margin's absolute floor, `2⁻¹⁴⁰`.
///
/// Subnormal f32 components carry an absolute narrowing error up to `2⁻¹⁵⁰` regardless of the
/// extent, so an extent-scaled margin alone underestimates the error of a map whose coordinates
/// sit near the bottom of the f32 range. The floor keeps the idempotence argument valid there.
const MARGIN_FLOOR: DPositive = d_positive!(7.174_648_137_343_064e-43);

/// The headroom the radius must keep over the landing margin: `margin · 1024 ≤ band`.
///
/// A clipped row lands within one `1024`th of the radius, so the landing stays a projection
/// onto the boundary rather than a shrink toward the centre. Without the headroom the stored
/// f32 coordinates cannot express the constraint's boundary around the snapshot, and the
/// freeze refuses.
const MARGIN_HEADROOM: DPositive = d_positive!(1024.0);

/// The frozen constraint holds the projection centre `x₀^ref` beside its reconstructed radius.
///
/// The state is minimal: one radius and one margin. Every derived reading - the widened
/// radius, its exact square, the landing radius, the widened spread - is an accessor over
/// them, so no cached projection of the radius can disagree with its source.
#[derive(Debug, PartialEq)]
pub(crate) struct BandProjection<N> {
    /// The boundary snapshot's zero field, each row's projection centre.
    centre: Box<FinitePointField<N>>,
    /// `β`: the stage's declared dimensionless radius.
    dimensionless_radius: Positive,
    /// `s_ref(Z_K)`: the boundary field's RMS spread, the frame's unit carrier and the
    /// normalizer of every record reading.
    reference_spread: Positive,
    /// `band = β · s_ref` in the working precision: the enforced radius.
    radius: Positive,
    /// The landing margin, sized at the freeze to dominate every narrowing error of the
    /// stored f32 coordinates.
    margin: DPositive,
}

impl<N> BandProjection<N>
where
    N: Id,
{
    /// Freezes the constraint against the boundary snapshot.
    ///
    /// The checks run in declaration order - centre-row finiteness, the radius's domain, the
    /// coordinate extent's f32 ceiling, the landing margin's headroom under the radius - and
    /// the first failed check is the refusal. The radius itself is the reconstruction from the
    /// declared `β` and the ruler's `s_ref`.
    ///
    /// The snapshot covers at least one row - a wiring contract checked in debug builds,
    /// because a corpus with no rows has nothing to constrain.
    ///
    /// # Errors
    ///
    /// Returns [`BandRefusal`] carrying the first failed check: a non-finite centre row, a
    /// radius outside the positive f32 domain, an extent past the finite f32 range, or a radius
    /// below the landing margin's headroom.
    pub(crate) fn freeze(
        centre: Box<FinitePointField<N>>,
        dimensionless_radius: Positive,
        reference_spread: Positive,
    ) -> Result<Self, BandRefusal> {
        debug_assert!(
            !centre.is_empty(),
            "the boundary snapshot should cover at least one row"
        );

        // The narrowed f32 product is the enforced radius; the refusal carries the exact
        // widened value.
        let radius = dimensionless_radius.checked_mul(reference_spread);
        let radius_exact = dimensionless_radius.mul_wide(reference_spread);
        let Some(radius) = radius else {
            return Err(BandRefusal::RadiusOutOfDomain {
                radius: radius_exact,
            });
        };

        // The extent bounds every post-projection coordinate: a projected row's components stay
        // within the largest centre magnitude plus the radius.
        let extent = centre.extent().widen() + radius_exact;

        if extent > Positive::MAX.widen() {
            return Err(BandRefusal::RepresentationCeiling { extent });
        }

        // Total by the ceiling guard above: the extent is at most the f32 maximum and the
        // scale an exact 2⁻²² that cannot carry a positive extent to zero in f64. The headroom
        // is a further exact 2¹⁰ on a product still hundreds of shells below the domain's top.
        let margin = DPositive::new_unchecked(extent.get() * MARGIN_SCALE.get()).max(MARGIN_FLOOR);
        let floor = DPositive::new_unchecked(margin.get() * MARGIN_HEADROOM.get());
        if floor > radius_exact {
            return Err(BandRefusal::RepresentationFloor { radius, floor });
        }

        Ok(Self {
            centre,
            dimensionless_radius,
            reference_spread,
            radius,
            margin,
        })
    }

    /// Returns the radius widened to f64, exactly. The overshoot reading subtracts it.
    #[inline]
    const fn radius_wide(&self) -> DPositive {
        // Positive with no check: the exact widening of a positive f32 stays positive.
        DPositive::from(self.radius)
    }

    /// Returns the radius's f64 square, exact because an f32 significand squares within 53
    /// bits. The clip predicate compares squared displacements against it.
    #[inline]
    const fn radius_squared(&self) -> DPositive {
        self.radius.square_wide()
    }

    /// Returns the reference spread widened to f64, exactly. Every normalized reading divides
    /// by it.
    #[inline]
    const fn spread_wide(&self) -> DPositive {
        // Positive with no check: the exact widening of a positive f32 stays positive.
        DPositive::new_unchecked(f64::from(self.reference_spread))
    }

    /// Returns `band − margin`, where a clipped row lands.
    ///
    /// The landing sits one narrowing allowance inside the radius, so a clipped row re-reads
    /// strictly inside and the projection is idempotent in the stored precision.
    #[inline]
    const fn landing_radius(&self) -> DPositive {
        // Positive with no check: the freeze's headroom keeps the margin at or below a
        // 1024th of the radius, so the landing keeps at least 1023/1024 of it.
        DPositive::new_unchecked(self.radius_wide() - self.margin)
    }

    /// Opens the run's enforcement record at the boundary step.
    ///
    /// The record is born zero, sized to the centre's row domain, with the accumulation
    /// interval's start pinned to `boundary_step`. It accumulates through the run's final
    /// evaluation and has no reset operation.
    #[must_use]
    pub(crate) fn open_record(&self, boundary_step: usize) -> EnforcementRecord<N> {
        EnforcementRecord::open(self.centre.len(), boundary_step)
    }

    /// Enforces the constraint over the whole field, accumulating the record.
    ///
    /// Every row's pre-projection displacement updates its running maximum first, then a row
    /// whose displacement exceeds the radius moves to the landing radius along its own
    /// direction from the centre. Untouched rows keep their exact bytes, so an unclipped
    /// application leaves the field bit-identical - the coincidence the non-binding claim
    /// reads. Rows enforce in parallel over fixed chunks, and the partial reductions combine by
    /// integer sum and maximum, so the result is bit-deterministic under any thread schedule.
    ///
    /// The field and the record share the centre's row domain, and enforcement points arrive
    /// in step order - wiring contracts checked in debug builds, since all three come from one
    /// run.
    pub(crate) fn apply(
        &self,
        field: &mut FinitePointField<N>,
        step: usize,
        record: &mut EnforcementRecord<N>,
    ) {
        debug_assert_eq!(
            field.len(),
            self.centre.len(),
            "the live field and the boundary snapshot should cover the same rows"
        );
        debug_assert_eq!(
            record.row_maxima().len(),
            self.centre.len(),
            "the record and the boundary snapshot should cover the same rows"
        );
        debug_assert!(
            step >= record.opened_at(),
            "an enforcement point should not precede the record's interval"
        );
        debug_assert!(
            record.last_application().is_none_or(|last| step >= last),
            "enforcement points should arrive in step order"
        );

        // The typed field is the pass's construction precondition: its unchecked squares
        // consume the field's finiteness proof.
        let pass = EnforcementPass::new(self);
        let partials: Vec<_> = field
            .as_raw_mut_unchecked()
            .par_chunks_mut(ROW_CHUNK)
            .zip(self.centre.as_raw().par_chunks(ROW_CHUNK))
            .zip(record.maxima_chunks_mut(ROW_CHUNK))
            .map(|((rows, centres), maxima)| pass.enforce_chunk(rows, centres, maxima))
            .collect();

        let mut clipped = 0_u64;
        let mut overshoot = DNonNegative::ZERO;
        for partial in partials {
            clipped += partial.clipped();
            overshoot = overshoot.max(partial.overshoot());
        }

        record.absorb(clipped, overshoot, step);
    }

    /// Borrows the projection centre, the boundary snapshot's zero field.
    #[inline]
    #[must_use]
    pub(crate) fn centre(&self) -> &FinitePointField<N> {
        &self.centre
    }

    /// Consumes the projection into its centre, without a copy, for the evidence record that
    /// outlives the constraint.
    #[must_use]
    pub(crate) fn into_centre(self) -> Box<FinitePointField<N>> {
        self.centre
    }

    /// Returns `β`, the enforced dimensionless radius.
    #[inline]
    #[must_use]
    pub(crate) const fn dimensionless_radius(&self) -> Positive {
        self.dimensionless_radius
    }

    /// Returns `s_ref(Z_K)`, the reference spread the radius reconstructs against.
    #[inline]
    #[must_use]
    pub(crate) const fn reference_spread(&self) -> Positive {
        self.reference_spread
    }

    /// Returns `band = β · s_ref`, the enforced absolute radius in world units.
    #[inline]
    #[must_use]
    pub(crate) const fn radius(&self) -> Positive {
        self.radius
    }

    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn len(&self) -> usize {
        self.centre.len()
    }

    /// Projects one row's value under the frozen constraint, recording nothing.
    ///
    /// [`BandProjection::apply`] is the enforcement point and the record's one writer. This
    /// per-row form applies the identical clip law to the same row's value read through
    /// another realization of the field: the constraint binds the field's values wherever a
    /// calculus reads them, and this form projects one such reading without touching the
    /// record. Returns the projected value beside the applied derivative, with [`None`] where
    /// the radius does not bind.
    ///
    /// The caller certifies the value finite, as the whole-field application does by scanning
    /// before it mutates.
    ///
    /// # Panics
    ///
    /// This panics at the centre lookup when `row` lies outside the frozen domain. It also
    /// panics inside the landing's f32 narrowing when the value arrives non-finite, since a
    /// non-finite displacement enters the clip branch. [`BandProjection::apply`] is the
    /// refusing form for a possibly diverged field.
    #[must_use]
    pub(crate) fn project(&self, row: N, value: Vec2) -> (Vec2, Option<ClipJacobian>) {
        debug_assert!(
            value.is_finite(),
            "a projected value should arrive finite from its forward's row scan"
        );

        let centre = self.centre[row];
        let square = DVec2::from(value).distance_squared(DVec2::from(centre));

        // Non-negative with no check: the caller certified the value finite, and a squared
        // distance of finite points cannot go negative.
        let square = DNonNegative::new_unchecked(square);
        match ClipJacobian::clip(
            value,
            centre,
            square,
            square.sqrt(),
            self.radius_squared(),
            self.landing_radius(),
        ) {
            Some((landed, jacobian)) => (landed, Some(jacobian)),
            None => (value, None),
        }
    }

    /// Returns the squared displacement floor above which a row reads as at the boundary.
    ///
    /// The floor sits two margins inside the radius. A clipped row lands one margin inside, at
    /// the landing radius, and re-reads within one narrowing allowance of it, and the margin
    /// dominates that allowance by construction, so every clipped-in-place row's squared
    /// displacement stays at or above this floor. The saturation reading that consumes it
    /// therefore counts every row the projection is actively holding, together with unclipped
    /// rows within two margins of the boundary.
    #[inline]
    #[must_use]
    pub(crate) fn saturation_floor_squared(&self) -> DPositive {
        // Positive with no check: the freeze's headroom keeps the margin at or below a 1024th
        // of the radius, so the floor keeps at least 1022/1024 of it and stays positive.
        let floor = (self.landing_radius() - self.margin).get();

        // Total: the floor is at most the f32-born radius and at least 1022/1024 of a radius
        // the headroom keeps above 2⁻¹³⁰. Both squares sit far inside the f64 range.
        DPositive::new_unchecked(floor * floor)
    }
}
