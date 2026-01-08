//! Floating-point number representation for the MIR interpreter.

use core::{cmp, ops::Neg};

use hashql_core::value::Float;

use crate::{body::constant::Int, macros::forward_ref_unop};

#[derive(Debug, Copy, Clone)]
pub enum Numeric {
    Num(Num),
    Int(Int),
}

/// A floating-point number value with total ordering semantics.
///
/// Wraps an [`f64`] and implements [`Ord`] using [`f64::total_cmp`], which follows
/// the IEEE 754 `totalOrder` predicate.
#[derive(Debug, Copy, Clone)]
pub struct Num {
    value: f64,
}

impl Num {
    /// Returns the underlying [`f64`] value.
    #[must_use]
    pub const fn as_f64(self) -> f64 {
        self.value
    }

    /// Attempts to convert this value to [`i128`] by truncation toward zero.
    ///
    /// Returns [`None`] for values outside the representable range, including
    /// NaN and infinities.
    ///
    /// Adapted from the `num-traits` crate.
    #[expect(unsafe_code, clippy::cast_precision_loss)]
    fn to_i128(self) -> Option<i128> {
        // We can't represent `i128::MIN - 1` exactly, but there's no fractional part
        // at this magnitude, so we use an inclusive `MIN` boundary.
        const MIN: f64 = i128::MIN as f64;
        // `i128::MAX` rounds up to `2^127` (i.e., `i128::MAX + 1`) when cast to `f64`,
        // so we use it as an exclusive upper bound.
        const MAX_P1: f64 = i128::MAX as f64;

        let this = self.as_f64();

        if (MIN..MAX_P1).contains(&this) {
            // SAFETY: The value is within the representable range of `i128`.
            return Some(unsafe { this.to_int_unchecked::<i128>() });
        }

        None
    }

    /// Compares this value with an [`Int`] using total ordering semantics.
    ///
    /// For values that can be converted to [`i128`], compares the integer parts
    /// first, then uses the fractional part as a tiebreaker. For out-of-range
    /// values (including NaN and infinities), the sign bit determines ordering:
    /// negative values are less than all integers, positive values are greater.
    pub(crate) fn cmp_int(self, int: &Int) -> cmp::Ordering {
        let Some(this_int) = self.to_i128() else {
            return if self.as_f64().is_sign_negative() {
                cmp::Ordering::Less
            } else {
                cmp::Ordering::Greater
            };
        };

        let frac = self.as_f64().fract();

        this_int.cmp(&int.as_int()).then_with(|| {
            if frac > 0.0 {
                cmp::Ordering::Greater
            } else if frac < 0.0 {
                cmp::Ordering::Less
            } else {
                cmp::Ordering::Equal
            }
        })
    }
}

impl<'heap> From<Float<'heap>> for Num {
    fn from(value: Float<'heap>) -> Self {
        Self {
            value: value.as_f64(),
        }
    }
}

impl From<f64> for Num {
    #[inline]
    fn from(value: f64) -> Self {
        Self { value }
    }
}

impl PartialEq for Num {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl PartialEq<Int> for Num {
    #[inline]
    fn eq(&self, other: &Int) -> bool {
        self.cmp_int(other) == cmp::Ordering::Equal
    }
}

impl PartialEq<Num> for Int {
    #[inline]
    fn eq(&self, other: &Num) -> bool {
        other.cmp_int(self) == cmp::Ordering::Equal
    }
}

impl Eq for Num {}

impl PartialOrd for Num {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialOrd<Int> for Num {
    #[inline]
    fn partial_cmp(&self, other: &Int) -> Option<cmp::Ordering> {
        Some(self.cmp_int(other))
    }
}

impl PartialOrd<Num> for Int {
    #[inline]
    fn partial_cmp(&self, other: &Num) -> Option<cmp::Ordering> {
        Some(other.cmp_int(self).reverse())
    }
}

impl Ord for Num {
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        // To have uniform behaviour when looking at `Int` and `Num` we collapse `0` to a single
        // order value.
        if self.value == 0.0 && other.value == 0.0 {
            return cmp::Ordering::Equal;
        }

        self.value.total_cmp(&other.value)
    }
}

impl Neg for Num {
    type Output = Self;

    #[inline]
    fn neg(self) -> Self::Output {
        Self::from(f64::neg(self.value))
    }
}

forward_ref_unop!(impl Neg::neg for Num);

#[cfg(test)]
mod tests {
    use core::cmp::Ordering;

    use super::Num;
    use crate::body::constant::Int;

    const POS_NAN: f64 = f64::from_bits(0x7FF8_0000_0000_0000);
    const NEG_NAN: f64 = f64::from_bits(0xFFF8_0000_0000_0000);

    #[test]
    fn num_total_order_special_values() {
        let neg_nan = Num::from(NEG_NAN);
        let pos_nan = Num::from(POS_NAN);
        let neg_inf = Num::from(f64::NEG_INFINITY);
        let pos_inf = Num::from(f64::INFINITY);
        let neg_zero = Num::from(-0.0);
        let pos_zero = Num::from(0.0);
        let minus_one = Num::from(-1.0);
        let plus_one = Num::from(1.0);

        // Negative NaN is smallest
        assert_eq!(neg_nan.cmp(&neg_inf), Ordering::Less);

        // Positive NaN is largest
        assert_eq!(pos_inf.cmp(&pos_nan), Ordering::Less);

        // Infinities around finite values
        assert_eq!(neg_inf.cmp(&minus_one), Ordering::Less);
        assert_eq!(plus_one.cmp(&pos_inf), Ordering::Less);

        // Negative zero vs positive zero
        assert_eq!(neg_zero.cmp(&pos_zero), Ordering::Equal);
        assert_eq!(neg_zero.cmp(&pos_zero), Ordering::Equal);

        // Sanity around zeros and ones
        assert_eq!(minus_one.cmp(&neg_zero), Ordering::Less);
        assert_eq!(pos_zero.cmp(&plus_one), Ordering::Less);
    }

    #[test]
    #[expect(clippy::cast_precision_loss)]
    fn cmp_int_matches_total_order_for_finite_values_small_range() {
        // For a modest range, f64 representation of ints is exact,
        // so we can compare directly against f64::total_cmp.
        for raw in -1000_i64..=1000 {
            let int = Int::from(raw);

            // Sample a few representative floats around each integer.
            let samples = [
                (raw as f64) - 1.5,
                (raw as f64) - 1.0,
                (raw as f64) - 0.5,
                (raw as f64),
                (raw as f64) + 0.5,
                (raw as f64) + 1.0,
                (raw as f64) + 1.5,
            ];

            for &sample in &samples {
                let num = Num::from(sample);

                let expected = sample.total_cmp(&(raw as f64));
                let actual = num.cmp_int(&int);

                assert_eq!(
                    actual, expected,
                    "mismatch for f = {sample}, i = {raw}: expected {expected:?}, got {actual:?}"
                );
            }
        }
    }

    #[test]
    fn cmp_int_nan_ordering() {
        let zero = Int::from(0_i32);

        let neg_nan = Num::from(NEG_NAN);
        let pos_nan = Num::from(POS_NAN);

        assert!(neg_nan.as_f64().is_nan() && neg_nan.as_f64().is_sign_negative());
        assert!(pos_nan.as_f64().is_nan() && !pos_nan.as_f64().is_sign_negative());

        // Negative NaN is smaller than any integer
        assert_eq!(neg_nan.cmp_int(&zero), Ordering::Less);

        // Positive NaN is greater than any integer
        assert_eq!(pos_nan.cmp_int(&zero), Ordering::Greater);
    }

    #[test]
    fn cmp_int_infinities() {
        let zero = Int::from(0_i32);
        let max = Int::from(i128::MAX);
        let min = Int::from(i128::MIN);

        let neg_inf = Num::from(f64::NEG_INFINITY);
        let pos_inf = Num::from(f64::INFINITY);

        // -∞ < any integer
        assert_eq!(neg_inf.cmp_int(&min), Ordering::Less);
        assert_eq!(neg_inf.cmp_int(&zero), Ordering::Less);
        assert_eq!(neg_inf.cmp_int(&max), Ordering::Less);

        // +∞ > any integer
        assert_eq!(pos_inf.cmp_int(&min), Ordering::Greater);
        assert_eq!(pos_inf.cmp_int(&zero), Ordering::Greater);
        assert_eq!(pos_inf.cmp_int(&max), Ordering::Greater);
    }

    #[expect(clippy::cast_precision_loss)]
    #[test]
    fn cmp_int_boundaries_and_out_of_range() {
        let min_int = Int::from(i128::MIN);
        let max_int = Int::from(i128::MAX);

        let min_f64 = i128::MIN as f64;
        let max_p1_f64 = i128::MAX as f64; // == 2^127

        // Exact boundary
        let num_min = Num::from(min_f64);
        assert_eq!(num_min.cmp_int(&min_int), Ordering::Equal);

        // Just below MIN (more negative)
        let just_below_min = Num::from(min_f64.next_down());
        assert_eq!(just_below_min.cmp_int(&min_int), Ordering::Less);

        // max_p1_f64 = i128::MAX + 1; should be > any Int
        let num_max_p1 = Num::from(max_p1_f64);
        assert_eq!(num_max_p1.cmp_int(&max_int), Ordering::Greater);

        // Just above max_p1
        let just_above_max_p1 = Num::from(max_p1_f64.next_up());
        assert_eq!(just_above_max_p1.cmp_int(&max_int), Ordering::Greater);
    }

    #[test]
    fn cmp_int_negative_zero_behavior() {
        let zero_int = Int::from(0_i32);

        let neg_zero = Num::from(-0.0);
        let pos_zero = Num::from(0.0);

        // Both zeros compare equal to integer zero in cmp_int
        assert_eq!(neg_zero.cmp_int(&zero_int), Ordering::Equal);
        assert_eq!(pos_zero.cmp_int(&zero_int), Ordering::Equal);

        // to keep being reflexive, `Num` also doesn't distinguish them
        assert_eq!(neg_zero.cmp(&pos_zero), Ordering::Equal);
    }

    #[test]
    fn cmp_int_fractional_sign_behavior() {
        // Positive fractional: should be > integer part
        let num = Num::from(3.5_f64);
        let int = Int::from(3_i32);
        assert_eq!(num.cmp_int(&int), Ordering::Greater);

        // Negative fractional: should be < integer part
        let num = Num::from(-3.5_f64);
        let int = Int::from(-3_i32);
        assert_eq!(num.cmp_int(&int), Ordering::Less);

        // Exact integers: equality
        let num = Num::from(42.0_f64);
        let int = Int::from(42_i32);
        assert_eq!(num.cmp_int(&int), Ordering::Equal);
    }
}
