//! Double-precision `N`-dimensional vectors and their reductions.
//!
//! [`DVecN`] is the `f64` twin of [`VecN`], for the few consumers whose algorithms
//! demand double precision throughout, such as classifier logits feeding a quasi-Newton optimizer.
//! Its reductions ([`softmax`](DVecN::softmax), [`log_sum_exp`](DVecN::log_sum_exp)) shift,
//! exponentiate, and fold four lanes at a time; the exponential goes through
//! [`kernel::exp_f64x4`](super::kernel), which currently lowers to one libm call per lane.
//!
//! [`BoxedDVecN`] owns a heap allocation aligned for [`f64x8`] and hands out [`AlignedDVecN`]
//! references to it, mirroring [`BoxedVecN`](super::BoxedVecN): the storage for optimizer state -
//! parameter and gradient vectors - whose dimension is far too large for the stack. The
//! [`argmin`](mod@argmin) submodule implements the `argmin-math` operations on the boxed vector, so
//! quasi-Newton solvers run their inner loops on these kernels.

use alloc::alloc::Global;
use core::{
    alloc::{AllocError, Allocator, Layout},
    ops::{Deref, DerefMut, DivAssign, MulAssign},
    ptr::{self, NonNull},
    simd::{Mask, Simd, f32x8, f64x8, num::SimdFloat as _},
};

use super::{
    kernel::{exp_f64x4, mul_add_f64x8},
    vecn::{AlignedVecN, VecN},
};

mod argmin;
#[cfg(test)]
mod tests;

/// An `N`-dimensional vector of `f64` components.
///
/// A [`DVecN`] is guaranteed to have the same layout as `[f64; N]`, so borrowed arrays convert in
/// place through [`from_ref`](Self::from_ref) and [`from_mut`](Self::from_mut) without copying.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::DVecN;
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
        // SAFETY: `Self` is a transparent wrapper around `[f64; N]`, so the cast preserves layout
        // and validity; the mutable borrow is carried through to the wrapper unchanged.
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
    /// NaN components lose, following [`f64::max`]; the maximum of the empty vector is
    /// [`f64::NEG_INFINITY`], the identity of the fold.
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
    /// The components are folded four lanes at a time; the sum of the empty vector is zero.
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
    /// The maximum component is subtracted before exponentiation, so the result is finite for any
    /// finite input, including components with magnitudes far beyond the range where a naive `exp`
    /// overflows. Every output lies in `[0, 1]`, the outputs sum to 1 up to rounding whenever `N ≥
    /// 1`, and shifting all components by a common constant leaves the result unchanged up to
    /// rounding. For `N = 0` the result is the empty vector.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::DVecN;
    ///
    /// // A naive `exp(1000.0)` overflows; the shifted form stays finite.
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
    /// The maximum is factored out as `max + ln(sum(exp(value - max)))`, keeping every intermediate
    /// exponent non-positive: the result is finite for any finite, non-empty input. A
    /// single-component vector returns that component exactly, and `N` equal components give
    /// `value + ln(N)`. For `N = 0` the result is [`f64::NEG_INFINITY`], the logarithm of the
    /// empty sum.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::DVecN;
    ///
    /// // A naive `exp(1000.0)` overflows; the shifted form stays finite.
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

        // The empty case needs no branch: the fold leaves the maximum at
        // negative infinity, the empty sum is zero, and `ln(0)` is
        // negative infinity, so the two addends agree on the empty-sum
        // identity.
        maximum + sum.ln()
    }

    /// Computes `exp(component - shift)` for every component and their sum in a single pass.
    ///
    /// Processes four lanes at a time.
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

    /// Returns the dot product of the two vectors.
    ///
    /// The products are fused and summed eight lanes at a time; see [`VecN::dot_wide`] for the
    /// mixed-precision variant over `f32` data.
    // Lane-width choice: as in `VecN::dot_accumulated` - `f64x8` is a
    // fourfold unroll on 128-bit NEON, and two independent accumulators
    // keep enough FMA chains in flight to cover the latency-throughput
    // product.
    #[inline]
    #[must_use]
    pub fn dot(&self, other: &Self) -> f64 {
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

    /// Returns the squared Euclidean length.
    #[inline]
    #[must_use]
    pub fn norm_squared(&self) -> f64 {
        self.dot(self)
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
    /// Folds `simd_max` over the absolute lanes and finishes with the scalar remainder. The
    /// maximum follows IEEE-754 `maxNum`: NaN components are ignored in favor of any finite
    /// magnitude, so callers that must reject NaN gate with [`is_finite`](Self::is_finite).
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
    /// The first pass takes the largest magnitude as the scale ([`max_abs`](Self::max_abs)); the
    /// second divides every component by it (one division each - no reciprocal, so every ratio
    /// lies in `[0, 1]` exactly) and accumulates the squared ratios through the same interleaved
    /// fused-multiply-add pair as [`dot`](Self::dot). The result is `scale · √Σratio²`: subnormal
    /// components keep their norm and magnitudes near [`f64::MAX`] stay finite where naive
    /// squared accumulation would overflow. This is the norm kernel of solvers whose control
    /// decisions must survive extreme scales.
    ///
    /// The all-zero and empty vectors have norm `0.0`. A vector containing NaN or an infinity
    /// yields a non-finite result: infinities force a NaN or infinite product through the second
    /// pass, and a NaN alongside only zeros is caught by the zero-scale finiteness check.
    #[inline]
    #[must_use]
    pub fn stable_l2(&self) -> f64 {
        let scale = self.max_abs();
        if scale == 0.0 {
            // maxNum ignores NaN, so a zero scale still needs the finiteness gate.
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
    /// The lane groups accumulate one finiteness mask with a single horizontal test at the end:
    /// the all-finite case - the gate that nearly always passes - runs branch-free at load
    /// bandwidth, measured ~12% faster than a short-circuiting scan on the same vector.
    #[inline]
    #[must_use]
    pub fn is_finite(&self) -> bool {
        let (chunks, remainder) = self.0.as_chunks::<8>();

        if !remainder.iter().all(|component| component.is_finite()) {
            return false;
        }

        let mut finite = Mask::splat(true);
        for chunk in chunks {
            finite &= f64x8::from_array(*chunk).is_finite();
        }

        finite.all()
    }

    /// Adds a working-precision vector, component-wise.
    ///
    /// Each `f32` component of `rhs` widens to `f64` exactly, so the update carries only the
    /// rounding of the addition itself. This is the moment-accumulation kernel of statistics kept
    /// in double precision over single-precision data.
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
    /// Each `f32` component of `direction` widens to `f64` exactly, so the update `self +=
    /// direction * factor` carries only the rounding of the fused multiply-add itself. This is the
    /// gradient-accumulation kernel of optimizers that keep their state in double precision over
    /// single-precision data.
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

    /// Adds the squared deviation of a working-precision vector from `mean`, component-wise.
    ///
    /// Each `f32` component of `value` widens to `f64` exactly, so the update `self += (value -
    /// mean)^2` carries only the rounding of the subtraction and the fused multiply-add. This is
    /// the second-moment kernel of diagonal-variance fits kept in double precision over
    /// single-precision data.
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
/// The payoff is [`lanes`](Self::lanes): every 8-lane load comes from an aligned address, so
/// iteration over the vector never splits a cache line.
// No `FromBytes`/`FromZeros`: a byte-level constructor would let
// `zerocopy::transmute_ref!` produce references to unaligned arrays,
// bypassing the alignment invariant.
#[derive(
    Debug, zerocopy::ByteHash, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct AlignedDVecN<const N: usize>([f64; N]);

impl<const N: usize> AlignedDVecN<N> {
    /// Wraps a borrowed array the caller promises is aligned.
    ///
    /// # Safety
    ///
    /// `value` must be aligned to `align_of::<f64x8>()` bytes. Consumers of the wrapper are allowed
    /// to rely on that alignment for aligned loads.
    #[inline]
    #[must_use]
    pub const unsafe fn from_ref_unchecked(value: &[f64; N]) -> &Self {
        // SAFETY: `Self` is a transparent wrapper around `[f64; N]`, and the alignment invariant is
        // the caller's contract.
        unsafe { &*ptr::from_ref(value).cast::<Self>() }
    }

    /// Wraps a mutably borrowed array the caller promises is aligned.
    ///
    /// # Safety
    ///
    /// `value` must be aligned to `align_of::<f64x8>()` bytes. Consumers of the wrapper are allowed
    /// to rely on that alignment for aligned loads and stores.
    #[inline]
    #[must_use]
    pub const unsafe fn from_mut_unchecked(value: &mut [f64; N]) -> &mut Self {
        // SAFETY: `Self` is a transparent wrapper around `[f64; N]`, and the alignment invariant is
        // the caller's contract.
        unsafe { &mut *ptr::from_mut(value).cast::<Self>() }
    }

    /// Wraps a borrowed array, checking its alignment.
    ///
    /// Returns [`None`] when `value` is not aligned to `align_of::<f64x8>()` bytes. Stack arrays
    /// and plain boxes usually are not; obtain aligned storage from [`BoxedDVecN`].
    #[must_use]
    pub fn from_ref(value: &[f64; N]) -> Option<&Self> {
        if !value.as_ptr().is_aligned_to(align_of::<f64x8>()) {
            return None;
        }

        // SAFETY: the alignment was just checked.
        unsafe { Some(Self::from_ref_unchecked(value)) }
    }

    /// Wraps a mutable array, checking its alignment.
    ///
    /// Returns [`None`] when `value` is not aligned to `align_of::<f64x8>()` bytes. Stack arrays
    /// and plain boxes usually are not; obtain aligned storage from [`BoxedDVecN`].
    #[must_use]
    pub fn from_mut(value: &mut [f64; N]) -> Option<&mut Self> {
        if !value.as_ptr().is_aligned_to(align_of::<f64x8>()) {
            return None;
        }

        // SAFETY: the alignment was just checked.
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
    /// 8` components. The type's alignment invariant guarantees no misaligned prefix exists, so no
    /// components precede the groups.
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
    /// The split is the same as [`lanes`](Self::lanes); writes through either slice update the
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

    // Arithmetic kernels over the lane view: alignment is part of the type, so every group
    // loads and stores as one aligned `f64x8` and the remainder follows in order. Fold shapes
    // match the `DVecN` kernels exactly - the aligned allocation splits at the same 8-lane
    // boundary - so both types reduce identical inputs to identical bits.

    /// Returns the dot product of the two vectors; the fold shape of [`DVecN::dot`].
    #[inline]
    #[must_use]
    pub fn dot(&self, other: &Self) -> f64 {
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

    /// Returns the squared Euclidean length.
    #[inline]
    #[must_use]
    pub fn norm_squared(&self) -> f64 {
        self.dot(self)
    }

    /// Returns the l1 norm; the fold shape of [`DVecN::abs_sum`].
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
    /// The maximum follows IEEE-754 `maxNum` exactly as [`DVecN::max_abs`]: NaN components are
    /// ignored in favor of any finite magnitude, so callers that must reject NaN gate with
    /// [`is_finite`](Self::is_finite).
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

    /// Returns the Euclidean norm through the scaled two-pass sum of squares of
    /// [`DVecN::stable_l2`], over the lane view.
    #[inline]
    #[must_use]
    pub fn stable_l2(&self) -> f64 {
        let scale = self.max_abs();
        if scale == 0.0 {
            // maxNum ignores NaN, so a zero scale still needs the finiteness gate.
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

    /// Adds `factor` times an aligned working-precision vector, component-wise.
    ///
    /// Each `f32` component of `direction` widens to `f64` exactly, as [`DVecN::add_scaled`];
    /// both operands load as aligned lane groups, and the group boundaries coincide - eight
    /// components per group on either side - so the fold shape matches the unaligned kernel
    /// bit for bit.
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

impl<const N: usize> MulAssign<f64> for AlignedDVecN<N> {
    #[inline]
    fn mul_assign(&mut self, rhs: f64) {
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

impl<const N: usize> DivAssign<f64> for AlignedDVecN<N> {
    #[inline]
    fn div_assign(&mut self, rhs: f64) {
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
/// The buffer is allocated with `align_of::<f64x8>()` alignment regardless of `N`, so dereferencing
/// always yields an [`AlignedDVecN`]. This is the storage for double-precision optimizer state -
/// parameter and gradient vectors whose dimension is far too large for the stack.
pub struct BoxedDVecN<const N: usize, A: Allocator = Global> {
    ptr: NonNull<f64>,
    alloc: A,
}

impl<const N: usize> BoxedDVecN<N> {
    /// Copies the vector into a new aligned allocation in the global allocator.
    #[inline]
    #[must_use]
    pub fn new(value: &DVecN<N>) -> Self {
        Self::new_in(value, Global)
    }

    /// Creates the zero vector in a new aligned allocation in the global allocator.
    ///
    /// Every component is `0.0` and the buffer is valid for in-place filling through
    /// [`as_array_mut`](AlignedDVecN::as_array_mut).
    #[inline]
    #[must_use]
    pub fn zero() -> Self {
        Self::zero_in(Global)
    }
}

impl<const N: usize, A: Allocator> BoxedDVecN<N, A> {
    /// The allocation layout: `N` components, padded to the alignment of [`f64x8`].
    ///
    /// Allocation and deallocation must agree on this.
    #[inline]
    fn layout() -> Layout {
        Layout::array::<f64>(N)
            .and_then(|layout| layout.align_to(align_of::<f64x8>()))
            .expect("`N` 8-byte components rounded up to the SIMD alignment must fit `isize`")
    }

    /// Creates the zero vector in a new aligned allocation in `alloc`.
    ///
    /// The process is aborted through [`handle_alloc_error`](std::alloc::handle_alloc_error) when
    /// the allocator cannot provide the buffer.
    #[inline]
    #[must_use]
    pub fn zero_in(alloc: A) -> Self {
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
    /// The process is aborted through [`handle_alloc_error`](std::alloc::handle_alloc_error) when
    /// the allocator cannot provide the buffer.
    #[inline]
    #[must_use]
    pub fn new_in(value: &DVecN<N>, alloc: A) -> Self {
        let Ok(this) = Self::try_new_in(value, alloc) else {
            alloc::alloc::handle_alloc_error(Self::layout())
        };

        this
    }

    /// Copies the vector into a new aligned allocation in `alloc`, surfacing allocation failure.
    ///
    /// # Errors
    ///
    /// Returns [`AllocError`] when the allocator cannot provide the buffer. No memory is leaked in
    /// that case.
    #[inline]
    pub fn try_new_in(value: &DVecN<N>, alloc: A) -> Result<Self, AllocError> {
        let layout = Self::layout();
        let allocation = alloc.allocate(layout)?;
        let ptr = allocation.cast::<f64>();

        // SAFETY: the buffer was just allocated for at least `N` components and cannot overlap the
        // borrowed source.
        unsafe {
            ptr::copy_nonoverlapping(value.as_array().as_ptr(), ptr.as_ptr(), N);
        }

        Ok(Self { ptr, alloc })
    }
}

const impl<const N: usize, A: Allocator> Deref for BoxedDVecN<N, A> {
    type Target = AlignedDVecN<N>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: `ptr` owns an initialized buffer of `N` components for as long as `self` lives,
        // allocated with the alignment of `f64x8` by `layout`.
        unsafe { AlignedDVecN::from_ref_unchecked(&*self.ptr.as_ptr().cast::<[f64; N]>()) }
    }
}

const impl<const N: usize, A: Allocator> DerefMut for BoxedDVecN<N, A> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: `ptr` owns an initialized buffer of `N` components for as long as `self` lives,
        // allocated with the alignment of `f64x8` by `layout`; the exclusive borrow of `self`
        // guards the exclusive reference.
        unsafe { AlignedDVecN::from_mut_unchecked(&mut *self.ptr.as_ptr().cast::<[f64; N]>()) }
    }
}

impl<const N: usize, A: Allocator + Clone> Clone for BoxedDVecN<N, A> {
    #[inline]
    fn clone(&self) -> Self {
        Self::new_in(DVecN::from_ref(self.as_array()), self.alloc.clone())
    }

    fn clone_from(&mut self, source: &Self) {
        // Both buffers share the same layout for a given `N`, so the
        // existing allocation is reused instead of reallocating.
        //
        // SAFETY: both pointers own initialized buffers of `N` components, and two live boxes
        // cannot alias.
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
        // SAFETY: `ptr` was allocated by `alloc` in `new_in` with the same layout and has not been
        // deallocated since.
        unsafe {
            self.alloc.deallocate(self.ptr.cast::<u8>(), Self::layout());
        }
    }
}

// SAFETY: the buffer is exclusively owned and its `f64` components are `Send` and `Sync`; the
// allocator's own thread-safety carries the bound.
unsafe impl<const N: usize, A: Allocator + Send> Send for BoxedDVecN<N, A> {}

// SAFETY: shared access only exposes `&[f64; N]`, which is `Sync`; the allocator's own
// thread-safety carries the bound.
unsafe impl<const N: usize, A: Allocator + Sync> Sync for BoxedDVecN<N, A> {}
