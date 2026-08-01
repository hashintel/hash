//! Closed soft targets with an exact unit-sum contract.
//!
//! A raw soft target is one non-negative weight per geometry class. Those weights sum to one up to
//! rounding from upstream arithmetic. [`ClosedTarget`] canonicalizes the tuple once. The raw sum
//! `s` accumulates in class order. A sum outside a configured ulp tolerance of one fails
//! canonicalization. [`ClosedTarget`] keeps the leading components as `u_c = t_c/s` and always
//! derives the reference component as `u_ref = 1 − Σ_c u_c` over the leading components in class
//! order. Keeping only the leading components makes the unit sum hold by construction rather than
//! by approximation. A common shift of the class logits provably moves no loss.
//!
//! Construction reports the raw sum and the largest normalization adjustment `max_c |u_c − t_c/s|`
//! alongside the target, so preparation can aggregate the raw sum range and `maximum_adjustment` as
//! evidence of how much canonicalization actually moved the data.

use core::num::NonZeroU32;

use super::LEADING_CLASSES;
use crate::salt::policy::GeometryClass;

/// A closed target rejected the raw triple.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum ClosedTargetError {
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
/// Stores the leading normalized components and derives the reference component `u_ref = 1 − Σ_c
/// u_c` on demand, so it can never disagree with the stored components.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ClosedTarget {
    /// The stored leading components, one per class ahead of the reference.
    components: [f64; LEADING_CLASSES],
}

impl ClosedTarget {
    /// Closes a raw target triple under the given unit-sum tolerance.
    ///
    /// The raw sum `s` accumulates in class order and must satisfy `|s − 1| ≤
    /// target_sum_tolerance_ulps · ulp(1)` where `ulp(1)` is [`f64::EPSILON`]. A NaN sum fails that
    /// comparison and this method rejects it.
    ///
    /// # Errors
    ///
    /// Returns [`ClosedTargetError::SumOutOfTolerance`] when the raw sum misses the tolerance, and
    /// [`ClosedTargetError::InvalidComponent`] when a normalized or derived component is non-finite
    /// or negative.
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

        let normalized: [f64; LEADING_CLASSES] = core::array::from_fn(|class| target[class] / sum);
        let closed = Self {
            components: normalized,
        };

        for (class, value) in GeometryClass::VARIANTS.into_iter().zip(closed.components()) {
            if !value.is_finite() || value.is_sign_negative() {
                return Err(ClosedTargetError::InvalidComponent { class, value });
            }
        }

        let mut adjustment = 0.0_f64;
        for (stored, raw) in closed.components().into_iter().zip(target) {
            adjustment = adjustment.max((stored - raw / sum).abs());
        }

        Ok((closed, Canonicalization { sum, adjustment }))
    }

    /// Returns every component, with the reference derived from the stored leading components.
    #[inline]
    pub(super) fn components(self) -> [f64; GeometryClass::COUNT] {
        // The leading components sum in class order, matching the derivation the storage pins.
        let mut leading_sum = 0.0_f64;
        for component in self.components {
            leading_sum += component;
        }

        core::array::from_fn(|class| {
            if class < LEADING_CLASSES {
                self.components[class]
            } else {
                1.0 - leading_sum
            }
        })
    }

    /// Returns the stored leading components ahead of the derived reference.
    #[inline]
    pub(super) const fn leading(self) -> [f64; LEADING_CLASSES] {
        self.components
    }
}
