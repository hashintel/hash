//! Numerically stable scalar special functions with validated domains.
//!
//! Checked float narrowing rides beside them.
//!
//! These formalize numeric patterns that recur across the crate: a stable softplus and the Huber
//! penalty for layout losses, checked `f64` to `f32` narrowing for persisted coordinates, the
//! unit-interval fractions [`UnitFraction`], [`PositiveUnitFraction`] and [`OpenUnitFraction`],
//! and the finiteness-only
//! guards [`Finite`] and [`DFinite`] for signed quantities, all validated once at construction and
//! carried by configuration knobs and measured shares alike. Vector reductions such as softmax and
//! log-sum-exp live on [`DVecN`](super::DVecN).
mod d_non_negative;
mod d_positive;
mod finite;
mod greater_than_one;
mod log2;
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
pub(crate) use finite::{DFinite, Finite};
#[cfg(test)]
pub(crate) use finite::{d_finite, finite};
pub(crate) use greater_than_one::GreaterThanOne;
#[cfg(test)]
pub(crate) use greater_than_one::greater_than_one;
pub(crate) use log2::Log2;
pub(crate) use non_negative::{NonNegative, non_negative};
pub(crate) use open_unit_fraction::{OpenUnitFraction, open_unit_fraction};
pub(crate) use positive::{Positive, positive};
pub(crate) use positive_unit_fraction::PositiveUnitFraction;
#[cfg(test)]
pub(crate) use positive_unit_fraction::positive_unit_fraction;
pub(crate) use unit_fraction::{UnitFraction, unit_fraction};

/// Validates a nonzero literal at compile time.
///
/// The expansion is a `const` block over [`NonZero::new`](core::num::NonZero::new), so a zero
/// literal fails the build instead of a test run. The expansion names `NonZero` unqualified, and
/// the calling scope imports it.
macro_rules! nz {
    ($value:expr) => {
        const { NonZero::new($value).expect("the literal is nonzero") }
    };
}
pub(crate) use nz;

/// Implements [`zerocopy::TryFromBytes`] for `repr(transparent)` scalar newtypes.
///
/// A derive states a type's bit validity as its fields' bit validity, and a raw primitive field
/// admits every bit pattern, so a domain-validated newtype writes the impl by hand. The shape is
/// zerocopy's own `NonZero` impl: reinterpret the candidate as an unaligned primitive and copy
/// the value out, accepting exactly the bit patterns the type's `is_canonical` accepts. This is
/// what lets a mapped byte region serve typed rows, the domain validated as the bytes are read.
///
/// Soundness rides on two facts per listed type. The layout claim, `repr(transparent)` over the
/// named primitive, is checked at compile time: the exact-size cast refuses a size mismatch. The
/// domain claim is `is_canonical`'s contract - `true` exactly for the bit patterns the validating
/// constructors can store - which its construct-and-compare body takes from the constructor
/// itself.
macro_rules! unsafe_impl_try_from_bytes {
    ($($ty:ident[$prim:ty]),* $(,)?) => {
        $(
            // SAFETY: `is_bit_valid` returns `true` exactly when the candidate's bytes hold a
            // valid value. The type is `repr(transparent)` over a primitive that every
            // initialized byte pattern inhabits, so the read below yields the stored value, and
            // `is_canonical` accepts exactly the bit patterns the validating constructors can
            // store.
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
/// The generated comparisons are numeric rather than bitwise: the raw side may be `-0.0` or NaN,
/// and the comparison follows IEEE semantics for both, so a typed value never equals NaN. The
/// product with an arbitrary raw operand can leave the domain, so multiplication in either order
/// returns the raw primitive. A raw accumulator takes `*=` by the typed factor.
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

                /// Scales a raw float.
                ///
                /// The raw operand is arbitrary, so the product can leave the domain and returns
                /// a raw float.
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
                /// Scales a raw float in place.
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
/// # Examples
///
/// ```ignore
/// // A naive `exp(50.0)` loses the asymptote. The stable form is exact.
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
/// This converts with round-to-nearest and returns the result whenever it is finite. Inputs whose
/// magnitude exceeds the `f32` range, the infinities, and NaN all yield [`None`]. Negative zero
/// narrows to negative zero, preserving the sign bit.
///
/// For a conversion that also demands bit-exact representability, use [`narrow_f32_exact`].
///
/// # Examples
///
/// ```ignore
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

/// Narrows an `f64` to `f32` when the value is exactly representable.
///
/// The conversion succeeds precisely when the input is finite and widening the narrowed result back
/// to `f64` reproduces the input bit for bit; the returned `f32` therefore denotes the same real
/// number as the input. Values that would round, overflow the `f32` range, or fail to be finite
/// yield [`None`]. Negative zero is exactly representable and keeps its sign bit.
///
/// For a conversion that tolerates rounding, use [`narrow_f32`].
///
/// # Examples
///
/// ```ignore
/// assert_eq!(narrow_f32_exact(0.25), Some(0.25_f32));
/// // 0.1 has no exact `f32` representation.
/// assert_eq!(narrow_f32_exact(0.1), None);
/// ```
#[inline]
#[must_use]
pub(crate) const fn narrow_f32_exact(value: f64) -> Option<f32> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the truncating cast is the operation itself; the result is checked for \
                  bit-exact round-tripping before being returned"
    )]
    let narrowed = value as f32;
    // `f64::from` is not callable in const contexts; the widening cast is
    // lossless.
    let widened = narrowed as f64;

    if narrowed.is_finite() && widened.to_bits() == value.to_bits() {
        Some(narrowed)
    } else {
        None
    }
}
