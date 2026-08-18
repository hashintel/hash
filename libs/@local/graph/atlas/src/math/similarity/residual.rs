//! RMS residual of a similarity over point correspondences.
//!
//! Paired with the Procrustes fit, the residual measures alignment quality. The similarity
//! transforms every source point, and the reduction turns the squared distances from the targets
//! into one root-mean-square. The fields carry the finiteness proof and the accumulation is
//! bounded far inside `f64`'s range, so the reading is total: a [`DNonNegative`] with no
//! rejection arm. Squares accumulate in double precision, four pairs at a time, serially or
//! across rayon workers.

use core::simd::{Simd, num::SimdFloat as _};

use hashql_core::id::Id;
use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::ParallelSlice as _,
};

use super::Similarity;
use crate::math::{
    DNonNegative, FinitePointField,
    dvec2::{DVec2, DVec2x4T},
    vec2::{Vec2, Vec2x4, Vec2x4T},
};

impl Similarity {
    /// Returns the root-mean-square distance from transformed source points to their targets.
    ///
    /// This is the movement a fitted alignment could not explain: after
    /// [`fit_uniform`](Self::fit_uniform) it measures how far the two fields differ beyond
    /// scale, rotation, and translation. This applies the transform with coefficients widened
    /// to `f64`, and the squared distances accumulate in double precision, so corpus-scale sums
    /// keep their accuracy. Pairs fold four at a time, and the trailing `len % 4` fold one at a
    /// time.
    ///
    /// The reading is total over the proven-finite fields: the accumulation is bounded far
    /// inside `f64`'s range, so no rejection arm exists. The similarity's rotation and
    /// translation coefficients must be finite, which every fit in this module produces and
    /// [`new_unchecked`](DNonNegative::new_unchecked)'s debug assertion guards.
    ///
    /// # Panics
    ///
    /// This panics when the field lengths differ or the fields are empty, because the residual
    /// is defined over matched pairs and an empty set has no mean.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let source = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    /// // Identity residual against offset targets: both points miss by
    /// // (0.0, 3.0), so the RMS is exactly 3.0.
    /// let target = [Vec2::new(0.0, 3.0), Vec2::new(1.0, 3.0)];
    ///
    /// let source = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&source))
    ///     .expect("the sources are finite");
    /// let target = FinitePointField::new(IdSlice::from_raw(&target))
    ///     .expect("the targets are finite");
    /// let residual = Similarity::IDENTITY.rms_residual(source, target);
    /// assert!((residual.get() - 3.0).abs() < 1e-12);
    /// ```
    #[must_use]
    pub(crate) fn rms_residual<I: Id>(
        self,
        source: &FinitePointField<I>,
        target: &FinitePointField<I>,
    ) -> DNonNegative {
        assert_eq!(
            source.len(),
            target.len(),
            "paired fields must cover the same rows"
        );
        assert!(
            !source.is_empty(),
            "an RMS residual needs at least one pair"
        );

        finish_rms(
            self.squared_residuals(source.as_raw(), target.as_raw()),
            source.len(),
        )
    }

    /// Returns the root-mean-square residual of large fields in parallel.
    ///
    /// The contract is identical to [`rms_residual`](Self::rms_residual), including its
    /// panics. The chunked reduction carries [`fit_par`](Self::fit_par)'s
    /// units-in-the-last-place caveat and the same break-even near a hundred thousand pairs.
    /// Work splits into chunks of [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK) pairs.
    ///
    /// # Panics
    ///
    /// This panics when the field lengths differ or the fields are empty, exactly as
    /// [`rms_residual`](Self::rms_residual) does.
    #[must_use]
    pub(crate) fn rms_residual_par<I: Id>(
        self,
        source: &FinitePointField<I>,
        target: &FinitePointField<I>,
    ) -> DNonNegative {
        assert_eq!(
            source.len(),
            target.len(),
            "paired fields must cover the same rows"
        );
        assert!(
            !source.is_empty(),
            "an RMS residual needs at least one pair"
        );

        let chunk = Self::PARALLEL_CHUNK.get();
        let squared = source
            .as_raw()
            .par_chunks(chunk)
            .zip(target.as_raw().par_chunks(chunk))
            .map(|(source, target)| self.squared_residuals(source, target))
            .sum();

        finish_rms(squared, source.len())
    }

    /// Accumulates squared transformed-source-to-target distances in double precision.
    ///
    /// The slices carry equal lengths, which the `rms_residual` entry points check once, and
    /// arrive from proven-finite fields, so the sum is finite by [`finish_rms`]'s bound.
    fn squared_residuals(self, source: &[Vec2], target: &[Vec2]) -> f64 {
        // `scale · R · p + t` with the scale folded into the rotation
        // columns once, in double precision.
        let scale = f64::from(self.scale);
        let cos = scale * f64::from(self.rotation.cos());
        let sin = scale * f64::from(self.rotation.sin());
        let translation = DVec2::from(self.translation);

        let (source_batches, source_rest) = source.as_chunks::<4>();
        let (target_batches, target_rest) = target.as_chunks::<4>();

        let cos_lanes = Simd::splat(cos);
        let sin_lanes = Simd::splat(sin);
        let mut squared_sum = Simd::splat(0.0_f64);
        for (source, target) in source_batches.iter().zip(target_batches) {
            let source = DVec2x4T::from(Vec2x4T::from(Vec2x4::from(*source)));
            let target = DVec2x4T::from(Vec2x4T::from(Vec2x4::from(*target)));

            let residual = DVec2x4T::from_lanes(
                cos_lanes * source.xs() - sin_lanes * source.ys() + Simd::splat(translation.x())
                    - target.xs(),
                sin_lanes * source.xs() + cos_lanes * source.ys() + Simd::splat(translation.y())
                    - target.ys(),
            );
            squared_sum += residual.length_squared();
        }

        let mut squared = squared_sum.reduce_sum();
        for (&source, &target) in source_rest.iter().zip(target_rest) {
            let source = DVec2::from(source);
            let target = DVec2::from(target);

            let residual = DVec2::new(
                cos.mul_add(source.x(), (-sin).mul_add(source.y(), translation.x())) - target.x(),
                sin.mul_add(source.x(), cos.mul_add(source.y(), translation.y())) - target.y(),
            );
            squared += residual.norm_squared();
        }

        squared
    }
}

/// Reduces an accumulated squared-distance sum to the RMS.
#[expect(
    clippy::cast_precision_loss,
    reason = "pair counts remain exactly representable in f64 far beyond any corpus"
)]
fn finish_rms(squared: f64, pairs: usize) -> DNonNegative {
    // In domain with no check: every coordinate is field-proven finite and every coefficient
    // is a finite f32, each below 2^128 in magnitude. A residual component is two
    // scale-rotation-coordinate products (each below 2^128 cubed = 2^384) plus a translation
    // and a target coordinate, so it stays below 2^386, its square below 2^772, a pair's
    // squared distance below 2^773, and a sum of fewer than 2^60 pairs (a slice of 8-byte
    // points cannot hold more) below 2^833 - finite in `f64` with room to spare, and
    // non-negative as a sum of squares. The quotient by a positive pair count and the square
    // root keep both properties.
    DNonNegative::new_unchecked((squared / pairs as f64).sqrt())
}
