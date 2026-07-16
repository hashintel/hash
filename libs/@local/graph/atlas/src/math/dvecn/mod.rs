//! Double-precision `N`-dimensional vectors and their reductions.
//!
//! [`DVecN`] is the `f64` twin of [`VecN`](super::VecN), for the few
//! consumers whose algorithms demand double precision throughout, such as
//! classifier logits feeding a quasi-Newton optimizer. Its reductions
//! ([`softmax`](DVecN::softmax), [`log_sum_exp`](DVecN::log_sum_exp))
//! shift, exponentiate, and fold four lanes at a time; the exponential
//! goes through [`kernel::exp_f64x4`](super::kernel), which currently
//! lowers to one libm call per lane.

use core::simd::{Simd, f32x8, f64x8, num::SimdFloat as _};

use super::{
    kernel::{exp_f64x4, mul_add_f64x8},
    vecn::VecN,
};

#[cfg(test)]
mod tests;

/// An `N`-dimensional vector of `f64` components.
///
/// A [`DVecN`] is guaranteed to have the same layout as `[f64; N]`, so
/// borrowed arrays convert in place through [`from_ref`](Self::from_ref)
/// and [`from_mut`](Self::from_mut) without copying.
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
        // SAFETY: `Self` is a transparent wrapper around `[f64; N]`, so the
        // cast preserves layout and validity; the mutable borrow is carried
        // through to the wrapper unchanged.
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
    /// NaN components lose, following [`f64::max`]; the maximum of the
    /// empty vector is [`f64::NEG_INFINITY`], the identity of the fold.
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
    /// The components are folded four lanes at a time; the sum of the
    /// empty vector is zero.
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

    /// Computes the softmax of the components with max-shifting for
    /// stability.
    ///
    /// The maximum component is subtracted before exponentiation, so the
    /// result is finite for any finite input, including components with
    /// magnitudes far beyond the range where a naive `exp` overflows.
    /// Every output lies in `[0, 1]`, the outputs sum to 1 up to rounding
    /// whenever `N >= 1`, and shifting all components by a common constant
    /// leaves the result unchanged up to rounding. For `N = 0` the result
    /// is the empty vector.
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

    /// Computes `ln(sum(exp(components)))` with max-shifting for
    /// stability.
    ///
    /// The maximum is factored out as `max + ln(sum(exp(value - max)))`,
    /// keeping every intermediate exponent non-positive: the result is
    /// finite for any finite, non-empty input. A single-component vector
    /// returns that component exactly, and `N` equal components give
    /// `value + ln(N)`. For `N = 0` the result is [`f64::NEG_INFINITY`],
    /// the logarithm of the empty sum.
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

    /// Computes `exp(component - shift)` for every component and their
    /// sum in a single pass, four lanes at a time.
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

    /// Adds `factor` times a working-precision vector, component-wise.
    ///
    /// Each `f32` component of `direction` widens to `f64` exactly, so the
    /// update `self += direction * factor` carries only the rounding of
    /// the fused multiply-add itself. This is the gradient-accumulation
    /// kernel of optimizers that keep their state in double precision
    /// over single-precision data.
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
