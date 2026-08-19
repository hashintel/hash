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
//! # The lifted grid
//!
//! The scalar rows are the type-level function: a lifted op on a derivation reads its output
//! domain off the operand domains' own row, so `Derivation<D> ⊗ U` claims exactly what `D ⊗ U`
//! claims, computed on the raw carriers. Sums and differences read the plain-domain escape
//! rows, products and quotients read the derivation-entering fat-exit rows, and a raw `f64`
//! operand keeps the fold's target unchanged, because a raw operand claims nothing and the
//! derivation defers every claim anyway.
//!
//! # The one downward escape
//!
//! Division by an in-flight derivation is the one lift where poison can leave silently: a
//! clean finite numerator over a denominator that overflowed to `±∞` gives `±0.0`, and the
//! escape vanishes before any finish can refuse it. The rounding is defensible - the true
//! quotient's magnitude is at most `|numerator| / f64::MAX`, and a positive-domain destination
//! still refuses the zero - but it rounds where every upward escape refuses. The divisor rows
//! taking a domain scalar are immune: a validated divisor is finite, and a zero divisor sends
//! the quotient up to `±∞` or NaN, which the finish catches.
//!
//! [`finish`]: Derivation::finish
//! [`finish_unchecked`]: Derivation::finish_unchecked
//! [`into_raw`]: Derivation::into_raw

use core::{fmt, ops};

use super::scalar::{DFinite, DNonNegative, DPositive, NonNegative};

/// Reads the raw carrier out of an operand.
///
/// The one vocabulary for every operand kind a fused op takes: a domain scalar reads its
/// validated value, and an in-flight derivation reads its unclaimed raw. A bound on this trait
/// lets one signature accept a mix of the two.
pub(crate) impl(self) const trait IntoCarrier: Sized {
    /// The raw carrier the operand computes in.
    type Carrier: Copy;

    /// Returns the raw carrier value.
    fn into_carrier(self) -> Self::Carrier;
}

const impl<D: Domain> IntoCarrier for Derivation<D> {
    type Carrier = D::Carrier;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.0
    }
}

/// A validated domain a derivation can finish into.
///
/// Implementations are one-liners over the domain's validating constructor, so the domain's
/// membership is stated exactly once.
pub(crate) impl(self) const trait Domain: [const] IntoCarrier {
    /// Validates a raw carrier value into the domain.
    fn validate(raw: Self::Carrier) -> Option<Self>;

    /// Claims a raw carrier value as a domain member without validating.
    ///
    /// The caller owns the membership argument.
    fn unchecked(raw: Self::Carrier) -> Self;
}

const impl IntoCarrier for DFinite {
    type Carrier = f64;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for DFinite {
    #[inline]
    fn validate(raw: f64) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f64) -> Self {
        Self::new_unchecked(raw)
    }
}

const impl IntoCarrier for DNonNegative {
    type Carrier = f64;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for DNonNegative {
    #[inline]
    fn validate(raw: f64) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f64) -> Self {
        Self::new_unchecked(raw)
    }
}

const impl IntoCarrier for DPositive {
    type Carrier = f64;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for DPositive {
    #[inline]
    fn validate(raw: f64) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f64) -> Self {
        Self::new_unchecked(raw)
    }
}

const impl IntoCarrier for NonNegative {
    type Carrier = f32;

    #[inline]
    fn into_carrier(self) -> Self::Carrier {
        self.get()
    }
}

const impl Domain for NonNegative {
    #[inline]
    fn validate(raw: f32) -> Option<Self> {
        Self::new(raw)
    }

    #[inline]
    fn unchecked(raw: f32) -> Self {
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

const impl<D> From<D> for Derivation<D>
where
    D: [const] Domain,
{
    /// Enters a validated value into the derivation on its carrier: the typed twin of
    /// [`raw`](Derivation::raw), seeded by the domain's own proof instead of no claim at all.
    #[inline]
    fn from(value: D) -> Self {
        Self(value.into_carrier())
    }
}

impl<D: Domain<Carrier = f64>> Derivation<D> {
    /// The zero seed of an accumulating derivation.
    pub(crate) const ZERO: Self = Self(0.0);

    /// Fuses `self · factor + addend` with one rounding, on the raw carrier.
    #[inline]
    pub(crate) const fn mul_add<F, A, O, U>(self, factor: F, addend: A) -> Derivation<U>
    where
        F: [const] IntoCarrier<Carrier = f64>,
        A: [const] IntoCarrier<Carrier = f64>,
        O: Domain<Carrier = f64>,
        U: Domain<Carrier = f64>,
        Self: ops::Mul<F, Output = Derivation<O>>,
        Derivation<O>: ops::Add<A, Output: Into<Derivation<U>>>,
    {
        Derivation(self.0.mul_add(factor.into_carrier(), addend.into_carrier()))
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

impl<D: Domain<Carrier: fmt::Debug>> fmt::Debug for Derivation<D> {
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

    /// Subtracts a raw offset, keeping the fold's target.
    ///
    /// A raw operand claims nothing, and the derivation already defers every claim, so the
    /// target domain rides through unchanged and the finish still decides.
    #[inline]
    fn sub(self, rhs: f64) -> Self {
        Self(self.0 - rhs)
    }
}

impl<D: Domain<Carrier = f64>> ops::Mul<f64> for Derivation<D> {
    type Output = Self;

    /// Scales by a raw factor, keeping the fold's target.
    ///
    /// A raw operand claims nothing, and the derivation already defers every claim, so the
    /// target domain rides through unchanged and the finish still decides.
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
    /// Accumulates in place within the fold's own domain.
    ///
    /// The scalar row must land back in `D`: an accumulation cannot retarget the derivation it
    /// grows.
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
    /// Accumulates an in-flight derivation in place, within the fold's own domain.
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
    use crate::math::{DFinite, DNonNegative, d_non_negative, d_positive};

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
        // The raw is finite, so the data is fine and the claim itself is wrong.
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
