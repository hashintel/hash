//! Scalar pair energies and their hand-derived first derivatives.
//!
//! Every energy exposes its value together with the derivative the batch terms fold into coordinate
//! gradients, so the pair loops in the parent module stay pure plumbing. Each derivative is
//! certified against a finite-difference reference in the unit tests; the value and derivative
//! always compute in one fused evaluation.

use crate::math::{AffinityCurve, huber, sigmoid, softplus};

/// The semantic edge energy over the low-dimensional affinity.
///
/// For squared pair distance `u` and affinity `q(u) = 1 / (1 + a u^b)`, attraction penalizes
/// improbable placement of a positive edge by `-ln(q + ε)` and repulsion penalizes probable
/// placement of a negative pair by `-ln(1 - q + ε)`. The offset keeps both logarithms finite
/// over the affinity's whole range, and bounds the repulsion derivative as the pair approaches
/// coincidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AffinityEnergy {
    curve: AffinityCurve,
    epsilon: f32,
}

impl AffinityEnergy {
    /// Binds an affinity curve to a logarithm offset.
    ///
    /// Returns [`None`] unless the offset is finite and strictly positive and the curve's exponent
    /// satisfies `b ≥ 0.5`. The offset keeps the attraction value finite for far pairs and bounds
    /// the repulsion gradient for near pairs; the exponent bound keeps the coordinate gradient
    /// finite at coincidence, where its magnitude scales as `d^(2b - 1)` (fitted curves land well
    /// inside the bound - rejecting the rest makes gradient boundedness a property of the type, not
    /// of the corpus).
    #[must_use]
    pub(crate) fn new(curve: AffinityCurve, epsilon: f32) -> Option<Self> {
        (epsilon.is_finite() && epsilon > 0.0 && curve.b() >= 0.5)
            .then_some(Self { curve, epsilon })
    }

    /// Returns the logarithm offset.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> f32 {
        self.epsilon
    }

    /// Evaluates the attraction energy and its derivative in the squared distance.
    ///
    /// Returns `(-ln(q + ε), d/du of the same)`. The derivative is zero at `u = 0`: a
    /// coincident pair has no direction to pull along, and the value is already at its minimum
    /// there.
    #[must_use]
    pub(crate) fn attraction(self, distance_squared: f32) -> (f32, f32) {
        let affinity = self.curve.affinity(distance_squared);
        let value = -(affinity + self.epsilon).ln();
        if distance_squared <= 0.0 {
            return (value, 0.0);
        }

        // d/du of -ln(q + ε) = a b u^(b - 1) q^2 / (q + ε).
        let derivative = self.mass(distance_squared, affinity) / (affinity + self.epsilon);
        (value, derivative)
    }

    /// Evaluates the repulsion energy and its derivative in the squared distance.
    ///
    /// Returns `(-ln(1 - q + ε), d/du of the same)`. The derivative is zero at `u = 0` for
    /// the same directional reason as [`attraction`](Self::attraction). Near coincidence the offset
    /// carries the boundedness: `1 - q` itself vanishes there, and without the offset the
    /// coordinate gradient would diverge for every exponent.
    #[must_use]
    pub(crate) fn repulsion(self, distance_squared: f32) -> (f32, f32) {
        let affinity = self.curve.affinity(distance_squared);
        let value = -(1.0 - affinity + self.epsilon).ln();
        if distance_squared <= 0.0 {
            return (value, 0.0);
        }

        // d/du of -ln(1 - q + ε) = -a b u^(b - 1) q^2 / (1 - q + ε).
        let derivative = -self.mass(distance_squared, affinity) / (1.0 - affinity + self.epsilon);
        (value, derivative)
    }

    /// Computes the shared derivative mass `a b u^(b - 1) q^2`.
    ///
    /// `-q'(u)` in both derivatives; the callers divide by their respective logarithm arguments and
    /// choose the sign.
    fn mass(self, distance_squared: f32, affinity: f32) -> f32 {
        #[expect(
            clippy::min_ident_chars,
            reason = "a and b are the affinity curve's literature parameter names"
        )]
        let (a, b) = (self.curve.a(), self.curve.b());
        a * b * distance_squared.powf(b - 1.0) * affinity * affinity
    }
}

/// The Proximal class energy: a smooth one-sided pull toward a radius.
///
/// `E(z) = temperature · softplus((z - radius) / temperature)` rises linearly once the normalized
/// distance exceeds the radius and decays to zero below it; the temperature sets the width of the
/// soft transition. The energy never pulls a pair tighter than its radius asks: the derivative
/// fades smoothly to zero inside.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProximalEnergy {
    radius: f32,
    temperature: f32,
}

impl ProximalEnergy {
    /// Validates a Proximal energy.
    ///
    /// Returns [`None`] unless the radius is finite and non-negative and the temperature is finite
    /// and strictly positive.
    #[must_use]
    pub(crate) fn new(radius: f32, temperature: f32) -> Option<Self> {
        let valid =
            radius.is_finite() && radius >= 0.0 && temperature.is_finite() && temperature > 0.0;
        valid.then_some(Self {
            radius,
            temperature,
        })
    }

    /// Returns the target radius.
    #[inline]
    #[must_use]
    pub(crate) const fn radius(self) -> f32 {
        self.radius
    }

    /// Evaluates the energy and its derivative at a normalized distance.
    ///
    /// The derivative is the logistic function of the scaled excess: it approaches one far outside
    /// the radius and zero far inside.
    #[must_use]
    pub(crate) fn evaluate(self, normalized: f32) -> (f32, f32) {
        let argument = (normalized - self.radius) / self.temperature;
        (self.temperature * softplus(argument), sigmoid(argument))
    }
}

/// The Coincident class energy: a robust pull below a tight radius.
///
/// `E(z) = huber(max(z - radius, 0), threshold)` is zero inside the radius, quadratic just outside
/// it, and linear beyond the threshold, so one far-flung pair cannot dominate a batch. The
/// derivative is continuous everywhere.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct CoincidentEnergy {
    radius: f32,
    threshold: f32,
}

impl CoincidentEnergy {
    /// Validates a Coincident energy.
    ///
    /// Returns [`None`] unless the radius is finite and non-negative and the Huber threshold is
    /// finite and strictly positive.
    #[must_use]
    pub(crate) const fn new(radius: f32, threshold: f32) -> Option<Self> {
        let valid = radius.is_finite() && radius >= 0.0 && threshold.is_finite() && threshold > 0.0;
        if !valid {
            return None;
        }
        Some(Self { radius, threshold })
    }

    /// Returns the target radius.
    #[inline]
    #[must_use]
    pub(crate) const fn radius(self) -> f32 {
        self.radius
    }

    /// Returns the Huber threshold.
    #[inline]
    #[must_use]
    pub(crate) const fn threshold(self) -> f32 {
        self.threshold
    }

    /// Evaluates the energy and its derivative at a normalized distance.
    ///
    /// The derivative is zero inside the radius, the excess itself in the quadratic regime, and the
    /// threshold in the linear regime.
    #[must_use]
    pub(crate) fn evaluate(self, normalized: f32) -> (f32, f32) {
        let excess = (normalized - self.radius).max(0.0);
        (huber(excess, self.threshold), excess.min(self.threshold))
    }
}

/// The relation edge energy.
///
/// A weighted Coincident and Proximal mixture over locally normalized distance.
///
/// The two radii satisfy `coincident < proximal`: the tight class must ask for a strictly closer
/// placement than the loose one. `epsilon` guards the local scales in the normalization `z = d /
/// √((scale_i + ε)(scale_j + ε))`, keeping `z` finite where a diverged
/// neighbourhood measured a zero radius.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationEnergy {
    coincident: CoincidentEnergy,
    proximal: ProximalEnergy,
    epsilon: f32,
}

impl RelationEnergy {
    /// Validates a relation energy.
    ///
    /// Returns [`None`] unless the scale guard is finite and strictly positive and the Coincident
    /// radius lies strictly below the Proximal one.
    #[must_use]
    pub(crate) fn new(
        coincident: CoincidentEnergy,
        proximal: ProximalEnergy,
        epsilon: f32,
    ) -> Option<Self> {
        let valid = epsilon.is_finite() && epsilon > 0.0 && coincident.radius() < proximal.radius();
        valid.then_some(Self {
            coincident,
            proximal,
            epsilon,
        })
    }

    /// Returns the scale guard.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> f32 {
        self.epsilon
    }

    /// Evaluates the weighted class mixture and its derivative at a normalized distance.
    ///
    /// Each class energy is scaled by its weight; the derivative is the matching weighted sum of
    /// class derivatives.
    #[must_use]
    pub(crate) fn mixture(
        self,
        normalized: f32,
        coincident_weight: f32,
        proximal_weight: f32,
    ) -> (f32, f32) {
        let (coincident_value, coincident_derivative) = self.coincident.evaluate(normalized);
        let (proximal_value, proximal_derivative) = self.proximal.evaluate(normalized);
        (
            coincident_weight.mul_add(coincident_value, proximal_weight * proximal_value),
            coincident_weight.mul_add(coincident_derivative, proximal_weight * proximal_derivative),
        )
    }
}
