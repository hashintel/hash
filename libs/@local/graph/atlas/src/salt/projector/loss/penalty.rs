//! The sanctioned penalty family over the contrast violation.
//!
//! Decision 4 selects the production penalty. This module carries the family as a closed set of
//! shapes, each computing its value and exact derivative in one implementation, so the slope a
//! gradient deposit consumes is the derivative of the value the estimand records. A caller-supplied
//! callback could pair any value with any claimed slope, and nothing downstream could tell the pair
//! from a derivative. A ruled shape outside the family arrives as a new variant rather than as a
//! callback.

use crate::math::{DFinite, DNonNegative};

/// The penalty `φ`, mapping a contrast violation to its value and exact derivative.
///
/// Both readings evaluate in double precision, and no variant divides. Every violation widened
/// from the working `f32` precision reads finite, because the widest such value squares inside
/// `f64`'s range.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Penalty {
    /// `φ(v) = v` with slope `1` everywhere.
    ///
    /// Every unit keeps corrective force, and a satisfied pair's negative violation subtracts
    /// value.
    Identity,
    /// `φ(v) = max(0, v)²` with slope `2·max(0, v)`: smooth at the hinge and dead below it.
    ///
    /// The slope vanishes at a zero violation, so this shape keeps corrective force at distance
    /// equality only through a positive margin. Admission enforces that pairing.
    QuadraticHinge,
}

impl Penalty {
    /// Evaluates `(φ(v), φ′(v))` at the violation.
    ///
    /// The violation arrives in double precision, and a caller holding a working-precision
    /// reading widens it visibly at the call. The value is signed - under
    /// [`Identity`](Self::Identity) a
    /// satisfied pair's negative violation subtracts value - and the slope is non-negative at
    /// every violation, because both declared shapes are nondecreasing.
    #[must_use]
    pub(crate) fn evaluate(self, violation: f64) -> (DFinite, DNonNegative) {
        match self {
            Self::Identity => (DFinite::new_unchecked(violation), DNonNegative::ONE),
            Self::QuadraticHinge if violation > 0.0 => (
                DFinite::new_unchecked(violation * violation),
                DNonNegative::new_unchecked(2.0 * violation),
            ),
            Self::QuadraticHinge => (DFinite::ZERO, DNonNegative::ZERO),
        }
    }

    /// Returns whether the derivative vanishes at a zero violation.
    ///
    /// The ruled shape rule pairs such a penalty with a positive margin, so distance equality still
    /// carries corrective force. Admission reads this to enforce the pairing, and the child module
    /// locks the answer to the evaluated slope.
    #[must_use]
    pub(crate) const fn dead_at_equality(self) -> bool {
        match self {
            Self::Identity => false,
            Self::QuadraticHinge => true,
        }
    }
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::float_cmp,
        reason = "exactness assertions on constructed dyadic values are bit-precise contracts"
    )]

    use super::Penalty;

    const FAMILY: [Penalty; 2] = [Penalty::Identity, Penalty::QuadraticHinge];

    /// Sheds the typed readings for comparison against raw reference pairs.
    fn raw(penalty: Penalty, violation: f64) -> (f64, f64) {
        let (value, slope) = penalty.evaluate(violation);
        (f64::from(value), slope.get())
    }

    #[test]
    fn the_family_reads_exact_values_and_slopes() {
        assert_eq!(raw(Penalty::Identity, -1.5), (-1.5, 1.0));
        assert_eq!(raw(Penalty::Identity, 0.0), (0.0, 1.0));
        assert_eq!(raw(Penalty::Identity, 2.0), (2.0, 1.0));

        assert_eq!(raw(Penalty::QuadraticHinge, 0.5), (0.25, 1.0));
        assert_eq!(raw(Penalty::QuadraticHinge, 0.0), (0.0, 0.0));
        assert_eq!(raw(Penalty::QuadraticHinge, -3.0), (0.0, 0.0));
    }

    #[test]
    fn every_slope_is_the_value_derivative_on_dyadic_points() {
        // The central difference is exact in dyadic f64 arithmetic: for the square,
        // (v+h)² − (v−h)² = 4vh, and the quotient by 2h recovers 2v with no rounding. Every
        // probe point keeps both sides of the difference on one branch of the hinge.
        let step = 1.0_f64 / 1024.0;
        for penalty in FAMILY {
            for violation in [-2.0_f64, -0.5, 0.25, 1.0, 3.5] {
                let (_, slope) = raw(penalty, violation);
                let (above, _) = raw(penalty, violation + step);
                let (below, _) = raw(penalty, violation - step);
                let difference = (above - below) / (2.0 * step);
                assert_eq!(difference, slope, "{penalty:?} at {violation}");
            }
        }
    }

    #[test]
    fn dead_at_equality_agrees_with_the_evaluated_slope() {
        for penalty in FAMILY {
            assert_eq!(penalty.dead_at_equality(), penalty.evaluate(0.0).1 == 0.0);
        }
    }

    #[test]
    fn the_widest_violation_still_reads_finite() {
        for penalty in FAMILY {
            for violation in [f64::from(f32::MAX), f64::from(f32::MIN)] {
                let (value, slope) = raw(penalty, violation);
                assert!(value.is_finite(), "{penalty:?} value at {violation}");
                assert!(slope.is_finite(), "{penalty:?} slope at {violation}");
            }
        }
    }
}
