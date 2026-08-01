//! RMS residual of a similarity over point correspondences.
//!
//! Paired with the Procrustes fit, the residual measures alignment quality. The similarity
//! transforms every source point, and the reduction turns the squared distances from the targets
//! into one root-mean-square. Squares accumulate in double precision, four pairs at a time,
//! serially or across rayon workers.

use core::simd::{Simd, num::SimdFloat as _};

use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::ParallelSlice as _,
};

use super::Similarity;
use crate::math::{
    dvec2::{DVec2, DVec2x4T},
    vec2::{Vec2, Vec2x4, Vec2x4T},
};

impl Similarity {
    /// Returns the root-mean-square distance from transformed source points to their targets.
    ///
    /// This is the movement a fitted alignment could not explain: after [`fit`](Self::fit) it
    /// measures how far the two point sets differ beyond scale, rotation, and translation. This
    /// applies the transform with coefficients widened to `f64`, and the squared distances
    /// accumulate in double precision, so corpus-scale sums keep their accuracy. Pairs fold four at
    /// a time, and the trailing `len % 4` fold one at a time.
    ///
    /// Returns [`None`] when the slice lengths differ, the caller passes no pairs, or any
    /// coordinate is not finite (a non-finite input surfaces as a non-finite sum, which the
    /// finishing step refuses).
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{Similarity, Vec2};
    ///
    /// let source = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    /// // Identity residual against offset targets: both points miss by
    /// // (0.0, 3.0), so the RMS is exactly 3.0.
    /// let target = [Vec2::new(0.0, 3.0), Vec2::new(1.0, 3.0)];
    ///
    /// let residual = Similarity::IDENTITY
    ///     .rms_residual(&source, &target)
    ///     .expect("the pairs are finite");
    /// assert!((residual - 3.0).abs() < 1e-12);
    /// ```
    #[must_use]
    pub fn rms_residual(self, source: &[Vec2], target: &[Vec2]) -> Option<f64> {
        if source.len() != target.len() || source.is_empty() {
            return None;
        }

        finish_rms(self.squared_residuals(source, target), source.len())
    }

    /// Returns the root-mean-square residual of large inputs in parallel.
    ///
    /// The contract is identical to [`rms_residual`](Self::rms_residual). The chunked reduction
    /// carries [`fit_par`](Self::fit_par)'s units-in-the-last-place caveat and the same break-even
    /// near a hundred thousand pairs. Work splits into chunks of
    /// [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK) pairs.
    #[must_use]
    pub fn rms_residual_par(self, source: &[Vec2], target: &[Vec2]) -> Option<f64> {
        if source.len() != target.len() || source.is_empty() {
            return None;
        }

        let chunk = Self::PARALLEL_CHUNK.get();
        let squared = source
            .par_chunks(chunk)
            .zip(target.par_chunks(chunk))
            .map(|(source, target)| self.squared_residuals(source, target))
            .sum();

        finish_rms(squared, source.len())
    }

    /// Accumulates squared transformed-source-to-target distances in double precision.
    ///
    /// The slices carry equal lengths, which the `rms_residual` entry points check once. A
    /// non-finite coordinate propagates into the sum, and the callers' finishing step refuses it.
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

/// Reduces an accumulated squared-distance sum to the RMS, rejecting non-finite accumulations.
#[expect(
    clippy::cast_precision_loss,
    reason = "pair counts remain exactly representable in f64 far beyond any corpus"
)]
fn finish_rms(squared: f64, pairs: usize) -> Option<f64> {
    let rms = (squared / pairs as f64).sqrt();

    rms.is_finite().then_some(rms)
}
