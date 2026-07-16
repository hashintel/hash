//! Weighted Procrustes fitting of a similarity to point
//! correspondences.
//!
//! The closed-form solve consumes seven raw weighted moments that
//! accumulate in one fused pass, four pairs at a time, serially or
//! across rayon workers.

use core::{
    num::NonZero,
    simd::{Simd, cmp::SimdPartialOrd as _, num::SimdFloat as _},
};

use rayon::{
    iter::{IndexedParallelIterator as _, ParallelIterator as _},
    slice::ParallelSlice as _,
};

use super::Similarity;
use crate::math::{
    rotation::Rotation,
    scalar::narrow_f32,
    vec2::{Vec2, Vec2x4, Vec2x4T},
};

impl Similarity {
    /// Pairs per rayon work item in [`fit_par`](Self::fit_par).
    ///
    /// 4096 pairs read 80 KiB across the three input slices, small enough
    /// to stay cache-warm while large enough that per-task overhead
    /// disappears against the fold.
    pub const PARALLEL_CHUNK: NonZero<usize> = NonZero::new(4096).expect("4096 is not zero");

    /// Fits the weighted orientation-preserving Procrustes alignment of
    /// paired points.
    ///
    /// The result is the similarity minimizing the weighted squared
    /// error `sum(weights[i] * |apply(source[i]) - target[i]|^2)`, in
    /// closed form: the weighted covariance between the centered point
    /// sets determines the rotation and scale, and the translation
    /// recovers the target centroid from the transformed source
    /// centroid. Pairs are folded four at a time with SIMD lanes, the
    /// trailing `len % 4` pairs are handled scalar, and every sum is
    /// accumulated in double precision before the result narrows to the
    /// working `f32` coefficients. Zero-weight pairs leave the fit
    /// unchanged. For large inputs, [`fit_par`](Self::fit_par) runs the
    /// same accumulation across rayon workers.
    ///
    /// Returns [`None`] when the slice lengths differ, fewer than two
    /// pairs are given, any coordinate or weight is not finite, any
    /// weight is negative, the total weight is not a normal positive
    /// number, the weighted source points are coincident, the pairs do
    /// not determine an orientation (the covariance cancels exactly), or
    /// the resulting coefficients leave the `f32` range that
    /// [`new`](Self::new) accepts.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::{Rotation, Similarity, Vec2};
    ///
    /// let expected = Similarity::new(2.0, Rotation::from_cos_sin(0.0, 1.0), Vec2::new(1.0, -2.0))
    ///     .expect("scale 2.0 is normal and positive");
    /// let source = [
    ///     Vec2::new(0.0, 0.0),
    ///     Vec2::new(4.0, 0.0),
    ///     Vec2::new(0.0, 2.0),
    /// ];
    /// let target = source.map(|point| expected.apply(point));
    ///
    /// let fitted = Similarity::fit(&source, &target, &[1.0; 3]).expect("the pairs are exact");
    /// assert!((fitted.scale() - expected.scale()).abs() < 1e-5);
    /// ```
    #[must_use]
    pub fn fit(source: &[Vec2], target: &[Vec2], weights: &[f32]) -> Option<Self> {
        if source.len() != target.len() || source.len() != weights.len() {
            return None;
        }
        if source.len() < 2 {
            return None;
        }

        FitSums::from_slices(source, target, weights).solve()
    }

    /// Fits the weighted Procrustes alignment of large inputs in
    /// parallel.
    ///
    /// The contract is identical to [`fit`](Self::fit): the same inputs
    /// yield [`Some`] and [`None`] in the same cases. The slices are
    /// split into chunks whose moments accumulate on rayon workers and
    /// combine at the end; floating-point addition rounds per operation,
    /// so the chunked reduction can differ from [`fit`](Self::fit)'s
    /// serial fold by a few units in the last place.
    ///
    /// The fold is memory-bound, so parallelism pays off from roughly a
    /// hundred thousand pairs; below that, [`fit`](Self::fit) is faster.
    ///
    /// Work splits into chunks of
    /// [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK) pairs; use
    /// [`fit_par_with`](Self::fit_par_with) to tune the granularity.
    #[inline]
    #[must_use]
    pub fn fit_par(source: &[Vec2], target: &[Vec2], weights: &[f32]) -> Option<Self> {
        Self::fit_par_with(source, target, weights, Self::PARALLEL_CHUNK)
    }

    /// Fits the weighted Procrustes alignment in parallel with a
    /// caller-chosen chunk granularity.
    ///
    /// The contract is identical to [`fit`](Self::fit). Each rayon work
    /// item accumulates the moments of `chunk` pairs; smaller chunks
    /// balance better across uneven core loads, larger chunks amortize
    /// task overhead. [`fit_par`](Self::fit_par) uses
    /// [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK).
    #[must_use]
    pub fn fit_par_with(
        source: &[Vec2],
        target: &[Vec2],
        weights: &[f32],
        chunk: NonZero<usize>,
    ) -> Option<Self> {
        if source.len() != target.len() || source.len() != weights.len() {
            return None;
        }
        if source.len() < 2 {
            return None;
        }

        source
            .par_chunks(chunk.get())
            .zip(target.par_chunks(chunk.get()))
            .zip(weights.par_chunks(chunk.get()))
            .map(|((source, target), weights)| FitSums::from_slices(source, target, weights))
            .reduce_with(FitSums::combine)?
            .solve()
    }
}

/// Validity and weighted raw moments of a run of point pairs, accumulated
/// in double precision.
///
/// One pass over the pairs gathers everything the closed-form Procrustes
/// solve needs; [`combine`](Self::combine) merges the moments of two
/// runs, which makes the accumulation chunkable across SIMD lanes and
/// rayon workers. Both [`Similarity::fit`] and [`Similarity::fit_par`]
/// feed the same [`solve`](Self::solve).
#[derive(Debug, Copy, Clone)]
struct FitSums {
    /// Whether every coordinate is finite and every weight finite and
    /// non-negative.
    valid: bool,
    /// The total weight `sum(w)`.
    weight: f64,
    /// The weighted source sum `sum(w * source)` per axis.
    source: [f64; 2],
    /// The weighted target sum `sum(w * target)` per axis.
    target: [f64; 2],
    /// The weighted product moment `sum(w * dot(source, target))`.
    dot: f64,
    /// The weighted product moment `sum(w * perp_dot(source, target))`.
    perp_dot: f64,
    /// The weighted source moment `sum(w * |source|^2)`.
    source_norm: f64,
}

impl FitSums {
    /// Accumulates the weighted raw moments of the paired slices.
    ///
    /// The slices carry equal lengths; the `fit` entry points check this
    /// once before accumulating. Pairs are folded four at a time on
    /// double-precision lanes, with the trailing `len % 4` pairs handled
    /// scalar.
    fn from_slices(source: &[Vec2], target: &[Vec2], weights: &[f32]) -> Self {
        let (source_batches, source_rest) = source.as_chunks::<4>();
        let (target_batches, target_rest) = target.as_chunks::<4>();
        let (weight_batches, weight_rest) = weights.as_chunks::<4>();

        let mut valid = true;
        let mut weight_sum = Simd::splat(0.0_f64);
        let mut source_sum = [Simd::splat(0.0_f64); 2];
        let mut target_sum = [Simd::splat(0.0_f64); 2];
        let mut dot_sum = Simd::splat(0.0_f64);
        let mut perp_sum = Simd::splat(0.0_f64);
        let mut norm_sum = Simd::splat(0.0_f64);
        for ((source, target), weight) in source_batches
            .iter()
            .zip(target_batches)
            .zip(weight_batches)
        {
            let source = Vec2x4::from(*source);
            let target = Vec2x4::from(*target);
            let weight = Simd::from_array(*weight);

            valid &= source.to_simd().is_finite().all()
                && target.to_simd().is_finite().all()
                && weight.is_finite().all()
                && weight.simd_ge(Simd::splat(0.0)).all();

            // `f32` values widen exactly, and each product of two widened
            // values fits in `f64`'s 53-bit significand, so the plain
            // lane multiplies below are exact; only the running additions
            // round. That exactness is what keeps the centered-moment
            // cancellation in `solve` accurate.
            let weight: Simd<f64, 4> = weight.cast();
            let source = Vec2x4T::from(source);
            let target = Vec2x4T::from(target);
            let source = [source.xs().cast::<f64>(), source.ys().cast::<f64>()];
            let target = [target.xs().cast::<f64>(), target.ys().cast::<f64>()];

            weight_sum += weight;
            source_sum[0] += weight * source[0];
            source_sum[1] += weight * source[1];
            target_sum[0] += weight * target[0];
            target_sum[1] += weight * target[1];
            dot_sum += weight * (source[0] * target[0] + source[1] * target[1]);
            perp_sum += weight * (source[0] * target[1] - source[1] * target[0]);
            norm_sum += weight * (source[0] * source[0] + source[1] * source[1]);
        }

        let mut sums = Self {
            valid,
            weight: weight_sum.reduce_sum(),
            source: [source_sum[0].reduce_sum(), source_sum[1].reduce_sum()],
            target: [target_sum[0].reduce_sum(), target_sum[1].reduce_sum()],
            dot: dot_sum.reduce_sum(),
            perp_dot: perp_sum.reduce_sum(),
            source_norm: norm_sum.reduce_sum(),
        };

        for ((&source, &target), &weight) in source_rest.iter().zip(target_rest).zip(weight_rest) {
            sums.valid &=
                weight.is_finite() && weight >= 0.0 && source.is_finite() && target.is_finite();

            let weight = f64::from(weight);
            let source = [f64::from(source.x()), f64::from(source.y())];
            let target = [f64::from(target.x()), f64::from(target.y())];

            sums.weight += weight;
            sums.source[0] = weight.mul_add(source[0], sums.source[0]);
            sums.source[1] = weight.mul_add(source[1], sums.source[1]);
            sums.target[0] = weight.mul_add(target[0], sums.target[0]);
            sums.target[1] = weight.mul_add(target[1], sums.target[1]);
            sums.dot = weight.mul_add(
                source[0].mul_add(target[0], source[1] * target[1]),
                sums.dot,
            );
            sums.perp_dot = weight.mul_add(
                source[0].mul_add(target[1], -(source[1] * target[0])),
                sums.perp_dot,
            );
            sums.source_norm = weight.mul_add(
                source[0].mul_add(source[0], source[1] * source[1]),
                sums.source_norm,
            );
        }

        sums
    }

    /// Merges the moments of two runs of pairs.
    ///
    /// Floating-point addition rounds per operation, so combining chunked
    /// sums can differ from one serial fold over the concatenated runs by
    /// units in the last place.
    const fn combine(self, other: Self) -> Self {
        Self {
            valid: self.valid && other.valid,
            weight: self.weight + other.weight,
            source: [
                self.source[0] + other.source[0],
                self.source[1] + other.source[1],
            ],
            target: [
                self.target[0] + other.target[0],
                self.target[1] + other.target[1],
            ],
            dot: self.dot + other.dot,
            perp_dot: self.perp_dot + other.perp_dot,
            source_norm: self.source_norm + other.source_norm,
        }
    }

    /// Solves the closed-form Procrustes alignment from the accumulated
    /// moments.
    ///
    /// Returns [`None`] under exactly the data-dependent rejection cases
    /// documented on [`Similarity::fit`]: an invalid coordinate or
    /// weight, a non-normal total weight, weight-coincident source
    /// points, an exactly cancelling covariance, or coefficients leaving
    /// the range [`Similarity::new`] accepts.
    fn solve(self) -> Option<Similarity> {
        if !self.valid || !self.weight.is_normal() {
            return None;
        }

        let source_centroid = [self.source[0] / self.weight, self.source[1] / self.weight];
        let target_centroid = [self.target[0] / self.weight, self.target[1] / self.weight];

        // Centered moments follow from the raw ones by the parallel-axis
        // identity. With `W = sum(w)`, `ms = sum(w s)`, `mt = sum(w t)`,
        // and centroids `cs = ms / W`, `ct = mt / W`, expanding each
        // centered product leaves cross terms that all collapse into one
        // correction because `sum(w (s - cs)) = 0`:
        //   sum(w dot(s - cs, t - ct))  = sum(w dot(s, t))  - dot(ms, mt) / W
        //   sum(w perp(s - cs, t - ct)) = sum(w perp(s, t)) - perp(ms, mt) / W
        //   sum(w |s - cs|^2)           = sum(w |s|^2)      - |ms|^2 / W
        // This fuses centering into the single accumulation pass shared
        // by the serial and parallel fits.
        let dot = self.dot
            - self.source[0].mul_add(self.target[0], self.source[1] * self.target[1]) / self.weight;
        let perp_dot = self.perp_dot
            - self.source[0].mul_add(self.target[1], -(self.source[1] * self.target[0]))
                / self.weight;
        let variance = self.source_norm
            - self.source[0].mul_add(self.source[0], self.source[1] * self.source[1]) / self.weight;

        // Coincident (up to weight) source points give no scale. The
        // identity's cancellation can round a mathematically zero
        // variance to a tiny negative value, which the sign check rejects
        // together with the non-normal cases.
        if !variance.is_normal() || variance <= 0.0 {
            return None;
        }
        // An exactly cancelling covariance gives no orientation.
        let covariance = dot.hypot(perp_dot);
        if !covariance.is_normal() {
            return None;
        }

        let scale = covariance / variance;
        let cos = dot / covariance;
        let sin = perp_dot / covariance;
        let rotated = [
            cos.mul_add(source_centroid[0], -sin * source_centroid[1]),
            sin.mul_add(source_centroid[0], cos * source_centroid[1]),
        ];

        Similarity::new(
            narrow_f32(scale)?,
            Rotation::from_cos_sin(narrow_f32(cos)?, narrow_f32(sin)?),
            Vec2::new(
                narrow_f32(scale.mul_add(-rotated[0], target_centroid[0]))?,
                narrow_f32(scale.mul_add(-rotated[1], target_centroid[1]))?,
            ),
        )
    }
}
