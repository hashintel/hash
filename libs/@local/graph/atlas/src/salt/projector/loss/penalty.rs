//! The penalty family over the contrast violation.
//!
//! This module carries the family as a closed set of shapes, each computing its value and exact
//! derivative in one implementation. The slope a gradient deposit consumes is therefore the
//! derivative of the value the estimand records. A caller-supplied callback could pair any value
//! with any claimed slope, and nothing downstream could tell the pair from a derivative. A new
//! shape arrives as a new variant rather than as a callback.

/// The penalty `φ`, mapping a contrast violation to its value and exact derivative.
///
/// Both readings evaluate in double precision, and no variant divides. Every finite violation
/// widened from the working `f32` precision reads finite under both variants, because the widest
/// such value, `f32::MAX`, squares inside `f64`'s range. The guarantee is that narrow: a finite
/// `f64` violation above `√f64::MAX`, about `1.34·10¹⁵⁴`, overflows the quadratic hinge's square,
/// and an infinite or NaN violation follows the branches [`evaluate`](Self::evaluate) states.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Penalty {
    /// `φ(v) = v` with slope `1` everywhere.
    ///
    /// Every unit keeps corrective force, and a satisfied pair's negative violation subtracts
    /// value.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "no production path constructs this penalty, and the tests select it"
        )
    )]
    Identity,
    /// `φ(v) = max(0, v)²` with slope `2·max(0, v)`: smooth at the hinge and dead below it.
    ///
    /// The slope vanishes at a zero violation. This shape keeps corrective force at distance
    /// equality only through a positive margin, and admission enforces that pairing.
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "no production path constructs this penalty, and the tests select it"
        )
    )]
    QuadraticHinge,
}

impl Penalty {
    /// Evaluates `(φ(v), φ′(v))` at the violation.
    ///
    /// The violation arrives in double precision, and a caller holding a working-precision
    /// reading widens it visibly at the call. The pair is raw like its operand, and a non-finite
    /// violation takes the variant's own branch. [`Identity`](Self::Identity) returns the
    /// violation itself with slope one: `+∞`, `−∞` and NaN pass through as the value.
    /// [`QuadraticHinge`](Self::QuadraticHinge) squares only a violation that compares greater
    /// than zero: `+∞` returns `(+∞, +∞)`, while `−∞` and NaN take the zero branch and return
    /// `(0, 0)`, indistinguishable from a satisfied pair. The value is signed - under
    /// [`Identity`](Self::Identity) a satisfied pair's negative violation subtracts value - and
    /// the slope is non-negative at every violation, because both declared shapes are
    /// nondecreasing.
    #[must_use]
    pub(crate) fn evaluate(self, violation: f64) -> (f64, f64) {
        match self {
            Self::Identity => (violation, 1.0),
            Self::QuadraticHinge if violation > 0.0 => (violation * violation, 2.0 * violation),
            Self::QuadraticHinge => (0.0, 0.0),
        }
    }

    /// Returns whether the derivative vanishes at a zero violation.
    ///
    /// A penalty that is dead at equality pairs with a positive margin, which keeps corrective
    /// force at distance equality. Admission reads this to enforce the pairing.
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
    use super::Penalty;

    /// Both penalty variants, for tests that must apply to every variant in the family.
    const FAMILY: [Penalty; 2] = [Penalty::Identity, Penalty::QuadraticHinge];

    /// Reads the raw pair for comparison against reference pairs.
    fn raw(penalty: Penalty, violation: f64) -> (f64, f64) {
        penalty.evaluate(violation)
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

    /// `dead_at_equality` is true exactly when the slope at zero violation is zero.
    #[test]
    fn dead_at_equality_agrees_with_the_evaluated_slope() {
        for penalty in FAMILY {
            assert_eq!(penalty.dead_at_equality(), penalty.evaluate(0.0).1 == 0.0);
        }
    }

    /// Both penalties return finite values and slopes at `±f32::MAX`.
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
