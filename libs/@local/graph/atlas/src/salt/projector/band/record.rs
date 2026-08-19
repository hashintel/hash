//! The enforcement-point record and the applied clip derivative.

use hashql_core::id::{Id, IdSlice};
use rayon::{iter::IndexedParallelIterator, slice::ParallelSliceMut as _};

use crate::math::{DNonNegative, DPositive, DVec2, Vec2};

/// One clipped row's applied-projection derivative.
///
/// The clip moves a row along `x ↦ centre + landing·u(x)` with `u` the unit displacement from
/// the centre, whose Jacobian at the pre-projection position is `factor·(I − uuᵀ)` with
/// `factor = landing/‖x − centre‖`: the radial component of a perturbation dies and the
/// tangential component scales down to the landing sphere. The matrix is symmetric, so the
/// transpose the chain rule needs is the matrix itself.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ClipJacobian {
    /// `u`: the pre-projection unit displacement from the centre.
    pub direction: DVec2,
    /// `landing/‖x − centre‖`: the tangential scale.
    pub factor: DPositive,
}

impl ClipJacobian {
    /// Applies the frozen clip law to one value from its widened displacement readings.
    ///
    /// Returns the landed value with the applied derivative where `square` exceeds
    /// `radius_squared`, and [`None`] where the squared displacement sits at or inside it.
    /// Every projection path shares this predicate and this landing arithmetic, so a value
    /// clips identically wherever it is read.
    ///
    /// The readings must be one consistent set: `square` is the widened squared distance of
    /// `value` from `centre`, `distance` is its square root, and `radius_squared` with
    /// `landing_radius` are one frozen [`BandProjection`](super::BandProjection)'s constants.
    /// The types carry each reading's domain, and the caller carries the relations between
    /// them.
    ///
    /// # Panics
    ///
    /// This panics when the projected point cannot narrow to f32. Under the reading invariant
    /// above, a finite `value` with a finite `centre` cannot reach that, because the
    /// freeze-time extent check keeps every finite projection inside the f32 range. The panic
    /// marks a non-finite input the caller was obliged to refuse earlier, or readings that
    /// break the invariant, whose landing can leave the representable range.
    pub(super) const fn clip(
        value: Vec2,
        centre: Vec2,
        square: DNonNegative,
        distance: DNonNegative,
        radius_squared: DPositive,
        landing_radius: DPositive,
    ) -> Option<(Vec2, Self)> {
        if square <= radius_squared {
            return None;
        }

        let displacement = DVec2::from(value) - DVec2::from(centre);
        // In `(0, 1)` on this branch: the distance exceeds the radius and the landing sits
        // strictly inside it, so the quotient of two finite positives is finite and positive.
        let factor = DPositive::new_unchecked((landing_radius / distance).into_raw());
        let jacobian = Self {
            direction: displacement / distance,
            factor,
        };
        let landed = displacement
            .mul_add(factor.get(), DVec2::from(centre))
            .narrow()
            .expect("the landing point stays finite by the freeze-time extent check");

        Some((landed, jacobian))
    }

    /// Applies the Jacobian to a force taken with respect to the projected position.
    ///
    /// The result is the same force expressed with respect to the raw position: the component
    /// along the clip direction is removed and the remainder scales by the factor.
    #[must_use]
    pub(crate) fn transform(self, force: DVec2) -> DVec2 {
        (force - self.direction * force.dot(self.direction).into_raw()) * self.factor.get()
    }
}

/// One run's enforcement-point record, accumulated from the boundary through final evaluation.
///
/// Born zero at [`BandProjection::open_record`](super::BandProjection::open_record), grown by
/// every [`BandProjection::apply`](super::BandProjection::apply), and
/// never reset: the type has no operation that shrinks a field, which is the no-reset rule made
/// structural. The calibration protocol derives a run's non-binding verdict from these readings,
/// so every one is taken pre-projection by the enforcing operation itself.
#[derive(Debug, PartialEq)]
pub(crate) struct EnforcementRecord<N> {
    /// `u(n)` per row: the running maximum normalized pre-projection displacement over every
    /// application so far.
    row_maxima: Box<IdSlice<N, DNonNegative>>,
    /// The cumulative count of row-applications the projection moved.
    clipped_row_applications: u64,
    /// The largest excess of any row's pre-projection normalized displacement over the enforced
    /// radius. Zero while nothing has bound.
    max_overshoot: DNonNegative,
    /// The boundary step the record opened at, which starts the accumulation interval.
    opened_at: usize,
    /// The last enforcement point applied, or [`None`] before the first. Together with
    /// [`opened_at`](Self::opened_at) this is the interval's persisted endpoint pair.
    last_application: Option<usize>,
}

impl<N> EnforcementRecord<N>
where
    N: Id,
{
    /// Opens the record born zero over `rows` entries at `boundary_step`.
    pub(super) fn open(rows: usize, boundary_step: usize) -> Self {
        Self {
            row_maxima: IdSlice::from_boxed_slice(
                vec![DNonNegative::ZERO; rows].into_boxed_slice(),
            ),
            clipped_row_applications: 0,
            max_overshoot: DNonNegative::ZERO,
            opened_at: boundary_step,
            last_application: None,
        }
    }

    /// Borrows the running maxima in fixed chunks for one application's parallel fold.
    ///
    /// The enforcement pass raises entries by maximum only, and the borrow is scoped to the
    /// band module, the record's one writer.
    pub(super) fn maxima_chunks_mut(
        &mut self,
        chunk: usize,
    ) -> impl IndexedParallelIterator<Item = &mut [DNonNegative]> {
        self.row_maxima.as_raw_mut().par_chunks_mut(chunk)
    }

    /// Absorbs one application's combined outcome.
    ///
    /// The clipped count adds, the overshoot maxes, and the interval endpoint advances to
    /// `step`. Every absorption grows the record, which is how [`EnforcementRecord`] keeps
    /// its no-reset rule.
    pub(super) const fn absorb(&mut self, clipped: u64, overshoot: DNonNegative, step: usize) {
        self.clipped_row_applications += clipped;
        self.max_overshoot = self.max_overshoot.max(overshoot);
        self.last_application = Some(step);
    }

    /// Returns whether any projection application moved any row.
    ///
    /// Derived from the count: a clip is exactly a moved row, so the bit and the count cannot
    /// disagree.
    #[inline]
    #[must_use]
    pub(crate) const fn ever_clipped(&self) -> bool {
        self.clipped_row_applications > 0
    }

    /// Returns the cumulative clipped row-application count.
    #[inline]
    #[must_use]
    pub(crate) const fn clipped_row_applications(&self) -> u64 {
        self.clipped_row_applications
    }

    /// Returns the maximum pre-projection overshoot in units of `s_ref`.
    #[inline]
    #[must_use]
    pub(crate) const fn max_overshoot(&self) -> DNonNegative {
        self.max_overshoot
    }

    /// Borrows the per-row running maxima `u(n)` in node-row order.
    #[inline]
    #[must_use]
    pub(crate) fn row_maxima(&self) -> &IdSlice<N, DNonNegative> {
        &self.row_maxima
    }

    /// Consumes the record into its per-row maxima, without a copy, for the evidence record
    /// that closes over it.
    #[must_use]
    pub(crate) fn into_row_maxima(self) -> Box<IdSlice<N, DNonNegative>> {
        self.row_maxima
    }

    /// Returns the accumulation interval's start, the boundary step.
    #[inline]
    #[must_use]
    pub(crate) const fn opened_at(&self) -> usize {
        self.opened_at
    }

    /// Returns the last enforcement point applied, or [`None`] before the first.
    #[inline]
    #[must_use]
    pub(crate) const fn last_application(&self) -> Option<usize> {
        self.last_application
    }
}
