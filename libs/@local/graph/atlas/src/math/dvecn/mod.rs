//! Double-precision `N`-dimensional vectors and their reductions.
//!
//! [`DVecN`] supports arithmetic and stable reductions in double precision. [`BoxedDVecN`] owns
//! heap storage aligned for [`f64x8`], exposed through [`AlignedDVecN`] views. Use it for large
//! vectors that need in-place initialization or aligned lane access.
//!
//! The reductions use floating-point sums with rounding at each accumulation step. Aligned and
//! ordinary views use matching lane groups, but portable-SIMD horizontal reductions do not
//! establish a cross-target or cross-build bit-identity guarantee.

use alloc::alloc::Global;
use core::{
    alloc::{AllocError, Allocator, Layout},
    ops::{Deref, DerefMut, DivAssign, MulAssign},
    ptr::{self, NonNull},
    simd::{Mask, Simd, f32x8, f64x8, num::SimdFloat as _},
};

use super::{
    derivation::Derivation,
    kernel::{exp_f64x4, mul_add_f64x8},
    scalar::{DFinite, DNonNegative},
    vecn::{AlignedVecN, VecN},
};

#[cfg(test)]
mod tests;

/// An `N`-dimensional vector of `f64` components.
///
/// A [`DVecN`] is guaranteed to have the same layout as an array of `N` `f64` components. Borrow
/// arrays in place through [`from_ref`](Self::from_ref) and [`from_mut`](Self::from_mut), without
/// copying.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{DVecN};
///
/// let logits = DVecN::new([2.0, 1.0, -1.0]);
///
/// let probabilities = logits.softmax();
/// let total: f64 = probabilities.as_array().iter().sum();
/// assert!((total - 1.0).abs() < 1e-12);
/// ```
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct DVecN<const N: usize>([f64; N]);

impl<const N: usize> DVecN<N> {
    /// Creates a vector that owns its components.
    #[inline]
    #[must_use]
    pub const fn new(components: [f64; N]) -> Self {
        Self(components)
    }

    /// Wraps a borrowed array in place, without copying.
    #[inline]
    #[must_use]
    pub const fn from_ref(value: &[f64; N]) -> &Self {
        zerocopy::transmute_ref!(value)
    }

    /// Wraps a mutably borrowed array in place, without copying.
    #[inline]
    #[must_use]
    pub const fn from_mut(value: &mut [f64; N]) -> &mut Self {
        let ptr = (&raw mut *value).cast::<Self>();
        // SAFETY: repr(transparent) preserves the array's layout and validity. The input reference
        // supplies initialized components, alignment and exclusive access, and the cast retains its
        // provenance and lifetime. Therefore the same array may be borrowed mutably as Self.
        unsafe { &mut *ptr }
    }

    /// Returns the components as an array reference.
    #[inline]
    #[must_use]
    pub const fn as_array(&self) -> &[f64; N] {
        &self.0
    }

    /// Returns the largest component.
    ///
    /// Ignores NaN components, following [`f64::max`]. Returns [`f64::NEG_INFINITY`] for an empty
    /// vector or one containing only NaNs.
    #[inline]
    #[must_use]
    pub fn max(self) -> f64 {
        let (chunks, remainder) = self.0.as_chunks::<4>();

        let folded = chunks
            .iter()
            .fold(Simd::splat(f64::NEG_INFINITY), |maxima, &chunk| {
                maxima.simd_max(Simd::from_array(chunk))
            })
            .reduce_max();

        remainder
            .iter()
            .fold(folded, |maximum, &value| maximum.max(value))
    }

    /// Returns the sum of the components.
    ///
    /// The fold consumes four lanes at a time. The sum of the empty vector is zero.
    #[inline]
    #[must_use]
    pub fn sum(self) -> f64 {
        let (chunks, remainder) = self.0.as_chunks::<4>();

        let folded = chunks
            .iter()
            .fold(Simd::splat(0.0), |sums, &chunk| {
                sums + Simd::from_array(chunk)
            })
            .reduce_sum();

        remainder.iter().fold(folded, |sum, &value| sum + value)
    }

    /// Computes the softmax of the components with max-shifting for stability.
    ///
    /// For finite components xᵢ, let m = maxᵢ xᵢ and eᵢ = exp(xᵢ − m). The result approximates eᵢ /
    /// Σⱼ eⱼ. Max-shifting keeps the exponential arguments nonpositive, avoiding overflow from
    /// exponentiating a large positive component directly. Outputs lie in `[0, 1]` and sum to one
    /// up to rounding. For `N = 0` the result is empty.
    ///
    /// Adding a common constant preserves the real-valued formula. In floating-point arithmetic, a
    /// large shift can round distinct components to the same value and change the distribution.
    /// Non-finite inputs can produce NaN outputs.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{DVecN};
    ///
    /// // A naive `exp(1000.0)` overflows. The shifted form stays finite.
    /// let probabilities = DVecN::new([1_000.0, 999.0, -1_000.0]).softmax();
    ///
    /// let total: f64 = probabilities.as_array().iter().sum();
    /// assert!((total - 1.0).abs() < 1e-12);
    /// assert!(probabilities.as_array()[0] > probabilities.as_array()[1]);
    /// ```
    #[inline]
    #[must_use]
    pub fn softmax(self) -> Self {
        let (exponentials, denominator) = self.shifted_exponentials(self.max());

        exponentials.scaled(denominator.recip())
    }

    /// Computes `ln(sum(exp(components)))` with max-shifting for stability.
    ///
    /// The computation factors out the maximum as `max + ln(sum(exp(value - max)))`, keeping every
    /// intermediate exponent non-positive: the result is finite for any finite, non-empty
    /// input. A single-component vector returns that component exactly, and `N` equal
    /// components give `value + ln(N)`. For `N = 0` the result is [`f64::NEG_INFINITY`], the
    /// logarithm of the empty sum.
    ///
    /// # Example
    ///
    /// This in-crate example is ignored because the module is private.
    ///
    /// ```ignore
    /// use crate::math::{DVecN};
    ///
    /// // A naive `exp(1000.0)` overflows. The shifted form stays finite.
    /// let result = DVecN::new([1_000.0, 1_000.0]).log_sum_exp();
    /// assert!((result - (1_000.0 + 2.0_f64.ln())).abs() < 1e-9);
    ///
    /// assert_eq!(DVecN::new([3.5]).log_sum_exp(), 3.5);
    /// ```
    #[inline]
    #[must_use]
    pub fn log_sum_exp(self) -> f64 {
        let maximum = self.max();
        let (_, sum) = self.shifted_exponentials(maximum);

        // For an empty vector, the maximum is −∞ and the exponential sum is zero. The final
        // expression is −∞ + ln(0) = −∞, the logarithm of the empty sum.
        maximum + sum.ln()
    }

    /// Computes `exp(component - shift)` for every component and their sum in a single pass.
    ///
    /// Uses [`exp_f64x4`] for complete four-lane groups and [`f64::exp`] for the scalar remainder.
    /// These approximations can round differently.
    #[inline]
    #[must_use]
    fn shifted_exponentials(mut self, shift: f64) -> (Self, f64) {
        let offset = Simd::splat(shift);
        let (chunks, remainder) = self.0.as_chunks_mut::<4>();

        let mut sums = Simd::splat(0.0);
        for chunk in chunks {
            let exponentials = exp_f64x4(Simd::from_array(*chunk) - offset);
            sums += exponentials;
            *chunk = exponentials.to_array();
        }

        let mut sum = sums.reduce_sum();
        for component in remainder {
            let exponential = (*component - shift).exp();
            sum += exponential;
            *component = exponential;
        }

        (self, sum)
    }

    /// Accumulates the dot product in two interleaved eight-lane groups.
    ///
    /// Fused products accumulate per lane, followed by a horizontal sum and a fused scalar tail.
    /// See [`VecN::dot_wide`] for the mixed-precision variant over `f32` data.
    // the independent accumulators reduce serial dependence between successive lane-group updates
    #[inline]
    fn dot_impl(&self, other: &Self) -> f64 {
        let (chunks_left, remainder_left) = self.0.as_chunks::<8>();
        let (chunks_right, remainder_right) = other.0.as_chunks::<8>();

        debug_assert_eq!(chunks_left.len(), chunks_right.len());
        debug_assert_eq!(remainder_left.len(), remainder_right.len());

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, (left, right)) in chunks_left.iter().zip(chunks_right).enumerate() {
            let lane = index & 1;
            accumulators[lane] = mul_add_f64x8(
                f64x8::from_array(*left),
                f64x8::from_array(*right),
                accumulators[lane],
            );
        }

        let mut sum = (accumulators[0] + accumulators[1]).reduce_sum();
        for (&left, &right) in remainder_left.iter().zip(remainder_right) {
            sum = left.mul_add(right, sum);
        }

        sum
    }

    /// Returns the dot product of the two vectors.
    ///
    /// Returns an unvalidated [`Derivation`]. Products and sums of arbitrary `f64` components can
    /// be non-finite.
    #[inline]
    pub(crate) fn dot(&self, other: &Self) -> Derivation<DFinite> {
        Derivation::raw(self.dot_impl(other))
    }

    /// Returns the squared Euclidean length.
    #[inline]
    pub(crate) fn norm_squared(&self) -> Derivation<DNonNegative> {
        Derivation::raw(self.dot_impl(self))
    }

    /// Returns the sum of the components' absolute values: the l1 norm.
    #[inline]
    #[must_use]
    pub fn abs_sum(&self) -> f64 {
        let (chunks, remainder) = self.0.as_chunks::<8>();

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, chunk) in chunks.iter().enumerate() {
            let lane = index & 1;
            accumulators[lane] += f64x8::from_array(*chunk).abs();
        }

        let mut sum = (accumulators[0] + accumulators[1]).reduce_sum();
        for &component in remainder {
            sum += component.abs();
        }

        sum
    }

    /// Returns the largest component magnitude, or `0.0` for the empty vector.
    ///
    /// Follows IEEE-754 `maxNum` semantics, ignoring NaN components in favor of finite magnitudes.
    /// If you must reject NaN, check [`is_finite`](Self::is_finite) first.
    #[inline]
    #[must_use]
    pub fn max_abs(&self) -> f64 {
        let (chunks, remainder) = self.0.as_chunks::<8>();

        let mut maxima = f64x8::splat(0.0);
        for chunk in chunks {
            maxima = maxima.simd_max(f64x8::from_array(*chunk).abs());
        }

        let mut scale = maxima.reduce_max();
        for &component in remainder {
            scale = scale.max(component.abs());
        }

        scale
    }

    /// Returns the Euclidean norm through a scaled two-pass sum of squares.
    ///
    /// For finite components xᵢ and scale s = maxᵢ |xᵢ| > 0, computes s · √Σᵢ (xᵢ / s)². Each ratio
    /// lies in [−1, 1] after rounding, preventing overflow of its square. Scaling also avoids
    /// losing an entire subnormal-only vector when direct squaring would underflow. Small relative
    /// contributions can still round away, and the final multiplication can overflow when the norm
    /// is too large.
    ///
    /// The all-zero and empty vectors have norm `0.0`. A vector containing NaN or an infinity
    /// yields a non-finite result. Division by the scale avoids an overflowing reciprocal when the
    /// scale is subnormal.
    #[inline]
    #[must_use]
    pub fn stable_l2(&self) -> f64 {
        let scale = self.max_abs();
        if scale == 0.0 {
            // maxNum can give a zero scale for a mixture of zeros and NaNs
            return if self.is_finite() { 0.0 } else { f64::NAN };
        }

        let (chunks, remainder) = self.0.as_chunks::<8>();
        let divisor = f64x8::splat(scale);

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, chunk) in chunks.iter().enumerate() {
            let lane = index & 1;
            let ratio = f64x8::from_array(*chunk) / divisor;
            accumulators[lane] = mul_add_f64x8(ratio, ratio, accumulators[lane]);
        }

        let mut sum_squares = (accumulators[0] + accumulators[1]).reduce_sum();
        for &component in remainder {
            let ratio = component / scale;
            sum_squares = ratio.mul_add(ratio, sum_squares);
        }

        scale * sum_squares.sqrt()
    }

    /// Returns whether every component is finite.
    ///
    /// Returns `true` for an empty vector.
    #[inline]
    #[must_use]
    pub fn is_finite(&self) -> bool {
        let (chunks, remainder) = self.0.as_chunks::<8>();

        if !remainder.iter().all(|component| component.is_finite()) {
            return false;
        }

        // one mask avoids short-circuiting within the lane groups. A recorded all-finite-vector
        // comparison measured this scan about 12% faster than a short-circuiting scan.
        let mut finite = Mask::splat(true);
        for chunk in chunks {
            finite &= f64x8::from_array(*chunk).is_finite();
        }

        finite.all()
    }

    /// Adds a working-precision vector, component-wise.
    ///
    /// Widening `rhs` to `f64` adds no numeric rounding. The update carries only the addition's
    /// rounding, supporting double-precision moment accumulation over single-precision data.
    #[inline]
    pub fn add_widened(&mut self, rhs: &VecN<N>) {
        let (chunks, remainder) = self.0.as_chunks_mut::<8>();
        let (chunks_narrow, remainder_narrow) = rhs.as_array().as_chunks::<8>();

        for (chunk, narrow) in chunks.iter_mut().zip(chunks_narrow) {
            let widened: f64x8 = f32x8::from_array(*narrow).cast();
            *chunk = (f64x8::from_array(*chunk) + widened).to_array();
        }
        for (component, &narrow) in remainder.iter_mut().zip(remainder_narrow) {
            *component += f64::from(narrow);
        }
    }

    /// Adds `factor` times a working-precision vector, component-wise.
    ///
    /// Widening `direction` to `f64` adds no numeric rounding. The update `self += direction *
    /// factor` carries only one fused multiply-add rounding per component, supporting
    /// double-precision gradient accumulation over single-precision data.
    #[inline]
    pub fn add_scaled(&mut self, direction: &VecN<N>, factor: f64) {
        let scale = f64x8::splat(factor);
        let (chunks, remainder) = self.0.as_chunks_mut::<8>();
        let (chunks_narrow, remainder_narrow) = direction.as_array().as_chunks::<8>();

        for (chunk, narrow) in chunks.iter_mut().zip(chunks_narrow) {
            let widened: f64x8 = f32x8::from_array(*narrow).cast();
            *chunk = mul_add_f64x8(widened, scale, f64x8::from_array(*chunk)).to_array();
        }
        for (component, &narrow) in remainder.iter_mut().zip(remainder_narrow) {
            *component = f64::from(narrow).mul_add(factor, *component);
        }
    }

    /// Adds `factor` times a double-precision vector, component-wise.
    ///
    /// The update `self += direction * factor` carries only the rounding of the fused
    /// multiply-add itself, one per component. This is the update-recurrence kernel of iterative
    /// solvers whose state and directions share double precision.
    #[inline]
    pub fn mul_add(&mut self, direction: &Self, factor: f64) {
        let scale = f64x8::splat(factor);
        let (chunks, remainder) = self.0.as_chunks_mut::<8>();
        let (direction_chunks, direction_remainder) = direction.0.as_chunks::<8>();

        for (chunk, along) in chunks.iter_mut().zip(direction_chunks) {
            *chunk = mul_add_f64x8(f64x8::from_array(*along), scale, f64x8::from_array(*chunk))
                .to_array();
        }
        for (component, &along) in remainder.iter_mut().zip(direction_remainder) {
            *component = along.mul_add(factor, *component);
        }
    }

    /// Negates every component.
    #[inline]
    pub fn negate(&mut self) {
        let (prefix, aligned, suffix) = self.0.as_simd_mut::<8>();

        for component in prefix {
            *component = -*component;
        }
        for component in aligned {
            *component = -*component;
        }
        for component in suffix {
            *component = -*component;
        }
    }

    /// Divides every component by the matching component of `divisor`.
    #[inline]
    pub fn divide_components(&mut self, divisor: &Self) {
        let (chunks, remainder) = self.0.as_chunks_mut::<8>();
        let (divisor_chunks, divisor_remainder) = divisor.0.as_chunks::<8>();

        for (chunk, scale) in chunks.iter_mut().zip(divisor_chunks) {
            *chunk = (f64x8::from_array(*chunk) / f64x8::from_array(*scale)).to_array();
        }
        for (component, &scale) in remainder.iter_mut().zip(divisor_remainder) {
            *component /= scale;
        }
    }

    /// Multiplies every component by the matching component of `factor`.
    #[inline]
    pub fn multiply_components(&mut self, factor: &Self) {
        let (chunks, remainder) = self.0.as_chunks_mut::<8>();
        let (factor_chunks, factor_remainder) = factor.0.as_chunks::<8>();

        for (chunk, scale) in chunks.iter_mut().zip(factor_chunks) {
            *chunk = (f64x8::from_array(*chunk) * f64x8::from_array(*scale)).to_array();
        }
        for (component, &scale) in remainder.iter_mut().zip(factor_remainder) {
            *component *= scale;
        }
    }

    /// Adds the squared deviation of a working-precision vector from `mean`, component-wise.
    ///
    /// Widening `value` to `f64` adds no numeric rounding. The update `self += (value - mean)^2`
    /// carries only the subtraction and fused multiply-add roundings, supporting double-precision
    /// second-moment accumulation over single-precision data.
    #[inline]
    pub fn add_squared_deviation(&mut self, value: &VecN<N>, mean: &Self) {
        let (chunks, remainder) = self.0.as_chunks_mut::<8>();
        let (value_chunks, value_remainder) = value.as_array().as_chunks::<8>();
        let (mean_chunks, mean_remainder) = mean.0.as_chunks::<8>();

        for ((chunk, narrow), mean) in chunks.iter_mut().zip(value_chunks).zip(mean_chunks) {
            let centred = f32x8::from_array(*narrow).cast::<f64>() - f64x8::from_array(*mean);
            *chunk = mul_add_f64x8(centred, centred, f64x8::from_array(*chunk)).to_array();
        }
        for ((component, &narrow), &mean) in remainder
            .iter_mut()
            .zip(value_remainder)
            .zip(mean_remainder)
        {
            let centred = f64::from(narrow) - mean;
            *component = centred.mul_add(centred, *component);
        }
    }

    /// Multiplies every component by `factor`, four lanes at a time.
    #[inline]
    #[must_use]
    fn scaled(mut self, factor: f64) -> Self {
        let scale = Simd::splat(factor);
        let (chunks, remainder) = self.0.as_chunks_mut::<4>();

        for chunk in chunks {
            *chunk = (Simd::from_array(*chunk) * scale).to_array();
        }
        for component in remainder {
            *component *= factor;
        }

        self
    }
}

const impl<const N: usize> From<[f64; N]> for DVecN<N> {
    #[inline]
    fn from(components: [f64; N]) -> Self {
        Self(components)
    }
}

const impl<const N: usize> From<DVecN<N>> for [f64; N] {
    #[inline]
    fn from(vec: DVecN<N>) -> Self {
        vec.0
    }
}

/// An `N`-dimensional vector whose storage is aligned for [`f64x8`].
///
/// The alignment is a construction invariant: the type has the same layout as `[f64; N]`, and every
/// value originates from a [`BoxedDVecN`] or from a constructor that checks (or, for
/// [`from_ref_unchecked`](Self::from_ref_unchecked), demands) that the address is a multiple of
/// `align_of::<f64x8>()`. The transparent layout means any array that happens to be aligned can be
/// wrapped in place.
///
/// [`Self::lanes`] splits the components into aligned eight-lane groups and a scalar remainder,
/// with no prefix before the lane groups.
// No `FromBytes`/`FromZeros`: a byte-level constructor would let
// `zerocopy::transmute_ref!` produce references to unaligned arrays,
// bypassing the alignment invariant.
#[derive(
    Debug, zerocopy::ByteHash, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct AlignedDVecN<const N: usize>([f64; N]);

impl<const N: usize> AlignedDVecN<N> {
    /// Wraps a borrowed array under the caller's alignment promise.
    ///
    /// # Safety
    ///
    /// `value` must start at an address aligned to `align_of::<f64x8>()` bytes. Consumers of the
    /// wrapper may rely on that alignment for aligned loads.
    #[inline]
    #[must_use]
    pub const unsafe fn from_ref_unchecked(value: &[f64; N]) -> &Self {
        // SAFETY: repr(transparent) preserves the array's layout and validity. The input reference
        // supplies initialized storage and a shared-borrow lifetime, while the caller supplies the
        // stronger f64x8 alignment. The cast retains the pointer and borrow. Therefore the result
        // is a valid aligned view for that lifetime.
        unsafe { &*ptr::from_ref(value).cast::<Self>() }
    }

    /// Wraps a mutably borrowed array under the caller's alignment promise.
    ///
    /// # Safety
    ///
    /// `value` must start at an address aligned to `align_of::<f64x8>()` bytes. Consumers of the
    /// wrapper may rely on that alignment for aligned loads and stores.
    #[inline]
    #[must_use]
    pub const unsafe fn from_mut_unchecked(value: &mut [f64; N]) -> &mut Self {
        // SAFETY: repr(transparent) preserves the array's layout and validity. The input reference
        // supplies initialized storage and exclusive access, while the caller supplies the stronger
        // f64x8 alignment. The cast retains the pointer and mutable-borrow lifetime. Therefore the
        // result is a valid exclusive aligned view.
        unsafe { &mut *ptr::from_mut(value).cast::<Self>() }
    }

    /// Wraps a borrowed array, checking its alignment.
    ///
    /// Returns [`None`] when `value` is not aligned to `align_of::<f64x8>()` bytes. Stack arrays
    /// and plain boxes have no alignment guarantee beyond `f64`'s. Obtain aligned storage from
    /// [`BoxedDVecN`].
    #[must_use]
    pub fn from_ref(value: &[f64; N]) -> Option<&Self> {
        if !value.as_ptr().is_aligned_to(align_of::<f64x8>()) {
            return None;
        }

        // SAFETY: from_ref_unchecked requires f64x8 alignment. The preceding check establishes it
        // for this array's starting address. Therefore the shared array borrow satisfies the
        // constructor's contract.
        unsafe { Some(Self::from_ref_unchecked(value)) }
    }

    /// Wraps a mutable array, checking its alignment.
    ///
    /// Returns [`None`] when `value` is not aligned to `align_of::<f64x8>()` bytes. Stack arrays
    /// and plain boxes have no alignment guarantee beyond `f64`'s. Obtain aligned storage from
    /// [`BoxedDVecN`].
    #[must_use]
    pub fn from_mut(value: &mut [f64; N]) -> Option<&mut Self> {
        if !value.as_ptr().is_aligned_to(align_of::<f64x8>()) {
            return None;
        }

        // SAFETY: from_mut_unchecked requires f64x8 alignment. The preceding check establishes it
        // for this array's starting address. Therefore the exclusive array borrow satisfies the
        // constructor's contract.
        unsafe { Some(Self::from_mut_unchecked(value)) }
    }

    /// Returns the components as an array reference.
    #[inline]
    #[must_use]
    pub const fn as_array(&self) -> &[f64; N] {
        &self.0
    }

    /// Returns the components as a mutable array reference.
    #[inline]
    #[must_use]
    pub const fn as_array_mut(&mut self) -> &mut [f64; N] {
        &mut self.0
    }

    /// Returns the components as aligned 8-lane SIMD groups plus a scalar remainder.
    ///
    /// The split is [`AlignedVecN::lanes`](super::AlignedVecN::lanes) at double precision: group
    /// `i` holds components `8 · i` through `8 · i + 7`, and the remainder holds the trailing `N %
    /// 8` components. The type's alignment invariant excludes a misaligned prefix.
    #[inline]
    #[must_use]
    pub fn lanes(&self) -> (&[f64x8], &[f64]) {
        let (prefix, lanes, suffix) = self.0.as_simd();
        debug_assert_eq!(
            prefix.len(),
            0,
            "Per contract, everything is aligned to at least f64x8's alignment"
        );

        (lanes, suffix)
    }

    /// Returns the components as mutable aligned 8-lane groups plus a mutable scalar remainder.
    ///
    /// The split is the same as [`lanes`](Self::lanes). Writes through either slice update the
    /// vector in place.
    #[inline]
    #[must_use]
    pub fn lanes_mut(&mut self) -> (&mut [f64x8], &mut [f64]) {
        let (prefix, lanes, suffix) = self.0.as_simd_mut();
        debug_assert_eq!(
            prefix.len(),
            0,
            "Per contract, everything is aligned to at least f64x8's alignment"
        );

        (lanes, suffix)
    }

    // matching DVecN's eight-component groups keeps the same accumulation expressions for aligned
    // and ordinary storage

    /// Accumulates the dot product with the grouping used by [`DVecN::dot`].
    #[inline]
    #[must_use]
    fn dot_impl(&self, other: &Self) -> f64 {
        let (lanes, remainder) = self.lanes();
        let (lanes_right, remainder_right) = other.lanes();

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, (left, right)) in lanes.iter().zip(lanes_right).enumerate() {
            let lane = index & 1;
            accumulators[lane] = mul_add_f64x8(*left, *right, accumulators[lane]);
        }

        let mut sum = (accumulators[0] + accumulators[1]).reduce_sum();
        for (&left, &right) in remainder.iter().zip(remainder_right) {
            sum = left.mul_add(right, sum);
        }

        sum
    }

    /// Returns the dot product of the two vectors.
    ///
    /// The fold is eight fused lanes into two interleaved accumulators with a fused scalar
    /// tail, in a fixed order.
    #[inline]
    pub(crate) fn dot(&self, other: &Self) -> Derivation<DFinite> {
        Derivation::raw(self.dot_impl(other))
    }

    /// Returns the dot product when the result is finite.
    ///
    /// A non-finite value entering this multiply-add fold can only produce a non-finite
    /// accumulator. Every component and computed intermediate contributes to the final reduction.
    /// Returning [`None`] for a non-finite result therefore covers those inputs and intermediates.
    #[inline]
    pub(crate) fn checked_dot(&self, other: &Self) -> Option<DFinite> {
        DFinite::new(self.dot_impl(other))
    }

    /// Returns the squared Euclidean length.
    #[inline]
    pub(crate) fn norm_squared(&self) -> Derivation<DNonNegative> {
        Derivation::raw(self.dot_impl(self))
    }

    /// Returns the Euclidean length.
    #[inline]
    pub(crate) fn norm(&self) -> Derivation<DNonNegative> {
        self.norm_squared().sqrt()
    }

    /// Returns the squared Euclidean length when the result is finite.
    ///
    /// Uses the fold shape and finiteness refusal of [`checked_dot`](Self::checked_dot). A finite
    /// sum of squares is non-negative.
    #[inline]
    pub(crate) fn checked_norm_squared(&self) -> Option<DNonNegative> {
        DNonNegative::new(self.dot_impl(self))
    }

    /// Returns the l1 norm.
    ///
    /// The fold shape matches [`DVecN::abs_sum`].
    #[inline]
    #[must_use]
    pub fn abs_sum(&self) -> f64 {
        let (lanes, remainder) = self.lanes();

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, lane_group) in lanes.iter().enumerate() {
            let lane = index & 1;
            accumulators[lane] += lane_group.abs();
        }

        let mut sum = (accumulators[0] + accumulators[1]).reduce_sum();
        for &component in remainder {
            sum += component.abs();
        }

        sum
    }

    /// Returns the largest component magnitude, or `0.0` for the empty vector.
    ///
    /// Follows IEEE-754 `maxNum` semantics exactly as [`DVecN::max_abs`], ignoring NaN components
    /// in favor of finite magnitudes. If you must reject NaN, check [`is_finite`](Self::is_finite)
    /// first.
    #[inline]
    #[must_use]
    pub fn max_abs(&self) -> f64 {
        let (lanes, remainder) = self.lanes();

        let mut maxima = f64x8::splat(0.0);
        for lane_group in lanes {
            maxima = maxima.simd_max(lane_group.abs());
        }

        let mut scale = maxima.reduce_max();
        for &component in remainder {
            scale = scale.max(component.abs());
        }

        scale
    }

    /// The raw scaled two-pass norm behind [`stable_l2`](Self::stable_l2).
    ///
    /// For a finite vector with nonzero maximum magnitude, dividing by that magnitude bounds every
    /// ratio to `[-1, 1]`. This method divides every component by [`max_abs`](Self::max_abs) before
    /// squaring. Therefore no square overflows on that domain. A zero scale returns `0.0` for a
    /// finite vector and NaN otherwise.
    fn stable_l2_impl(&self) -> f64 {
        let scale = self.max_abs();
        if scale == 0.0 {
            // maxNum can give a zero scale for a mixture of zeros and NaNs
            return if self.is_finite() { 0.0 } else { f64::NAN };
        }

        let (lanes, remainder) = self.lanes();
        let divisor = f64x8::splat(scale);

        let zero = f64x8::splat(0.0);
        let mut accumulators = [zero; 2];
        for (index, lane_group) in lanes.iter().enumerate() {
            let lane = index & 1;
            let ratio = *lane_group / divisor;
            accumulators[lane] = mul_add_f64x8(ratio, ratio, accumulators[lane]);
        }

        let mut sum_squares = (accumulators[0] + accumulators[1]).reduce_sum();
        for &component in remainder {
            let ratio = component / scale;
            sum_squares = ratio.mul_add(ratio, sum_squares);
        }

        scale * sum_squares.sqrt()
    }

    /// Computes the scaled Euclidean norm as a nonnegative finite value.
    ///
    /// Uses the evaluation described by [`DVecN::stable_l2`]. You must establish that the
    /// components and the computed norm are finite. Use [`Self::checked_stable_l2`] when those
    /// conditions need validation.
    #[inline]
    #[must_use]
    pub(crate) fn stable_l2(&self) -> DNonNegative {
        DNonNegative::new_unchecked(self.stable_l2_impl())
    }

    /// Computes the scaled Euclidean norm when it is finite.
    ///
    /// Uses the evaluation and numerical limits described by [`DVecN::stable_l2`]. Returns [`None`]
    /// when any component or the computed norm is non-finite. Empty and all-zero vectors return
    /// zero.
    #[inline]
    pub(crate) fn checked_stable_l2(&self) -> Option<DNonNegative> {
        DNonNegative::new(self.stable_l2_impl())
    }

    /// Returns whether every component is finite.
    #[inline]
    #[must_use]
    pub fn is_finite(&self) -> bool {
        let (lanes, remainder) = self.lanes();

        let is_finite = remainder.iter().all(|component| component.is_finite());
        if !is_finite {
            return false;
        }

        let mut is_finite = Mask::splat(true);
        for lane in lanes {
            is_finite &= lane.is_finite();
        }

        is_finite.all()
    }

    /// Adds `factor` times a double-precision vector, component-wise.
    ///
    /// The update `self += direction * factor` carries only the rounding of the fused
    /// multiply-add itself, one per component. This is the update-recurrence kernel of iterative
    /// solvers whose state and directions share double precision.
    #[inline]
    pub fn mul_add(&mut self, direction: &Self, factor: f64) {
        let scale = f64x8::splat(factor);
        let (lanes, remainder) = self.lanes_mut();
        let (direction_lanes, direction_remainder) = direction.lanes();

        for (lane_group, along) in lanes.iter_mut().zip(direction_lanes) {
            *lane_group = mul_add_f64x8(*along, scale, *lane_group);
        }
        for (component, &along) in remainder.iter_mut().zip(direction_remainder) {
            *component = along.mul_add(factor, *component);
        }
    }

    /// Negates every component.
    #[inline]
    pub fn negate(&mut self) {
        let (lanes, remainder) = self.lanes_mut();

        for lane_group in lanes {
            *lane_group = -*lane_group;
        }
        for component in remainder {
            *component = -*component;
        }
    }

    /// Divides every component by the matching component of `divisor`.
    #[inline]
    pub fn divide_components(&mut self, divisor: &Self) {
        let (lanes, remainder) = self.lanes_mut();
        let (divisor_lanes, divisor_remainder) = divisor.lanes();

        for (lane_group, scale) in lanes.iter_mut().zip(divisor_lanes) {
            *lane_group /= *scale;
        }
        for (component, &scale) in remainder.iter_mut().zip(divisor_remainder) {
            *component /= scale;
        }
    }

    /// Multiplies every component by the matching component of `factor`.
    #[inline]
    pub fn multiply_components(&mut self, factor: &Self) {
        let (lanes, remainder) = self.lanes_mut();
        let (factor_lanes, factor_remainder) = factor.lanes();

        for (lane_group, scale) in lanes.iter_mut().zip(factor_lanes) {
            *lane_group *= *scale;
        }
        for (component, &scale) in remainder.iter_mut().zip(factor_remainder) {
            *component *= scale;
        }
    }

    /// Adds `factor` times an aligned working-precision vector, component-wise.
    ///
    /// Each `f32` component of `direction` widens to `f64` exactly, as in [`DVecN::add_scaled`].
    /// The aligned loads retain that method's eight-component groups and scalar remainder, with the
    /// same fused expressions on corresponding components. The fold shape matches the unaligned
    /// kernel bit for bit.
    #[inline]
    pub fn add_scaled(&mut self, direction: &AlignedVecN<N>, factor: f64) {
        let scale = f64x8::splat(factor);
        let (lanes, remainder) = self.lanes_mut();
        let (narrow_lanes, narrow_remainder) = direction.lanes();

        for (lane_group, narrow) in lanes.iter_mut().zip(narrow_lanes) {
            let widened: f64x8 = narrow.cast();
            *lane_group = mul_add_f64x8(widened, scale, *lane_group);
        }
        for (component, &narrow) in remainder.iter_mut().zip(narrow_remainder) {
            *component = f64::from(narrow).mul_add(factor, *component);
        }
    }

    /// Adds a working-precision vector, component-wise.
    ///
    /// Each `f32` component of `rhs` widens to `f64` exactly, as [`DVecN::add_widened`].
    #[inline]
    pub fn add_widened(&mut self, rhs: &VecN<N>) {
        let (lanes, remainder) = self.lanes_mut();
        let (narrow_chunks, narrow_remainder) = rhs.as_array().as_chunks::<8>();

        for (lane_group, narrow) in lanes.iter_mut().zip(narrow_chunks) {
            *lane_group += f32x8::from_array(*narrow).cast::<f64>();
        }
        for (component, &narrow) in remainder.iter_mut().zip(narrow_remainder) {
            *component += f64::from(narrow);
        }
    }

    /// Adds a working-precision vector's squared deviation from `mean`, component-wise.
    ///
    /// Each `f32` component of `value` widens to `f64` exactly, as
    /// [`DVecN::add_squared_deviation`].
    #[inline]
    pub fn add_squared_deviation(&mut self, value: &VecN<N>, mean: &Self) {
        let (lanes, remainder) = self.lanes_mut();
        let (value_chunks, value_remainder) = value.as_array().as_chunks::<8>();
        let (mean_lanes, mean_remainder) = mean.lanes();

        for ((lane_group, narrow), mean_group) in lanes.iter_mut().zip(value_chunks).zip(mean_lanes)
        {
            let centred = f32x8::from_array(*narrow).cast::<f64>() - *mean_group;
            *lane_group = mul_add_f64x8(centred, centred, *lane_group);
        }

        for ((component, &narrow), &mean) in remainder
            .iter_mut()
            .zip(value_remainder)
            .zip(mean_remainder)
        {
            let centred = f64::from(narrow) - mean;
            *component = centred.mul_add(centred, *component);
        }
    }
}

const impl<const N: usize> PartialEq for AlignedDVecN<N> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl<T, const N: usize> MulAssign<T> for AlignedDVecN<N>
where
    T: Into<f64>,
{
    #[inline]
    fn mul_assign(&mut self, rhs: T) {
        let rhs = rhs.into();
        let rhs_simd = Simd::splat(rhs);

        let (lanes, remainder) = self.lanes_mut();

        for lane in lanes {
            *lane *= rhs_simd;
        }

        for component in remainder {
            *component *= rhs;
        }
    }
}

impl<T, const N: usize> DivAssign<T> for AlignedDVecN<N>
where
    T: Into<f64>,
{
    #[inline]
    fn div_assign(&mut self, rhs: T) {
        let rhs = rhs.into();
        let rhs_simd = Simd::splat(rhs);

        let (lanes, remainder) = self.lanes_mut();
        for lane in lanes {
            *lane /= rhs_simd;
        }

        for value in remainder {
            *value /= rhs;
        }
    }
}

/// An owned `N`-dimensional vector in a heap allocation aligned for [`f64x8`].
///
/// The buffer has `align_of::<f64x8>()` alignment regardless of `N`. Use [`Self::zero`] to
/// initialize large vectors directly on the heap and [`AlignedDVecN`] methods to update them in
/// place.
pub(crate) struct BoxedDVecN<const N: usize, A: Allocator = Global> {
    ptr: NonNull<f64>,
    alloc: A,
}

impl<const N: usize> BoxedDVecN<N> {
    /// Copies the vector into a new aligned allocation in the global allocator.
    ///
    /// # Panics
    ///
    /// Panics if `N` components cannot be represented by the aligned allocation layout.
    #[inline]
    #[must_use]
    pub(crate) fn new(value: &DVecN<N>) -> Self {
        Self::new_in(value, Global)
    }

    /// Creates the zero vector in a new aligned allocation in the global allocator.
    ///
    /// Every component is `0.0` and the buffer is valid for in-place filling through
    /// [`AlignedDVecN::as_array_mut`].
    ///
    /// # Panics
    ///
    /// Panics if `N` components cannot be represented by the aligned allocation layout.
    #[inline]
    #[must_use]
    pub(crate) fn zero() -> Self {
        Self::zero_in(Global)
    }
}

impl<const N: usize, A: Allocator> BoxedDVecN<N, A> {
    /// Computes the layout of `N` components with [`f64x8`] alignment.
    ///
    /// Allocation and deallocation must use the same layout, whose byte size does not round up when
    /// its alignment increases.
    ///
    /// # Panics
    ///
    /// Panics if the aligned size exceeds the allocation layout's `isize::MAX` limit.
    #[inline]
    fn layout() -> Layout {
        Layout::array::<f64>(N)
            .and_then(|layout| layout.align_to(align_of::<f64x8>()))
            .expect("`N` 8-byte components rounded up to the SIMD alignment must fit `isize`")
    }

    /// Creates the zero vector in a new aligned allocation in `alloc`.
    ///
    /// Invokes [`alloc::alloc::handle_alloc_error`] when the allocator cannot provide the buffer.
    ///
    /// # Panics
    ///
    /// Panics if `N` components cannot be represented by the aligned allocation layout.
    #[inline]
    #[must_use]
    pub(crate) fn zero_in(alloc: A) -> Self {
        let layout = Self::layout();
        let Ok(allocation) = alloc.allocate_zeroed(layout) else {
            alloc::alloc::handle_alloc_error(layout)
        };

        // All-zero bits are the valid `f64` value 0.0 in every component.
        Self {
            ptr: allocation.cast::<f64>(),
            alloc,
        }
    }

    /// Copies the vector into a new aligned allocation in `alloc`.
    ///
    /// Invokes [`alloc::alloc::handle_alloc_error`] when the allocator cannot provide the buffer.
    /// Use [`Self::try_new_in`] to handle allocation failure.
    ///
    /// # Panics
    ///
    /// Panics if `N` components cannot be represented by the aligned allocation layout.
    #[inline]
    #[must_use]
    pub(crate) fn new_in(value: &DVecN<N>, alloc: A) -> Self {
        let Ok(this) = Self::try_new_in(value, alloc) else {
            alloc::alloc::handle_alloc_error(Self::layout())
        };

        this
    }

    /// Copies the vector into a new aligned allocation in `alloc`, surfacing allocation failure.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] when the allocator cannot provide the buffer.
    ///
    /// # Panics
    ///
    /// Panics if `N` components cannot be represented by the aligned allocation layout.
    #[inline]
    pub(crate) fn try_new_in(value: &DVecN<N>, alloc: A) -> Result<Self, AllocError> {
        let layout = Self::layout();
        let allocation = alloc.allocate(layout)?;
        let ptr = allocation.cast::<f64>();

        // SAFETY: copy_nonoverlapping is an untyped copy that preserves initialization state. Its
        // aligned pointers must be valid for the N-component read and write ranges, without
        // overlap. The source array reference supplies N initialized f64 components. allocate
        // returns fresh storage for the checked N-component layout, with f64x8 alignment even when
        // N is zero. Distinct nonempty live allocations cannot overlap, and an empty copy accesses
        // no bytes. Therefore copying N components initializes all components of the owned buffer.
        unsafe {
            ptr::copy_nonoverlapping(value.as_array().as_ptr(), ptr.as_ptr(), N);
        }

        Ok(Self { ptr, alloc })
    }
}

const impl<const N: usize, A: Allocator> Deref for BoxedDVecN<N, A> {
    type Target = AlignedDVecN<N>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: The array reference requires initialized components and sufficient alignment, and
        // from_ref_unchecked additionally requires f64x8 alignment. Every constructor initializes N
        // components in the checked layout and retains its allocating instance. The allocator
        // provides a non-null aligned pointer even for N = 0. This shared borrow prevents
        // destruction or mutation of the buffer. Therefore the aligned view is valid for the
        // borrow's lifetime.
        unsafe { AlignedDVecN::from_ref_unchecked(&*self.ptr.as_ptr().cast::<[f64; N]>()) }
    }
}

const impl<const N: usize, A: Allocator> DerefMut for BoxedDVecN<N, A> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: The mutable array reference requires initialized, aligned storage and exclusive
        // access. Constructors initialize N components with f64x8 alignment, including an aligned
        // non-null pointer for N = 0. This exclusive Self borrow excludes all other access and
        // bounds the result's lifetime. Therefore both the array reference and from_mut_unchecked
        // satisfy their contracts.
        unsafe { AlignedDVecN::from_mut_unchecked(&mut *self.ptr.as_ptr().cast::<[f64; N]>()) }
    }
}

impl<const N: usize, A: Allocator + Clone> Clone for BoxedDVecN<N, A> {
    #[inline]
    fn clone(&self) -> Self {
        Self::new_in(DVecN::from_ref(self.as_array()), self.alloc.clone())
    }

    fn clone_from(&mut self, source: &Self) {
        // fixed N permits reuse of the existing destination allocation.
        // SAFETY: copy_nonoverlapping is an untyped copy that preserves initialization state. It
        // requires aligned pointers valid for disjoint N-component read and write ranges. Each
        // owner has an N-component allocation with the same layout, and the source array reference
        // supplies initialized f64 values. The exclusive destination borrow prevents aliasing the
        // source for a nonempty copy. Both pointers remain aligned and non-null for an empty copy,
        // which accesses no bytes. Therefore the copy preserves valid initialized destination
        // components.
        unsafe {
            ptr::copy_nonoverlapping(source.as_array().as_ptr(), self.ptr.as_ptr(), N);
        }
    }
}

impl<const N: usize> From<&DVecN<N>> for BoxedDVecN<N> {
    #[inline]
    fn from(value: &DVecN<N>) -> Self {
        Self::new(value)
    }
}

impl<const N: usize> From<[f64; N]> for BoxedDVecN<N> {
    #[inline]
    fn from(components: [f64; N]) -> Self {
        Self::new(DVecN::from_ref(&components))
    }
}

impl<const N: usize, A: Allocator> AsRef<AlignedDVecN<N>> for BoxedDVecN<N, A> {
    #[inline]
    fn as_ref(&self) -> &AlignedDVecN<N> {
        self
    }
}

impl<const N: usize, A: Allocator> core::hash::Hash for BoxedDVecN<N, A> {
    #[inline]
    fn hash<H: core::hash::Hasher>(&self, state: &mut H) {
        (**self).hash(state);
    }
}

impl<const N: usize, A: Allocator> core::fmt::Debug for BoxedDVecN<N, A> {
    #[inline]
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        core::fmt::Debug::fmt(&**self, fmt)
    }
}

const impl<const N: usize, A: Allocator> PartialEq for BoxedDVecN<N, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        **self == **other
    }
}

impl<const N: usize, A: Allocator> Drop for BoxedDVecN<N, A> {
    #[inline]
    fn drop(&mut self) {
        // SAFETY: Deallocation requires the original allocator, a live pointer and a matching
        // layout. Every constructor stores the allocating instance and pointer for Self::layout(),
        // and no method transfers or frees that ownership. Therefore Drop may deallocate the buffer
        // exactly once with this layout.
        unsafe {
            self.alloc.deallocate(self.ptr.cast::<u8>(), Self::layout());
        }
    }
}

// SAFETY: Send permits transferring ownership between threads. The vector exclusively owns its f64
// buffer, and A: Send permits moving the allocating instance with it. Borrowed views prevent moving
// the owner while in use. Therefore the initialized buffer and its deallocation capability may be
// transferred together.
unsafe impl<const N: usize, A: Allocator + Send> Send for BoxedDVecN<N, A> {}

// SAFETY: Sync requires shared access to avoid data races. Shared vector methods expose immutable
// f64 components without interior mutation, and A: Sync covers sharing the allocator. Mutation and
// destruction require exclusive access. Therefore shared vector references are safe across threads.
unsafe impl<const N: usize, A: Allocator + Sync> Sync for BoxedDVecN<N, A> {}
