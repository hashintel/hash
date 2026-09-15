//! Weighted Procrustes alignment from point-pair moments.
//!
//! For points pᵢ, qᵢ ∈ ℝ² and weights wᵢ ≥ 0, the model minimizes E(a, θ, t) = Σᵢ wᵢ‖aRθpᵢ + t −
//! qᵢ‖² over scale a > 0, rotation angle θ and translation t ∈ ℝ². Let W = Σᵢ wᵢ > 0, p̄ = Σᵢ wᵢpᵢ /
//! W and q̄ = Σᵢ wᵢqᵢ / W. Centring gives uᵢ = pᵢ − p̄ and vᵢ = qᵢ − q̄, with moments V = Σᵢ wᵢ‖uᵢ‖²,
//! D = Σᵢ wᵢ⟨uᵢ, vᵢ⟩ and H = Σᵢ wᵢ(uᵢₓvᵢᵧ − uᵢᵧvᵢₓ).
//!
//! The best translation is t = q̄ − aRθp̄. After substitution, the scale-and-angle terms are a²V −
//! 2a(D cos θ + H sin θ). For V > 0 and C = √(D² + H²) > 0, the minimizing coefficients are a =
//! C/V, cos θ = D/C and sin θ = H/C. Raw moments recover the centred quantities in one pass,
//! avoiding a second read of the inputs.
//!
//! Accumulation and centring use `f64`, followed by narrowing to `f32` coefficients. Subtracting
//! raw moments can lose small variances or covariances, especially with large offsets or uneven
//! weights. The computed solution and its rejection tests are approximations to this
//! real-arithmetic model. Parallel reduction changes the grouping and can change both coefficients
//! and acceptance.

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
    nz,
    rotation::Rotation,
    scalar::narrow_f32,
    vec2::{Vec2, Vec2x4, Vec2x4T},
};

impl Similarity {
    /// Pairs per rayon work item in [`fit_par`](Self::fit_par).
    ///
    /// A full chunk reads 80 KiB of point and weight data: 4096 pairs at two 8-byte points and one
    /// 4-byte weight per pair. [`fit_par_with`](Self::fit_par_with) accepts a different chunk size.
    pub(crate) const PARALLEL_CHUNK: NonZero<usize> = nz!(4096);

    /// Estimates the weighted Procrustes alignment of paired points.
    ///
    /// The weighted covariance determines rotation and scale, and the translation maps the source
    /// centroid to the target centroid, following the [Procrustes
    /// model](crate::math::similarity::fit). The fold accumulates four pairs at a time in `f64`
    /// SIMD lanes, then handles the trailing pairs individually. The fitted coefficients narrow to
    /// `f32`. Use [`fit_par`](Self::fit_par) for parallel accumulation.
    ///
    /// A finite zero-weight pair contributes zero to the mathematical objective, but its
    /// coordinates are still validated. Adding or removing such pairs can change the fold's
    /// grouping and rounding. Raw-moment cancellation can also make a nondegenerate fit fail or
    /// degrade its accuracy.
    ///
    /// Returns [`None`] for unequal slice lengths or fewer than two pairs. The accumulated data is
    /// rejected if any coordinate or weight is non-finite or any weight is negative. The computed
    /// total weight, source variance and covariance magnitude must be normal, with positive source
    /// variance. Finally, all fitted coefficients must narrow to finite `f32` values and satisfy
    /// [`new`](Self::new), including its rotation norm tolerance. These numerical tests do not
    /// certify the exact rank or conditioning of the input.
    ///
    /// # Complexity
    ///
    /// O(n) time and constant additional storage for n pairs.
    ///
    /// # Example
    ///
    /// This example is ignored because [`Similarity`] is crate-private.
    ///
    /// ```ignore
    /// use crate::math::{Similarity, Rotation, Vec2, positive};
    ///
    /// let expected =
    ///     Similarity::new(positive!(2.0), Rotation::from_cos_sin(0.0, 1.0), Vec2::new(1.0, -2.0))
    ///         .expect("scale 2.0 is normal and positive");
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
    /// This uses [`fit`](Self::fit)'s model, input checks and coefficient-range checks. Chunked
    /// accumulation changes floating-point grouping and may change whether the computed moments
    /// pass validation. No fixed ULP bound relates the parallel result to the serial fit, and
    /// results are not promised to be bit-reproducible across parallel reductions.
    ///
    /// Parallel work is O(n) for n pairs. Benchmark the serial and parallel forms on the intended
    /// input sizes and hardware before choosing a crossover.
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
    /// This has [`fit_par`](Self::fit_par)'s model and numerical limits. Each work item accumulates
    /// at most `chunk` pairs. Smaller chunks offer more scheduling units, while larger chunks
    /// reduce the number of moment merges. Chunk size can affect both rounding and acceptance.
    /// [`fit_par`](Self::fit_par) uses [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK).
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
    /// This uses [`fit`](Self::fit)'s unit-weight model without materializing a weight slice.
    /// [`FinitePointField`] establishes coordinate finiteness. The fold takes O(n) time and
    /// constant additional storage, with no heap allocation.
    ///
    /// Returns [`None`] for unequal field lengths or fewer than two pairs, or when the computed
    /// moments or narrowed coefficients fail [`fit`](Self::fit)'s numerical checks. Arithmetic
    /// grouping can differ from the weighted implementation even with unit weights.
    ///
    /// # Example
    ///
    /// This example is ignored because the fitting API is crate-private and test-only.
    ///
    /// ```ignore
    /// use hashql_core::id::IdSlice;
    /// use crate::math::{FinitePointField, Similarity, Rotation, Vec2, positive};
    /// # hashql_core::id::newtype! { struct RowId(u32) }
    ///
    /// let expected =
    ///     Similarity::new(positive!(0.5), Rotation::from_cos_sin(1.0, 0.0), Vec2::new(3.0, 1.0))
    ///         .expect("scale 0.5 is normal and positive");
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
    #[cfg(test)] // The similarity and transform tests fit small exact fixtures serially.
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
    /// This uses [`fit_par`](Self::fit_par)'s model and numerical checks with unit weights.
    /// [`FinitePointField`] establishes coordinate finiteness, and no weight slice is allocated.
    /// Returns [`None`] for unequal lengths, fewer than two pairs or failed moment/coefficient
    /// checks. Work splits into chunks of [`PARALLEL_CHUNK`](Self::PARALLEL_CHUNK) pairs, with the
    /// same grouping-dependent rounding and acceptance as the weighted parallel form.
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

/// Input validity and `f64` raw moments for a Procrustes solve.
///
/// One pass gathers the weighted point sums, source norm and source-target products.
/// [`combine`](Self::combine) adds partial moments for chunked accumulation. [`solve`](Self::solve)
/// centres them and computes the coefficients.
#[derive(Debug, Copy, Clone)]
struct FitSums {
    /// Whether every coordinate is finite and every weight finite and non-negative.
    ///
    /// Uniform accumulation requires finite points and uses unit weights.
    valid: bool,
    /// The total weight Σᵢ wᵢ.
    weight: f64,
    /// The weighted source sum Σᵢ wᵢpᵢ.
    source: DVec2,
    /// The weighted target sum Σᵢ wᵢqᵢ.
    target: DVec2,
    /// The weighted dot-product moment Σᵢ wᵢ⟨pᵢ, qᵢ⟩.
    dot: f64,
    /// The weighted signed-area moment Σᵢ wᵢ(pᵢₓqᵢᵧ − pᵢᵧqᵢₓ).
    perp_dot: f64,
    /// The weighted squared-source-norm moment Σᵢ wᵢ‖pᵢ‖².
    source_norm: f64,
}

impl FitSums {
    /// Accumulates the weighted raw moments of the paired slices.
    ///
    /// The slices must have equal lengths. The fold handles four pairs at a time on
    /// double-precision lanes, then the trailing `len % 4` pairs individually. Invalid coordinates
    /// or weights set [`valid`](Self::valid) to false.
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

            // Finite f32 values widen exactly. Products of two such values need at most 48
            // significand bits and fit f64's exponent range. Dot products and squared norms add two
            // products and can round. Weighting those results introduces another product, and every
            // running accumulation can round. Double precision reduces these errors but does not
            // prevent cancellation during centring.
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
    /// Both slices must have equal lengths and finite coordinates. Unit weights remove the weight
    /// reads and multiplications. The total weight is the pair count converted to `f64`, which can
    /// round above 2⁵³.
    #[expect(
        clippy::cast_precision_loss,
        reason = "deliberately convert the pair count for double-precision arithmetic"
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
            // Finite f32 products are exact in f64. The within-pair dot/norm sums and the running
            // additions can still round.
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
    /// The validity flags are conjoined and each moment is added in `f64`. Grouping changes
    /// rounding, which the centring subtraction can amplify.
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
    /// Returns [`None`] when the accumulated validity flag, computed moments or narrowed
    /// coefficients fail the numerical checks described by [`Similarity::fit`]. Pair-count and
    /// slice-length checks belong to the fitting entry points.
    fn solve(self) -> Option<Similarity> {
        if !self.valid || !self.weight.is_normal() {
            return None;
        }

        let source_centroid = self.source / self.weight;
        let target_centroid = self.target / self.weight;

        // In real arithmetic, weighted centred deviations sum to zero. With mₚ = Σᵢ wᵢpᵢ and m_q =
        // Σᵢ wᵢqᵢ, expanding each centred product leaves one correction:
        //
        // D = Σᵢ wᵢ⟨pᵢ, qᵢ⟩ − ⟨mₚ, m_q⟩ / W.
        //
        // H = Σᵢ wᵢ(pᵢₓqᵢᵧ − pᵢᵧqᵢₓ) − (mₚₓm_qᵧ − mₚᵧm_qₓ) / W.
        //
        // V = Σᵢ wᵢ‖pᵢ‖² − ‖mₚ‖² / W.
        //
        // Therefore raw moments suffice for the centred solve without a second input pass. The
        // implemented subtraction uses rounded moments and can lose small differences.
        let dot = self.dot - self.source.dot(self.target).into_raw() / self.weight;
        let perp_dot = self.perp_dot - self.source.perp_dot(self.target).into_raw() / self.weight;
        let variance = self.source_norm - self.source.norm_squared().into_raw() / self.weight;

        // Positive source variance determines the scale denominator. Cancellation can give a
        // nonpositive computed value for distinct weighted points, or a positive value for a
        // mathematically zero variance. This tests the computed denominator, not exact
        // nondegeneracy.
        if !variance.is_normal() || variance <= 0.0 {
            return None;
        }
        // a nonzero covariance magnitude determines orientation in the real-arithmetic model
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
