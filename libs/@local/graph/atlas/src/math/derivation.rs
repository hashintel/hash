//! Raw derivations that make their one claim at the end.
//!
//! A [`Derivation`] is an in-flight computation's raw value with no claim attached. The
//! arithmetic runs on the raw carrier exactly as it would on bare floats, and poison propagates
//! through IEEE semantics instead of being asserted away mid-fold. [`finish`] makes the one
//! claim at the end, where the result validates into its target [`Domain`] or comes back as
//! [`Diverged`] with the raw evidence. A raw-on-purpose destination exits through [`into_raw`]
//! instead, and a destination that owns a membership theorem exits through [`finish_unchecked`]
//! with the theorem stated beside the call.
//!
//! # Which op form a fold takes
//!
//! A fold bounded by a totality theorem keeps the plain escape op: the theorem is the claim and
//! the debug assertion is its net. A fold that refuses at its own site keeps the `checked_*`
//! form. An unbounded, data-dependent fold takes a derivation, because no theorem covers the
//! claim and the refusal belongs at the consumer's own finish rather than at every intermediate.
//! Count the consumers per site before choosing. A site with one consumer and one refusal does
//! not need three forms.
//!
//! # Reading a refused finish
//!
//! [`Diverged`] holds the raw value, and the raw value names the severity. A non-finite raw is
//! an overflow or an indeterminate form, the expected numerical refusal, and the consumer
//! refuses the reading by name. A finite raw that misses the domain, such as a negative value
//! finishing into [`DNonNegative`], is a wrong claim - the derivation was typed at the wrong
//! domain, and the defect is the finish's type rather than the data.
//!
//! # Domain transitions
//!
//! A finish followed by a re-entry is deliberate. An accumulated total that finishes
//! positive and re-enters a mean's derivation marks exactly where the codomain switches, and
//! collapsing the two derivations into one would erase the intermediate claim the second one
//! builds on.
//!
//! # Laundering folds
//!
//! Where sums and products propagate poison, maxima and minima launder it. IEEE `maxNum` skips
//! NaN, and the sysroot sources confirm both float forms do the same: `Simd::simd_max` lowers
//! to the `maximum_number` intrinsic, while `Simd::reduce_max` folds `f64::max` from a NaN
//! seed, so one poisoned lane among finite lanes vanishes. A max or min op on a derivation must
//! therefore preserve poison by construction when a consumer demands one, and none does yet. The
//! SIMD twin of this type is a lanes-plus-validity-mask pair for the same reason, and the
//! uniform fit's `FitSums` accumulator hand-rolls that shape today.
//!
//! [`finish`]: Derivation::finish
//! [`finish_unchecked`]: Derivation::finish_unchecked
//! [`into_raw`]: Derivation::into_raw

use core::{fmt, ops};

use super::scalar::{DFinite, DNonNegative, DPositive};

/// A validated domain a derivation can finish into.
///
/// Implementations are one-liners over the domain's validating constructor, so the domain's
/// membership is stated exactly once.
pub(crate) impl(self) trait Domain: Sized {
    /// The raw carrier the derivation computes in.
    type Carrier: Copy + fmt::Debug;

    /// Validates a raw carrier value into the domain.
    fn validate(raw: Self::Carrier) -> Option<Self>;

    /// Claims a raw carrier value as a domain member without validating.
    ///
    /// The caller owns the membership argument.
    fn unchecked(raw: Self::Carrier) -> Self;
}

impl Domain for DFinite {
    type Carrier = f64;

    #[inline]
    fn validate(raw: f64) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f64) -> Self {
        Self::new_unchecked(raw)
    }
}

impl Domain for DNonNegative {
    type Carrier = f64;

    #[inline]
    fn validate(raw: f64) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f64) -> Self {
        Self::new_unchecked(raw)
    }
}

/// An unclaimed value in flight toward its domain.
///
/// The wrapper is the target domain's name attached to a raw value, and it asserts nothing
/// about the bits it holds. Every op computes on the raw carrier, and [`finish`](Self::finish) is
/// where the domain's claim is made.
#[must_use = "a derivation claims nothing until it finishes"]
#[repr(transparent)]
pub(crate) struct Derivation<D: Domain>(D::Carrier);

/// A finished derivation whose raw value missed its domain.
///
/// The raw value is the evidence: non-finite is the expected numerical refusal, and a finite
/// miss is a wrong claim on the wrong domain.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Diverged<C> {
    /// The raw value the validation refused.
    pub raw: C,
}

impl<D: Domain> Derivation<D> {
    /// Enters a raw value into the derivation.
    ///
    /// No claim is made or checked. The value is whatever it is until the finish.
    #[inline]
    pub(crate) const fn raw(value: D::Carrier) -> Self {
        Self(value)
    }

    /// Exits with the raw value, claiming nothing.
    ///
    /// For destinations that are raw on purpose, such as the solver objective, where a
    /// non-finite value must reach the later refusal that names it rather than refuse here.
    /// Where the destination wants the domain, [`finish`](Self::finish) claims it instead.
    #[inline]
    #[must_use]
    pub(crate) const fn into_raw(self) -> D::Carrier {
        self.0
    }

    /// Validates the raw value into the domain.
    ///
    /// # Errors
    ///
    /// Returns [`Diverged`] carrying the raw value when it lies outside the domain.
    #[inline]
    pub(crate) fn finish(self) -> Result<D, Diverged<D::Carrier>> {
        D::validate(self.0).ok_or(Diverged { raw: self.0 })
    }

    /// Finishes the derivation without validating the raw value.
    ///
    /// For a destination that owns a membership theorem, stated beside the call. Where no
    /// theorem covers the raw value, [`finish`](Self::finish) validates instead.
    #[inline]
    pub(crate) fn finish_unchecked(self) -> D {
        D::unchecked(self.0)
    }
}

impl<D: Domain<Carrier = f64>> Derivation<D> {
    /// The zero seed of an accumulating derivation.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Fuses `self · factor + addend` with one rounding, on the raw carrier.
    #[inline]
    pub(crate) const fn mul_add(self, factor: f64, addend: Self) -> Self {
        Self(self.0.mul_add(factor, addend.0))
    }

    /// Returns the square root of `self`, with one rounding, on the raw carrier.
    #[inline]
    pub(crate) fn sqrt(self) -> Self {
        Self(self.0.sqrt())
    }
}

impl<D: Domain> Clone for Derivation<D> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<D: Domain> Copy for Derivation<D> {}

impl<D: Domain> fmt::Debug for Derivation<D> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<D: Domain<Carrier = f64>> ops::Neg for Derivation<D> {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self {
        Self(-self.0)
    }
}

impl<D: Domain<Carrier = f64>> ops::Sub<f64> for Derivation<D> {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: f64) -> Self {
        Self(self.0 - rhs)
    }
}

impl<D: Domain<Carrier = f64>> ops::Sub for Derivation<D> {
    type Output = Self;

    #[inline]
    fn sub(self, rhs: Self) -> Self {
        Self(self.0 - rhs.0)
    }
}

impl<D: Domain<Carrier = f64>> ops::AddAssign for Derivation<D> {
    #[inline]
    fn add_assign(&mut self, rhs: Self) {
        self.0 += rhs.0;
    }
}

impl ops::AddAssign<DNonNegative> for Derivation<DNonNegative> {
    /// Accumulates a certified value, on the raw carrier.
    #[inline]
    fn add_assign(&mut self, rhs: DNonNegative) {
        self.0 += rhs.get();
    }
}

impl ops::AddAssign<DFinite> for Derivation<DFinite> {
    /// Accumulates a certified value, on the raw carrier.
    #[inline]
    fn add_assign(&mut self, rhs: DFinite) {
        self.0 += rhs.get();
    }
}

impl ops::Mul<DNonNegative> for Derivation<DNonNegative> {
    type Output = Self;

    /// Multiplies by a certified value, on the raw carrier.
    #[inline]
    fn mul(self, rhs: DNonNegative) -> Self {
        Self(self.0 * rhs.get())
    }
}

impl<D: Domain<Carrier = f64>> ops::Div<DPositive> for Derivation<D> {
    type Output = Self;

    /// Divides by a certified positive, on the raw carrier.
    #[inline]
    fn div(self, rhs: DPositive) -> Self {
        Self(self.0 / rhs.get())
    }
}

impl From<DNonNegative> for Derivation<DNonNegative> {
    /// Enters a certified value, which is unclaimed from here on.
    #[inline]
    fn from(value: DNonNegative) -> Self {
        Self(value.get())
    }
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::float_cmp,
        reason = "exactness assertions on raw carriers are bit-precise contracts"
    )]

    use super::{Derivation, Diverged, Domain as _};
    use crate::math::{DFinite, DNonNegative, d_positive};

    #[test]
    fn poison_propagates_through_the_ops_and_surfaces_at_the_finish() {
        let mut sum = Derivation::<DFinite>::ZERO;
        sum += Derivation::raw(1.0);
        sum += Derivation::raw(f64::NAN);
        sum += Derivation::raw(2.0);

        let carried = (-sum).mul_add(2.0, Derivation::raw(1.0)) / d_positive!(4.0);
        let diverged = carried.finish().expect_err("NaN survives every op");
        assert!(diverged.raw.is_nan());

        let overflowed = Derivation::<DFinite>::raw(f64::MAX).mul_add(2.0, Derivation::ZERO);
        assert_eq!(overflowed.finish(), Err(Diverged { raw: f64::INFINITY }));
    }

    #[test]
    fn a_finite_domain_miss_carries_its_wrong_claim_as_evidence() {
        // The raw is finite, so the data is fine and the claim itself is wrong.
        let negative = Derivation::<DNonNegative>::ZERO - 3.0;

        assert_eq!(negative.finish(), Err(Diverged { raw: -3.0 }));
    }

    #[test]
    fn the_ops_compute_the_raw_carrier_bytes() {
        let value = Derivation::<DFinite>::raw(2.0);

        assert_eq!((value - 5.0).into_raw(), -3.0);
        assert_eq!((value - Derivation::raw(0.5)).into_raw(), 1.5);
        assert_eq!((-value).into_raw(), -2.0);
        assert_eq!(
            value.mul_add(3.0, Derivation::raw(0.125)).into_raw(),
            2.0_f64.mul_add(3.0, 0.125)
        );
        assert_eq!((value / d_positive!(8.0)).into_raw(), 0.25);
    }

    #[test]
    fn finish_agrees_with_the_domain_constructor() {
        assert_eq!(
            Derivation::<DFinite>::raw(-1.5).finish(),
            Ok(DFinite::new(-1.5).expect("-1.5 is finite"))
        );
        assert_eq!(DFinite::validate(f64::INFINITY), None);
        assert_eq!(
            DNonNegative::validate(0.0),
            Some(DNonNegative::new(0.0).expect("zero is non-negative"))
        );
    }
}
