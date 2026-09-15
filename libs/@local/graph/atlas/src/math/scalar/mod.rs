//! Validated scalar domains, special functions and checked precision conversions.
//!
//! The scalar types express finiteness, sign and interval requirements. Their checked
//! constructors reject out-of-domain values. Unchecked constructors require the same facts from
//! you. [`softplus`], the [`Huber penalty`](NonNegative::huber) and the
//! [`logistic function`](NonNegative::sigmoid) supply stable forms for scalar losses and
//! probabilities. Vector reductions such as softmax and log-sum-exp live on
//! [`DVecN`](super::DVecN).
//!
//! # Precision ownership
//!
//! [`Finite`], [`Positive`] and [`NonNegative`] use `f32`. Their `D`-prefixed counterparts use
//! `f64` for calculations that need more exponent range or significand precision. Widening an
//! `f32` value is exact. It cannot recover information already lost, but it avoids further
//! single-precision rounding in an accumulation. Keep the wider result until a storage or
//! computation boundary requires narrowing.
//!
//! Fractions use `f64` to retain distinctions near the interval endpoints. The nearest `f32`
//! below one is 2⁻²⁴ away, and `1 − 10⁻⁹` rounds to one in that precision. Count ratios use
//! [`UnitFraction::ratio`], which documents both the exact-count range and the additional
//! rounding above 2⁵³. A wider representation does not itself establish the statistical
//! accuracy of a derived quantity.
//!
//! # Representation and conversion
//!
//! Scalar [`Serialize`](serde::Serialize) implementations write the underlying primitive number.
//! [`Deserialize`](serde::Deserialize) applies the checked constructor after reading that number,
//! rejecting out-of-domain values and performing the constructor's zero normalization. Infallible
//! conversions preserve the numeric value except for integer-to-float rounding where documented.
//!
//! # Operator edge contracts
//!
//! Some operations preserve their result domain for every valid operand. A difference of two
//! finite non-negative values has magnitude at most the larger operand and remains finite.
//! A sum can overflow, and a product or quotient can also underflow. Multiplication by a
//! positive unit fraction prevents overflow but can still round a positive result to zero.
//! These range facts do not quantify probabilities of failure for a workload.
//!
//! | Result form | Validation boundary |
//! |---|---|
//! | A domain scalar | The operation is closed over its operands, or its documented result-range requirement must hold. |
//! | `Option` from `checked_*` | The operation rejects a rounded result outside the domain. |
//! | [`Derivation`](super::Derivation) | Arithmetic keeps the raw value until [`finish`](super::Derivation::finish) validates it. |
//! | A raw float | The operation makes no domain claim. |
//!
//! Choose a checked operation or a derivation when the rounded result's membership is not
//! established. A derivation may finish at an intermediate domain boundary before a new
//! calculation begins.
mod d_non_negative;
mod d_positive;
mod finite;
mod greater_than_one;
mod log2;
mod negative;
mod non_negative;
mod open_unit_fraction;
mod positive;
mod positive_unit_fraction;
#[cfg(test)]
mod tests;
mod unit_fraction;

pub(crate) use d_non_negative::DNonNegative;
#[cfg(test)]
pub(crate) use d_non_negative::d_non_negative;
pub(crate) use d_positive::{DPositive, d_positive};
#[cfg(test)]
pub(crate) use finite::finite;
pub(crate) use finite::{DFinite, Finite, d_finite};
pub(crate) use greater_than_one::GreaterThanOne;
#[cfg(test)]
pub(crate) use greater_than_one::greater_than_one;
pub(crate) use log2::Log2;
pub(crate) use negative::Negative;
pub(crate) use non_negative::{NonNegative, non_negative};
pub(crate) use open_unit_fraction::{OpenUnitFraction, open_unit_fraction};
pub(crate) use positive::{Positive, positive};
pub(crate) use positive_unit_fraction::{PositiveUnitFraction, positive_unit_fraction};
pub(crate) use unit_fraction::{UnitFraction, unit_fraction};

/// Validates a nonzero literal at compile time.
///
/// A `const` block validates the literal with [`NonZero::new`](core::num::NonZero::new) during
/// compilation. A zero literal fails the build. The expansion's fully qualified type name needs no
/// import in the calling scope.
macro_rules! nz {
    ($value:expr) => {
        const { ::core::num::NonZero::new($value).expect("the literal is nonzero") }
    };
}
pub(crate) use nz;

/// Implements [`zerocopy::TryFromBytes`] for `repr(transparent)` scalar newtypes.
///
/// Accepts a comma-separated list of `Type[Primitive]` pairs, with an optional trailing comma. Each
/// generated validity check copies the stored primitive and accepts it exactly when
/// `Type::is_canonical` returns `true`.
///
/// # Safety
///
/// Each type must be `repr(transparent)` over the named primitive, whose initialized bit patterns
/// are all valid. Its `is_canonical` method must accept only representations satisfying all of the
/// type's invariants. The exact-size cast checks size equality, not these representation and
/// validity obligations.
macro_rules! unsafe_impl_try_from_bytes {
    ($($ty:ident[$prim:ty]),* $(,)?) => {
        $(
            // zerocopy reserves TryFromBytes for its derive and excludes hidden validation APIs from compatibility guarantees. Recheck this implementation when updating the dependency.
            // SAFETY: TryFromBytes requires every accepted candidate to be a valid value. The macro's invocation contract establishes transparent primitive storage and a predicate that accepts only valid representations. The exact-size unaligned read preserves those bits, and the predicate validates them. Every accepted candidate therefore satisfies the type's invariants.
            unsafe impl zerocopy::TryFromBytes for $ty {
                fn only_derive_is_allowed_to_implement_this_trait() {}

                #[inline]
                fn is_bit_valid<A: zerocopy::pointer::invariant::Alignment>(
                    candidate: zerocopy::Maybe<'_, Self, A>,
                ) -> bool {
                    // Reinterpret the candidate as an unaligned primitive: the same size, every
                    // bit pattern valid, at any alignment. `read` copies the value out of the
                    // shared referent.
                    let candidate = candidate.transmute_with::<
                        zerocopy::Unalign<$prim>,
                        zerocopy::pointer::invariant::Valid,
                        zerocopy::pointer::cast::CastSizedExact,
                        zerocopy::BecauseImmutable,
                    >();

                    Self::is_canonical(candidate.read().into_inner())
                }
            }
        )*
    };
}
pub(crate) use unsafe_impl_try_from_bytes;

/// Implements comparisons and scaling against a type's raw primitive.
///
/// Accepts a comma-separated list of `Type[Primitive]` pairs, with an optional trailing comma. Each
/// type must have its primitive value in field `0`.
///
/// Under IEEE semantics, a typed value never equals NaN, and signed zeros compare equal.
/// Multiplication by a raw operand returns the raw primitive in either order because its result can
/// leave the type's domain. A raw accumulator also supports `*=` by the typed factor.
macro_rules! raw_interop {
    ($($ty:ident[$prim:ty]),* $(,)?) => {
        $(
            const impl PartialEq<$prim> for $ty {
                #[inline]
                fn eq(&self, other: &$prim) -> bool {
                    // numeric, not bitwise: the raw side may be `-0.0` or NaN, and the
                    // comparison must follow IEEE semantics for both
                    self.0 == *other
                }
            }

            const impl PartialEq<$ty> for $prim {
                #[inline]
                fn eq(&self, other: &$ty) -> bool {
                    *self == other.0
                }
            }

            const impl PartialOrd<$prim> for $ty {
                #[inline]
                fn partial_cmp(&self, other: &$prim) -> Option<core::cmp::Ordering> {
                    self.0.partial_cmp(other)
                }

                // one float compare each, no Option round-trip for LLVM to fold
                #[inline]
                fn lt(&self, other: &$prim) -> bool {
                    self.0 < *other
                }

                #[inline]
                fn le(&self, other: &$prim) -> bool {
                    self.0 <= *other
                }

                #[inline]
                fn gt(&self, other: &$prim) -> bool {
                    self.0 > *other
                }

                #[inline]
                fn ge(&self, other: &$prim) -> bool {
                    self.0 >= *other
                }
            }

            const impl PartialOrd<$ty> for $prim {
                #[inline]
                fn partial_cmp(&self, other: &$ty) -> Option<core::cmp::Ordering> {
                    self.partial_cmp(&other.0)
                }

                #[inline]
                fn lt(&self, other: &$ty) -> bool {
                    *self < other.0
                }

                #[inline]
                fn le(&self, other: &$ty) -> bool {
                    *self <= other.0
                }

                #[inline]
                fn gt(&self, other: &$ty) -> bool {
                    *self > other.0
                }

                #[inline]
                fn ge(&self, other: &$ty) -> bool {
                    *self >= other.0
                }
            }

            const impl core::ops::Mul<$prim> for $ty {
                type Output = $prim;

                #[inline]
                fn mul(self, rhs: $prim) -> $prim {
                    self.0 * rhs
                }
            }

            const impl core::ops::Mul<$ty> for $prim {
                type Output = $prim;

                #[inline]
                fn mul(self, rhs: $ty) -> $prim {
                    self * rhs.0
                }
            }

            const impl core::ops::MulAssign<$ty> for $prim {
                #[inline]
                fn mul_assign(&mut self, rhs: $ty) {
                    *self *= rhs.0;
                }
            }
        )*
    };
}
pub(crate) use raw_interop;

/// Computes `ln(1 + exp(value))` in a numerically stable form.
///
/// The evaluation uses `max(value, 0) + ln_1p(exp(-|value|))`, which keeps the intermediate
/// exponent non-positive: the result is finite for every finite input, approaching `value` itself
/// for large positive inputs and `0` for large negative inputs. The output is non-negative and
/// satisfies `softplus(value) - softplus(-value) == value` up to rounding.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{softplus};
///
/// // At 50 the correction is smaller than one f32 rounding step.
/// assert_eq!(softplus(50.0), 50.0);
/// assert!(softplus(-50.0) < 1e-20);
/// assert!((softplus(0.0) - core::f32::consts::LN_2).abs() < 1e-7);
/// ```
#[inline]
#[must_use]
pub(crate) fn softplus(value: f32) -> f32 {
    value.max(0.0) + (-value.abs()).exp().ln_1p()
}

/// Narrows an `f64` to `f32`, permitting rounding.
///
/// Converts with round-to-nearest and returns the result whenever it is finite. Returns [`None`]
/// for NaN and for inputs that round to either infinity. An input slightly beyond [`f32::MAX`]
/// can still round to that finite endpoint. Negative zero keeps its sign bit.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::math::{narrow_f32};
///
/// // Rounds to the nearest `f32`.
/// assert_eq!(narrow_f32(0.1), Some(0.1_f32));
/// // Beyond the `f32` range.
/// assert_eq!(narrow_f32(1e300), None);
/// assert_eq!(narrow_f32(f64::NAN), None);
/// ```
#[inline]
#[must_use]
pub(crate) const fn narrow_f32(value: f64) -> Option<f32> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the truncating cast is the operation itself; the result is checked for \
                  finiteness before being returned"
    )]
    let narrowed = value as f32;

    if narrowed.is_finite() {
        Some(narrowed)
    } else {
        None
    }
}
