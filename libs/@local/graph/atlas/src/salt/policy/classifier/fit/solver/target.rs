//! Closed soft targets with an exact unit-sum contract.
//!
//! A raw soft target is three non-negative class weights that should sum to one but may carry
//! rounding from upstream arithmetic. [`ClosedTarget`] canonicalizes the triple once: the raw sum
//! `s`, accumulated in class order, must lie within a configured ulp tolerance of one, the first
//! two components are stored as `u_0 = t_0/s` and `u_1 = t_1/s`, and the reference component is
//! always derived as `u_2 = 1 − (u_0 + u_1)`, in that order. Only two components are stored, so
//! the unit sum holds by construction rather than by approximation, and a common shift of the
//! class logits provably moves no loss.
//!
//! Construction reports the raw sum and the largest normalization adjustment
//! `max_c |u_c − t_c/s|` alongside the target, so preparation can aggregate the raw sum range
//! and `maximum_adjustment` as evidence of how much canonicalization actually moved the data.

use core::num::NonZeroU32;

use crate::salt::policy::GeometryClass;

/// A closed target rejected the raw triple.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) enum ClosedTargetError {
    /// The raw component sum lies outside the unit-sum ulp tolerance.
    SumOutOfTolerance { sum: f64 },
    /// A normalized or derived component is non-finite or negative.
    InvalidComponent { class: GeometryClass, value: f64 },
}

/// Canonicalization evidence of one closed target.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct Canonicalization {
    /// Raw component sum `s` before normalization.
    pub sum: f64,
    /// Largest normalization adjustment `max_c |u_c − t_c/s|`.
    pub adjustment: f64,
}

/// A soft target over the geometry classes with an exact unit sum.
///
/// Stores the two leading normalized components; the reference component is derived as
/// `u_2 = 1 − (u_0 + u_1)` on demand, so it can never disagree with the stored pair.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct ClosedTarget {
    /// The stored components `u_0` and `u_1`.
    components: [f64; 2],
}

impl ClosedTarget {
    /// Closes a raw target triple under the given unit-sum tolerance.
    ///
    /// The raw sum `s` accumulates in class order and must satisfy
    /// `|s − 1| ≤ target_sum_tolerance_ulps · ulp(1)`, where `ulp(1)` is [`f64::EPSILON`]; a NaN
    /// sum fails the comparison and is rejected with it.
    ///
    /// # Errors
    ///
    /// Returns [`ClosedTargetError::SumOutOfTolerance`] when the raw sum misses the tolerance,
    /// and [`ClosedTargetError::InvalidComponent`] when a normalized or derived component is
    /// non-finite or negative.
    pub(super) fn new(
        target: [f64; GeometryClass::COUNT],
        target_sum_tolerance_ulps: NonZeroU32,
    ) -> Result<(Self, Canonicalization), ClosedTargetError> {
        let mut sum = 0.0_f64;
        for component in target {
            sum += component;
        }

        // A NaN deviation rejects like any out-of-tolerance sum.
        let tolerance = f64::from(target_sum_tolerance_ulps.get()) * f64::EPSILON;
        let deviation = (sum - 1.0).abs();
        if deviation.is_nan() || deviation > tolerance {
            return Err(ClosedTargetError::SumOutOfTolerance { sum });
        }

        let normalized = [target[0] / sum, target[1] / sum];
        let derived = 1.0 - (normalized[0] + normalized[1]);
        for (class, value) in
            GeometryClass::VARIANTS
                .into_iter()
                .zip([normalized[0], normalized[1], derived])
        {
            if !value.is_finite() || value.is_sign_negative() {
                return Err(ClosedTargetError::InvalidComponent { class, value });
            }
        }

        let closed = Self {
            components: normalized,
        };

        let mut adjustment = 0.0_f64;
        for (stored, raw) in closed.components().into_iter().zip(target) {
            adjustment = adjustment.max((stored - raw / sum).abs());
        }

        Ok((closed, Canonicalization { sum, adjustment }))
    }

    /// Returns all three components, with the reference component derived from the stored pair.
    #[inline]
    pub(super) fn components(self) -> [f64; GeometryClass::COUNT] {
        let [first, second] = self.components;
        [first, second, 1.0 - (first + second)]
    }

    /// Returns the stored leading components `u_0` and `u_1`.
    #[inline]
    pub(super) const fn leading(self) -> [f64; 2] {
        self.components
    }
}
