//! Weighted Procrustes fitting of a similarity to point correspondences.
//!
//! The closed-form solve consumes seven raw weighted moments that accumulate in one fused pass,
//! four pairs at a time, serially or across rayon workers.

use core::{
    num::NonZero,
    simd::{Mask, Simd, cmp::SimdPartialOrd as _, num::SimdFloat as _},
};

use hashql_core::id::Id;
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelIterator as _, ParallelIterator as _},
    slice::ParallelSlice as _,
};

use super::Similarity;
use crate::math::{
    FinitePointField, Positive,
    dvec2::{DVec2, DVec2x4T},
    rotation::Rotation,
    scalar::narrow_f32,
    vec2::{Vec2, Vec2x4, Vec2x4T},
};

impl Similarity {
    /// Pairs per rayon work item in [`fit_par`](Self::fit_par).
    ///
    /// 4096 pairs read 80 KiB across the three input slices, small enough to stay cache-warm while
    /// large enough that per-task overhead disappears against the fold.
    pub(crate) const PARALLEL_CHUNK: NonZero<usize> = NonZero::new(4096).expect("4096 is not zero");

    /// Fits the weighted orientation-preserving Procrustes alignment of paired points.
    ///
    /// The result is the similarity minimizing the weighted squared error `sum(weights[i] *
    /// |apply(source[i]) - target[i]|^2)` in closed form. The weighted covariance between the centred point sets determines the rotation and scale, and the translation recovers the target centroid from the transformed source centroid. The fold takes four pairs at a time on SIMD lanes and the trailing `len % 4` pairs one at a time, accumulating every sum in double precision before the result narrows to the working `f32` coefficients. Zero-weight pairs leave the fit unchanged. For large inputs, [`fit_par`](Self::fit_par) runs the same accumulation across rayon workers.
    ///
    /// Returns [`None`] when the slice lengths differ, the caller passes fewer than two pairs, any
    /// coordinate or weight is not finite, any weight is negative, the total weight is not a normal
    /// positive number, the weighted source points are coincident, the pairs do not determine an
    /// orientation (the covariance cancels exactly), or the resulting coefficients leave the `f32`
    /// range that [`new`](Self::new) accepts.
    ///
    /// # Examples
    ///
    /// ```ignore
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
    pub(crate) fn fit(source: &[Vec2], target: &[Vec2], weights: &[f32]) -> Option<Self> {
        if source.len() != target.len() || source.len() != weights.len() {
            return None;
        }
        if source.len() < 2 {
            return None;
        }

        FitSums::from_slices(source, target, weights).solve()
    }

    /// Fits the weighted Procrustes alignment of large inputs in parallel.
    ///
    /// The contract is identical to [`fit`](Self::fit), so the same inputs yield [`Some`] and
    /// [`None`] in the same cases. This splits the slices into chunks whose moments accumulate on
    /// rayon workers and combine at the end. Floating-point addition rounds per operation, so the
    /// chunked reduction can differ from [`fit`](Self::fit)'s serial fold by a few units in the
    /// last place.
    ///
    /// The fold is memory-bound, so parallelism pays off from about a hundred thousand pairs. Below
    /// that, [`fit`](Self::fit) is faster.
    ///
    /// Work splits into chunks of [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK) pairs. Use
    /// [`fit_par_with`](Self::fit_par_with) to choose the pairs per chunk.
    #[inline]
    #[must_use]
    pub(crate) fn fit_par(source: &[Vec2], target: &[Vec2], weights: &[f32]) -> Option<Self> {
        Self::fit_par_with(source, target, weights, Self::PARALLEL_CHUNK)
    }

    /// Fits the weighted Procrustes alignment in parallel with a caller-chosen chunk size.
    ///
    /// The contract is identical to [`fit`](Self::fit). Each rayon work item accumulates the
    /// moments of `chunk` pairs. Smaller chunks balance better across uneven core loads, larger
    /// chunks amortize task overhead. [`fit_par`](Self::fit_par) uses
    /// [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK).
    #[must_use]
    pub(crate) fn fit_par_with(
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

        let chunk_size = chunk.get();
        (
            source.par_chunks(chunk_size),
            target.par_chunks(chunk_size),
            weights.par_chunks(chunk_size),
        )
            .into_par_iter()
            .map(|(source, target, weights)| FitSums::from_slices(source, target, weights))
            .reduce_with(FitSums::combine)?
            .solve()
    }

    /// Fits the unweighted Procrustes alignment of paired fields.
    ///
    /// Equivalent to [`fit`](Self::fit) with every weight `1.0`, without materializing a weight
    /// slice. The fields carry the finiteness proof, so the uniform moments accumulate with no
    /// validity scan, and aligning corpus-scale fields costs no allocation.
    ///
    /// Returns [`None`] when the field lengths differ, the caller passes fewer than two pairs,
    /// the source points are coincident, the pairs do not determine an orientation (the
    /// covariance cancels exactly), or the resulting coefficients leave the `f32` range that
    /// [`new`](Self::new) accepts.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// let expected = Similarity::new(0.5, Rotation::from_cos_sin(1.0, 0.0), Vec2::new(3.0, 1.0))
    ///     .expect("scale 0.5 is normal and positive");
    /// let source = [
    ///     Vec2::new(0.0, 0.0),
    ///     Vec2::new(2.0, 0.0),
    ///     Vec2::new(0.0, 4.0),
    /// ];
    /// let target = source.map(|point| expected.apply(point));
    ///
    /// let source = FinitePointField::new(IdSlice::<RowId, _>::from_raw(&source))
    ///     .expect("the sources are finite");
    /// let target = FinitePointField::new(IdSlice::from_raw(&target))
    ///     .expect("exact images of finite points are finite");
    /// let fitted = Similarity::fit_uniform(source, target).expect("the pairs are exact");
    /// assert!((fitted.scale() - expected.scale()).abs() < 1e-5);
    /// ```
    #[must_use]
    pub(crate) fn fit_uniform<I: Id>(
        source: &FinitePointField<I>,
        target: &FinitePointField<I>,
    ) -> Option<Self> {
        if source.len() != target.len() || source.len() < 2 {
            return None;
        }

        FitSums::from_slices_uniform(source.as_raw(), target.as_raw()).solve()
    }

    /// Fits the unweighted Procrustes alignment of large fields in parallel.
    ///
    /// The contract is identical to [`fit_uniform`](Self::fit_uniform). The chunked reduction
    /// carries [`fit_par`](Self::fit_par)'s units-in-the-last-place caveat and the same break-even
    /// near a hundred thousand pairs. Work splits into chunks of
    /// [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK) pairs.
    #[inline]
    #[must_use]
    pub(crate) fn fit_uniform_par<I: Id>(
        source: &FinitePointField<I>,
        target: &FinitePointField<I>,
    ) -> Option<Self> {
        if source.len() != target.len() || source.len() < 2 {
            return None;
        }

        source
            .as_raw()
            .par_chunks(Self::PARALLEL_CHUNK.get())
            .zip(target.as_raw().par_chunks(Self::PARALLEL_CHUNK.get()))
            .map(|(source, target)| FitSums::from_slices_uniform(source, target))
            .reduce_with(FitSums::combine)?
            .solve()
    }
}

/// Validity and weighted raw moments of a run of point pairs, accumulated in double precision.
///
/// One pass over the pairs gathers everything the closed-form Procrustes solve needs;
/// [`combine`](Self::combine) merges the moments of two runs, which makes the accumulation
/// chunkable across SIMD lanes and rayon workers. Both [`Similarity::fit`] and
/// [`Similarity::fit_par`] feed the same [`solve`](Self::solve).
#[derive(Debug, Copy, Clone)]
struct FitSums {
    /// Whether every coordinate is finite and every weight finite and non-negative.
    ///
    /// The weighted pass scans for it; the uniform pass holds it by construction over its
    /// proven-finite fields.
    valid: bool,
    /// The total weight `sum(w)`.
    weight: f64,
    /// The weighted source sum `sum(w · source)`.
    source: DVec2,
    /// The weighted target sum `sum(w · target)`.
    target: DVec2,
    /// The weighted product moment `sum(w · dot(source, target))`.
    dot: f64,
    /// The weighted product moment `sum(w · perp_dot(source, target))`.
    perp_dot: f64,
    /// The weighted source moment `sum(w · |source|^2)`.
    source_norm: f64,
}

impl FitSums {
    /// Accumulates the weighted raw moments of the paired slices.
    ///
    /// The slices carry equal lengths, which the `fit` entry points check once before accumulating.
    /// The fold takes four pairs at a time on double-precision lanes, and the trailing `len % 4`
    /// pairs one at a time.
    fn from_slices(source: &[Vec2], target: &[Vec2], weights: &[f32]) -> Self {
        let (source_batches, source_rest) = source.as_chunks::<4>();
        let (target_batches, target_rest) = target.as_chunks::<4>();
        let (weight_batches, weight_rest) = weights.as_chunks::<4>();

        let mut valid = Mask::<i32, 8>::splat(true);
        let mut weight_sum = Simd::splat(0.0_f64);
        let mut source_sum = DVec2x4T::ZERO;
        let mut target_sum = DVec2x4T::ZERO;
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

            valid &= (source.to_simd().is_finite() & target.to_simd().is_finite())
                & (weight.is_finite() & weight.simd_ge(Simd::splat(0.0))).resize(true);

            // `f32` values widen exactly, and each product of two widened
            // values fits in `f64`'s 53-bit significand, so the batch
            // products and the fused axis accumulations below are exact;
            // only the running additions round. That exactness is what
            // keeps the centred-moment cancellation in `solve` accurate.
            let weight: Simd<f64, 4> = weight.cast();
            let source = DVec2x4T::from(Vec2x4T::from(source));
            let target = DVec2x4T::from(Vec2x4T::from(target));

            weight_sum += weight;
            source_sum = source.mul_add(weight, source_sum);
            target_sum = target.mul_add(weight, target_sum);
            dot_sum += weight * source.dot(target);
            perp_sum += weight * source.perp_dot(target);
            norm_sum += weight * source.length_squared();
        }

        let mut sums = Self {
            valid: valid.all(),
            weight: weight_sum.reduce_sum(),
            source: source_sum.reduce_sum(),
            target: target_sum.reduce_sum(),
            dot: dot_sum.reduce_sum(),
            perp_dot: perp_sum.reduce_sum(),
            source_norm: norm_sum.reduce_sum(),
        };

        for ((&source, &target), &weight) in source_rest.iter().zip(target_rest).zip(weight_rest) {
            sums.valid &=
                weight.is_finite() && weight >= 0.0 && source.is_finite() && target.is_finite();

            let weight = f64::from(weight);
            let source = DVec2::from(source);
            let target = DVec2::from(target);

            sums.weight += weight;
            sums.source = source.mul_add(weight, sums.source);
            sums.target = target.mul_add(weight, sums.target);
            sums.dot = source.dot(target).into_raw().mul_add(weight, sums.dot);
            sums.perp_dot = source
                .perp_dot(target)
                .into_raw()
                .mul_add(weight, sums.perp_dot);
            sums.source_norm = source
                .norm_squared()
                .into_raw()
                .mul_add(weight, sums.source_norm);
        }

        sums
    }

    /// Accumulates the raw moments of the paired slices under uniform unit weights.
    ///
    /// The slices carry equal lengths; the `fit_uniform` entry points check this once before
    /// accumulating. They also arrive from proven-finite fields, so the pass runs no validity
    /// scan and `valid` holds by construction. The total weight is the exact pair count, and
    /// every weighted moment degenerates to its plain sum, so the pass reads two slices instead
    /// of three.
    #[expect(
        clippy::cast_precision_loss,
        reason = "pair counts remain exactly representable in f64 far beyond any corpus"
    )]
    fn from_slices_uniform(source: &[Vec2], target: &[Vec2]) -> Self {
        debug_assert!(
            source.iter().chain(target).all(|point| point.is_finite()),
            "the callers promised proven-finite fields",
        );

        let (source_batches, source_rest) = source.as_chunks::<4>();
        let (target_batches, target_rest) = target.as_chunks::<4>();

        let mut source_sum = DVec2x4T::ZERO;
        let mut target_sum = DVec2x4T::ZERO;
        let mut dot_sum = Simd::splat(0.0_f64);
        let mut perp_sum = Simd::splat(0.0_f64);
        let mut norm_sum = Simd::splat(0.0_f64);
        for (source, target) in source_batches.iter().zip(target_batches) {
            // Widening is exact and each product of two widened values fits in `f64`'s 53-bit
            // significand, exactly as in the weighted pass. Only the running additions round.
            let source = DVec2x4T::from(Vec2x4T::from(Vec2x4::from(*source)));
            let target = DVec2x4T::from(Vec2x4T::from(Vec2x4::from(*target)));

            source_sum += source;
            target_sum += target;
            dot_sum += source.dot(target);
            perp_sum += source.perp_dot(target);
            norm_sum += source.length_squared();
        }

        let mut sums = Self {
            valid: true,
            weight: source.len() as f64,
            source: source_sum.reduce_sum(),
            target: target_sum.reduce_sum(),
            dot: dot_sum.reduce_sum(),
            perp_dot: perp_sum.reduce_sum(),
            source_norm: norm_sum.reduce_sum(),
        };

        for (&source, &target) in source_rest.iter().zip(target_rest) {
            let source = DVec2::from(source);
            let target = DVec2::from(target);

            sums.source += source;
            sums.target += target;
            sums.dot += source.dot(target).into_raw();
            sums.perp_dot += source.perp_dot(target).into_raw();
            sums.source_norm += source.norm_squared().into_raw();
        }

        sums
    }

    /// Merges the moments of two runs of pairs.
    ///
    /// Floating-point addition rounds per operation, so combining chunked sums can differ from one
    /// serial fold over the concatenated runs by units in the last place.
    const fn combine(self, other: Self) -> Self {
        Self {
            valid: self.valid && other.valid,
            weight: self.weight + other.weight,
            source: self.source + other.source,
            target: self.target + other.target,
            dot: self.dot + other.dot,
            perp_dot: self.perp_dot + other.perp_dot,
            source_norm: self.source_norm + other.source_norm,
        }
    }

    /// Solves the closed-form Procrustes alignment from the accumulated moments.
    ///
    /// Returns [`None`] under exactly the data-dependent rejection cases documented on
    /// [`Similarity::fit`]: an invalid coordinate or weight, a non-normal total weight,
    /// weight-coincident source points, an exactly cancelling covariance, or coefficients leaving
    /// the range [`Similarity::new`] accepts.
    fn solve(self) -> Option<Similarity> {
        if !self.valid || !self.weight.is_normal() {
            return None;
        }

        let source_centroid = self.source / self.weight;
        let target_centroid = self.target / self.weight;

        // Centered moments follow from the raw ones by the parallel-axis
        // identity. With `W = sum(w)`, `ms = sum(w s)`, `mt = sum(w t)`,
        // and centroids `cs = ms / W`, `ct = mt / W`, expanding each
        // centred product leaves cross terms that all collapse into one
        // correction because `sum(w (s - cs)) = 0`:
        //   sum(w dot(s - cs, t - ct))  = sum(w dot(s, t))  - dot(ms, mt) / W
        //   sum(w perp(s - cs, t - ct)) = sum(w perp(s, t)) - perp(ms, mt) / W
        //   sum(w |s - cs|^2)           = sum(w |s|^2)      - |ms|^2 / W
        // This fuses centring into the single accumulation pass shared
        // by the serial and parallel fits.
        let dot = self.dot - self.source.dot(self.target).into_raw() / self.weight;
        let perp_dot = self.perp_dot - self.source.perp_dot(self.target).into_raw() / self.weight;
        let variance = self.source_norm - self.source.norm_squared().into_raw() / self.weight;

        // Coincident (up to weight) source points give no scale. The identity's cancellation can
        // round a mathematically zero variance below zero, which the sign check rejects together
        // with the non-normal cases.
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
        let rotated = DVec2::new(
            cos.mul_add(source_centroid.x(), -sin * source_centroid.y()),
            sin.mul_add(source_centroid.x(), cos * source_centroid.y()),
        );
        let translation = rotated.mul_add(-scale, target_centroid);

        Similarity::new(
            Positive::new(narrow_f32(scale)?)?,
            Rotation::from_cos_sin(narrow_f32(cos)?, narrow_f32(sin)?),
            translation.narrow()?,
        )
    }
}
