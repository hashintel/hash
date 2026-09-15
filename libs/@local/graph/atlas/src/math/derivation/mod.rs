//! Floating-point computations validated at a chosen domain boundary.
//!
//! A [`Derivation`] carries a raw value and a target [`Domain`], without asserting membership
//! during arithmetic. [`finish`](Derivation::finish) validates the current value and returns
//! [`Diverged`] with that value on rejection. Use [`into_raw`](Derivation::into_raw) when the
//! destination needs the raw result, or [`finish_unchecked`](Derivation::finish_unchecked) when
//! you have established membership yourself.
//!
//! Delaying validation permits a reduction to check its final result once. A `checked_*` scalar
//! operation instead reports rejection at that operation. When an intermediate result must
//! satisfy a domain before further arithmetic, finish it there and begin another derivation.
//! For example, validating an accumulated denominator as positive establishes the condition
//! needed by a subsequent mean.
//!
//! # Result domains
//!
//! Typed operators select the result domain from the corresponding scalar operator's output.
//! If `D + U` returns `O`, adding `U` or `Derivation<U>` to `Derivation<D>` returns
//! `Derivation<O>`. Multiplication and division use the scalar operators that already return
//! derivations. Raw operands and negation keep the target domain unchanged. In-place addition
//! requires the corresponding scalar addition to return the existing target domain. In every case
//! the arithmetic uses the raw carriers, and membership remains deferred.
//!
//! # Exceptional intermediate values
//!
//! Validation observes the final value, not an error flag recording earlier operations. IEEE
//! arithmetic can turn an infinite intermediate into a finite result: a finite numerator divided
//! by an infinite denominator is signed zero. A finite or non-negative destination accepts that
//! zero, while a positive destination rejects it. If every intermediate must be finite, validate
//! at the required intermediate boundaries instead.
//!
//! A reduction using [`f64::min`] or [`f64::max`] can also discard a NaN: when exactly one operand
//! is NaN, these operations return the other operand. Final-value validation can then accept the
//! reduced value. Validate each input separately when the reduction must reject every non-finite
//! input.
//!
//! A refusal alone does not identify its cause or severity. [`Diverged`] preserves a non-finite
//! result or an out-of-domain finite value, such as a negative result destined for
//! [`DNonNegative`](super::DNonNegative), for the surrounding operation to interpret.

use core::{fmt, marker::Destruct, ops};

use self::domain::MulAdd;

mod domain;

pub(crate) use self::domain::{Domain, IntoCarrier};

/// A raw computation with a domain to validate at its finish.
///
/// Arithmetic makes no membership claim. [`finish`](Self::finish) checks the current value
/// against the target domain.
#[must_use = "a derivation claims nothing until it finishes"]
#[repr(transparent)]
pub(crate) struct Derivation<D: Domain>(D::Carrier);

/// A raw value rejected by domain validation or checked narrowing.
///
/// The value identifies what was rejected, without assigning a cause or severity.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Diverged<C> {
    /// The raw value the validation refused.
    pub raw: C,
}

impl<D: Domain> Derivation<D> {
    /// Begins a derivation from an unvalidated raw value.
    #[inline]
    pub(crate) const fn raw(value: D::Carrier) -> Self {
        Self(value)
    }

    /// Returns the raw value without domain validation.
    ///
    /// Use [`Self::finish`] when the destination requires a validated domain member.
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
    pub(crate) const fn finish(self) -> Result<D, Diverged<D::Carrier>>
    where
        D: [const] Domain + [const] Destruct,
    {
        match D::validate(self.0) {
            Some(value) => Ok(value),
            None => Err(Diverged { raw: self.0 }),
        }
    }

    /// Finishes the derivation without validating the raw value.
    ///
    /// You must establish that the current raw value satisfies the target domain's requirements.
    /// Use [`finish`](Self::finish) to validate other results.
    #[inline]
    pub(crate) fn finish_unchecked(self) -> D {
        D::unchecked(self.0)
    }

    /// Fuses `self · factor + addend` with one rounding at the carrier's precision.
    #[inline]
    pub(crate) const fn mul_add<F, A, O, U>(self, factor: F, addend: A) -> Derivation<U>
    where
        D::Carrier: [const] MulAdd,
        F: [const] IntoCarrier<Carrier = D::Carrier>,
        A: [const] IntoCarrier<Carrier = D::Carrier>,
        O: Domain<Carrier = D::Carrier>,
        U: Domain<Carrier = D::Carrier>,
        Self: ops::Mul<F, Output = Derivation<O>>,
        Derivation<O>: ops::Add<A, Output: Into<Derivation<U>>>,
    {
        Derivation(self.0.mul_add(factor.into_carrier(), addend.into_carrier()))
    }
}

const impl<D> From<D> for Derivation<D>
where
    D: [const] Domain,
{
    #[inline]
    fn from(value: D) -> Self {
        Self(value.into_carrier())
    }
}

impl<D: Domain<Carrier = f64>> Derivation<D> {
    /// The zero seed of an accumulating derivation.
    pub(crate) const ZERO: Self = Self(0.0);

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

impl<D: Domain<Carrier: fmt::Debug>> fmt::Debug for Derivation<D> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<D: Domain<Carrier: ops::Neg<Output = D::Carrier>>> ops::Neg for Derivation<D> {
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

impl<D: Domain<Carrier = f32>> ops::Mul<f32> for Derivation<D> {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: f32) -> Self {
        Self(self.0 * rhs)
    }
}

impl<D: Domain<Carrier = f64>> ops::Mul<f64> for Derivation<D> {
    type Output = Self;

    #[inline]
    fn mul(self, rhs: f64) -> Self {
        Self(self.0 * rhs)
    }
}

const impl<
    D: Domain<Carrier: [const] ops::Add<Output = D::Carrier>> + ops::Add<U, Output = O>,
    U: Domain<Carrier = D::Carrier> + [const] IntoCarrier<Carrier = D::Carrier>,
    O: Domain<Carrier = D::Carrier>,
> ops::Add<U> for Derivation<D>
{
    type Output = Derivation<O>;

    #[inline]
    fn add(self, rhs: U) -> Derivation<O> {
        Derivation(self.0 + rhs.into_carrier())
    }
}

const impl<
    D: Domain<Carrier: [const] ops::Add<Output = D::Carrier>> + ops::Add<U, Output = O>,
    U: Domain<Carrier = D::Carrier>,
    O: Domain<Carrier = D::Carrier>,
> ops::Add<Derivation<U>> for Derivation<D>
{
    type Output = Derivation<O>;

    #[inline]
    fn add(self, rhs: Derivation<U>) -> Self::Output {
        Derivation(self.0 + rhs.0)
    }
}

const impl<
    D: Domain<Carrier: [const] ops::AddAssign> + ops::Add<U, Output = D>,
    U: Domain<Carrier = D::Carrier> + [const] IntoCarrier<Carrier = D::Carrier>,
> ops::AddAssign<U> for Derivation<D>
{
    #[inline]
    fn add_assign(&mut self, rhs: U) {
        self.0 += rhs.into_carrier();
    }
}

const impl<
    D: Domain<Carrier: [const] ops::AddAssign> + ops::Add<U, Output = D>,
    U: Domain<Carrier = D::Carrier>,
> ops::AddAssign<Derivation<U>> for Derivation<D>
{
    #[inline]
    fn add_assign(&mut self, rhs: Derivation<U>) {
        self.0 += rhs.0;
    }
}

const impl<
    D: Domain<Carrier: [const] ops::Sub<Output = D::Carrier>> + ops::Sub<U, Output = O>,
    U: Domain<Carrier = D::Carrier> + [const] IntoCarrier<Carrier = D::Carrier>,
    O: Domain<Carrier = D::Carrier>,
> ops::Sub<U> for Derivation<D>
{
    type Output = Derivation<O>;

    #[inline]
    fn sub(self, rhs: U) -> Derivation<O> {
        Derivation(self.0 - rhs.into_carrier())
    }
}

const impl<
    D: Domain<Carrier: [const] ops::Sub<Output = D::Carrier>> + ops::Sub<U, Output = O>,
    U: Domain<Carrier = D::Carrier>,
    O: Domain<Carrier = D::Carrier>,
> ops::Sub<Derivation<U>> for Derivation<D>
{
    type Output = Derivation<O>;

    #[inline]
    fn sub(self, rhs: Derivation<U>) -> Self::Output {
        Derivation(self.0 - rhs.0)
    }
}

const impl<
    D: Domain<Carrier: [const] ops::Mul<Output = D::Carrier>> + ops::Mul<U, Output = Derivation<O>>,
    U: Domain<Carrier = D::Carrier> + [const] IntoCarrier<Carrier = D::Carrier>,
    O: Domain<Carrier = D::Carrier>,
> ops::Mul<U> for Derivation<D>
{
    type Output = Derivation<O>;

    #[inline]
    fn mul(self, rhs: U) -> Derivation<O> {
        Derivation(self.0 * rhs.into_carrier())
    }
}

const impl<
    D: Domain<Carrier: [const] ops::Mul<Output = D::Carrier>> + ops::Mul<U, Output = Derivation<O>>,
    U: Domain<Carrier = D::Carrier>,
    O: Domain<Carrier = D::Carrier>,
> ops::Mul<Derivation<U>> for Derivation<D>
{
    type Output = Derivation<O>;

    #[inline]
    fn mul(self, rhs: Derivation<U>) -> Self::Output {
        Derivation(self.0 * rhs.0)
    }
}

const impl<
    D: Domain<Carrier: [const] ops::Div<Output = D::Carrier>> + ops::Div<U, Output = Derivation<O>>,
    U: Domain<Carrier = D::Carrier> + [const] IntoCarrier<Carrier = D::Carrier>,
    O: Domain<Carrier = D::Carrier>,
> ops::Div<U> for Derivation<D>
{
    type Output = Derivation<O>;

    #[inline]
    fn div(self, rhs: U) -> Derivation<O> {
        Derivation(self.0 / rhs.into_carrier())
    }
}

const impl<
    D: Domain<Carrier: [const] ops::Div<Output = D::Carrier>> + ops::Div<U, Output = Derivation<O>>,
    U: Domain<Carrier = D::Carrier>,
    O: Domain<Carrier = D::Carrier>,
> ops::Div<Derivation<U>> for Derivation<D>
{
    type Output = Derivation<O>;

    #[inline]
    fn div(self, rhs: Derivation<U>) -> Self::Output {
        Derivation(self.0 / rhs.0)
    }
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::float_cmp,
        reason = "exactness assertions on raw carriers are bit-precise contracts"
    )]

    use super::{Derivation, Diverged, Domain as _};
    use crate::math::{
        DFinite, DNonNegative, Finite, NonNegative, Positive, d_non_negative, d_positive, finite,
        non_negative, positive,
    };

    #[test]
    fn poison_propagation() {
        let mut sum = Derivation::<DFinite>::ZERO;
        sum += Derivation::raw(1.0);
        sum += Derivation::raw(f64::NAN);
        sum += Derivation::raw(2.0);

        let carried = (-sum).mul_add(d_non_negative!(2.0), Derivation::raw(1.0)) / d_positive!(4.0);
        let diverged = carried.finish().expect_err("NaN survives every op");
        assert!(diverged.raw.is_nan());

        let overflowed =
            Derivation::<DFinite>::raw(f64::MAX).mul_add(d_non_negative!(2.0), Derivation::ZERO);
        assert_eq!(overflowed.finish(), Err(Diverged { raw: f64::INFINITY }));
    }

    #[test]
    fn finite_domain_miss() {
        let negative = Derivation::<DNonNegative>::ZERO - 3.0;

        assert_eq!(negative.finish(), Err(Diverged { raw: -3.0 }));
    }

    #[test]
    fn raw_carrier_ops() {
        let value = Derivation::<DFinite>::raw(2.0);

        assert_eq!((value - 5.0).into_raw(), -3.0);
        assert_eq!((value - Derivation::raw(0.5)).into_raw(), 1.5);
        assert_eq!((-value).into_raw(), -2.0);
        assert_eq!(
            value
                .mul_add(d_non_negative!(3.0), Derivation::raw(0.125))
                .into_raw(),
            2.0_f64.mul_add(3.0, 0.125)
        );
        assert_eq!((value / d_positive!(8.0)).into_raw(), 0.25);
    }

    #[test]
    fn fused_single_precision() {
        const VALUE: Derivation<Positive> =
            Derivation::from(positive!(2.0)).mul_add(non_negative!(3.0), positive!(0.125));

        assert_eq!(VALUE.finish(), Ok(positive!(6.125)));
        let overflowed = Derivation::from(Positive::MAX).mul_add(non_negative!(2.0), Positive::ONE);
        assert_eq!(overflowed.finish(), Err(Diverged { raw: f32::INFINITY }));
    }

    #[test]
    fn finite_signed_expression() {
        let product = finite!(-2.0) * positive!(3.0);
        let quotient = product * non_negative!(4.0) / positive!(8.0);
        assert_eq!(quotient.finish(), Ok(finite!(-3.0)));
        assert_eq!((-quotient).finish(), Ok(finite!(3.0)));

        let overflowed = finite!(-f32::MAX) * positive!(2.0);
        assert_eq!(
            overflowed.finish(),
            Err(Diverged {
                raw: f32::NEG_INFINITY
            })
        );
        let indeterminate = overflowed / (Positive::MAX * positive!(2.0));
        assert!(
            indeterminate
                .finish()
                .expect_err("infinity divided by infinity is NaN")
                .raw
                .is_nan()
        );
    }

    #[test]
    fn positive_underflow() {
        assert_eq!(
            (Positive::MIN * Positive::MIN).finish(),
            Err(Diverged { raw: 0.0 })
        );
        assert_eq!(
            (Positive::MIN / Positive::MAX).finish(),
            Err(Diverged { raw: 0.0 })
        );
    }

    #[test]
    fn finite_division_overflow() {
        assert_eq!(
            (finite!(f32::MAX) / Positive::MIN).finish(),
            Err(Diverged { raw: f32::INFINITY })
        );
        assert_eq!((finite!(-6.0) / positive!(2.0)).finish(), Ok(finite!(-3.0)));
    }

    #[test]
    fn finish_single_precision_zero() {
        assert_eq!(
            Derivation::<Positive>::raw(0.0).finish(),
            Err(Diverged { raw: 0.0 })
        );
        let nonnegative = Derivation::<NonNegative>::raw(-0.0)
            .finish()
            .expect("zero is nonnegative");
        assert_eq!(nonnegative.get().to_bits(), 0.0_f32.to_bits());
        let finite = Derivation::<Finite>::raw(-0.0)
            .finish()
            .expect("zero is finite");
        assert_eq!(finite.get().to_bits(), (-0.0_f32).to_bits());
    }

    #[test]
    fn finish_matches_constructor() {
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
