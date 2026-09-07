//! The whole-field enforcement pass.
//!
//! [`EnforcementPass`] owns the per-chunk and per-row enforcement arithmetic behind
//! [`BandProjection::apply`](super::BandProjection::apply). It copies the frozen constraint's
//! derived readings out of the projection at construction, and it is constructed only after
//! the whole-field finiteness scan: every unchecked non-negative square in the pass consumes
//! that certificate as a construction precondition.

use hashql_core::id::Id;

use super::{BandProjection, record::ClipJacobian};
use crate::math::{DNonNegative, DPositive, DVec2, DVec2x4T, Vec2};

/// One application's enforcement arithmetic, over the frozen constraint's derived readings.
///
/// The readings are copies taken from the projection itself, so no call site can pair them
/// wrongly. The pass exists only after [`BandProjection::apply`]'s entry scan certifies every
/// row finite, and its unchecked constructions consume that certificate.
pub(super) struct EnforcementPass {
    /// `band` widened to f64, exactly. The overshoot reading subtracts it.
    radius_wide: DPositive,
    /// The radius's exact f64 square, the clip predicate's comparator.
    radius_squared: DPositive,
    /// `band − margin`, where a clipped row lands.
    landing_radius: DPositive,
    /// `s_ref(Z_K)` widened to f64, the divisor of every normalized reading.
    spread_wide: DPositive,
}

impl EnforcementPass {
    /// Copies the derived readings out of the frozen constraint.
    ///
    /// The caller has already certified every field row finite: the pass's unchecked squares
    /// are valid only under that scan.
    pub(super) const fn new<N>(projection: &BandProjection<N>) -> Self
    where
        N: Id,
    {
        Self {
            radius_wide: projection.radius_wide(),
            radius_squared: projection.radius_squared(),
            landing_radius: projection.landing_radius(),
            spread_wide: projection.spread_wide(),
        }
    }

    /// Enforces one chunk, four rows at a time on SIMD lanes.
    ///
    /// The widened distance kernel agrees bit for bit with the scalar form, so the batch and
    /// remainder paths read identical displacements for identical rows.
    pub(super) fn enforce_chunk(
        &self,
        rows: &mut [Vec2],
        centres: &[Vec2],
        maxima: &mut [DNonNegative],
    ) -> ChunkOutcome {
        let mut outcome = ChunkOutcome::default();

        let (row_batches, row_rest) = rows.as_chunks_mut::<4>();
        let (centre_batches, centre_rest) = centres.as_chunks::<4>();
        let (maxima_batches, maxima_rest) = maxima.as_chunks_mut::<4>();

        for ((batch, batch_centres), batch_maxima) in row_batches
            .iter_mut()
            .zip(centre_batches)
            .zip(maxima_batches)
        {
            let wide = DVec2x4T::from(*batch);
            let centres_wide = DVec2x4T::from(*batch_centres);
            let squares = wide.distance_squared(centres_wide);

            for (lane, &square) in squares.as_array().iter().enumerate() {
                // Non-negative with no check: the entry scan certified every row finite, and a
                // squared distance of finite points cannot go negative.
                self.enforce_row(
                    &mut batch[lane],
                    batch_centres[lane],
                    DNonNegative::new_unchecked(square),
                    &mut batch_maxima[lane],
                    &mut outcome,
                );
            }
        }

        for ((row, &centre), maximum) in row_rest.iter_mut().zip(centre_rest).zip(maxima_rest) {
            let square = DVec2::from(*row).distance_squared(DVec2::from(centre));
            // Non-negative with no check: same certificate as the batch lanes above.
            self.enforce_row(
                row,
                centre,
                DNonNegative::new_unchecked(square),
                maximum,
                &mut outcome,
            );
        }

        outcome
    }

    /// Enforces one row from its widened squared displacement.
    ///
    /// The running maximum updates before the clip test, so the record reads the pre-projection
    /// displacement whether or not the radius binds.
    fn enforce_row(
        &self,
        row: &mut Vec2,
        centre: Vec2,
        square: DNonNegative,
        maximum: &mut DNonNegative,
        outcome: &mut ChunkOutcome,
    ) {
        let distance = square.sqrt();
        // Proven finite: the entry scan and the freeze admit only finite rows and centres, and
        // the widest f32 displacement quotient by the smallest positive spread stays far inside
        // the f64 range, so the re-entry needs no check.
        let normalized = (distance / self.spread_wide).finish_unchecked();
        *maximum = (*maximum).max(normalized);

        // The clip law returns the applied derivative, and this whole-field path discards it:
        // nothing differentiates through the constitutive field, and the per-row projection
        // derives its own.
        if let Some((landed, _)) = ClipJacobian::clip(
            *row,
            centre,
            square,
            distance,
            self.radius_squared,
            self.landing_radius,
        ) {
            outcome.clipped += 1;
            // Positive on this branch: the distance exceeds the radius, and the quotient of
            // finite one-sign readings by a positive spread stays finite.
            let overshoot = DNonNegative::new_unchecked(
                ((distance - self.radius_wide) / self.spread_wide).into_raw(),
            );
            outcome.overshoot = outcome.overshoot.max(overshoot);

            *row = landed;
        }
    }
}

/// One parallel chunk's clipping partials, combined by sum and maximum.
#[derive(Debug, Copy, Clone, Default)]
pub(super) struct ChunkOutcome {
    /// Rows this chunk clipped in this application.
    clipped: u64,
    /// The chunk's largest normalized overshoot.
    overshoot: DNonNegative,
}

impl ChunkOutcome {
    /// Rows this chunk clipped.
    pub(super) const fn clipped(&self) -> u64 {
        self.clipped
    }

    /// The chunk's largest normalized overshoot.
    pub(super) const fn overshoot(&self) -> DNonNegative {
        self.overshoot
    }
}
