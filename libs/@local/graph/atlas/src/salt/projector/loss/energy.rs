//! Scalar pair energies and their hand-derived first derivatives.
//!
//! Every energy exposes its value together with the derivative the batch terms fold into coordinate
//! gradients, so the pair loops in the parent module stay pure plumbing. The unit tests certify
//! each derivative against a finite-difference reference. The value and derivative always compute
//! in one fused evaluation.

use crate::math::{AffinityCurve, DNonNegative, Derivation, NonNegative, Positive, softplus};

/// The semantic edge energy over the low-dimensional affinity.
///
/// For squared pair distance `u` and affinity `q(u) = 1 / (1 + a u^b)`, attraction penalizes
/// improbable placement of a positive edge by `-ln(q + ε)` and repulsion penalizes probable
/// placement of a negative pair by `-ln(1 - q + ε)`. The offset keeps both logarithms finite over
/// the affinity's whole range, and bounds the repulsion derivative as the pair approaches
/// coincidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct AffinityEnergy {
    curve: AffinityCurve,
    epsilon: Positive,
}

impl AffinityEnergy {
    /// Binds an affinity curve to a logarithm offset.
    ///
    /// Returns [`None`] unless the curve's exponent satisfies `b ≥ 0.5`. The offset keeps the
    /// attraction value finite for far pairs and bounds the repulsion gradient for near pairs.
    /// The exponent bound keeps the coordinate gradient finite at coincidence, where its
    /// magnitude scales as `d^(2b - 1)`. Fitted curves lie well inside the bound. Rejecting the
    /// rest makes gradient boundedness a property of the type rather than of the corpus.
    #[must_use]
    pub(crate) fn new(curve: AffinityCurve, epsilon: Positive) -> Option<Self> {
        (curve.b() >= 0.5).then_some(Self { curve, epsilon })
    }

    /// Evaluates the attraction energy and its derivative in the squared distance.
    ///
    /// Returns `(-ln(q + ε), d/du of the same)`. The derivative is zero at `u = 0`: a coincident
    /// pair has no direction to pull along, and the value is already at its minimum there.
    #[must_use]
    pub(crate) fn attraction(self, distance_squared: NonNegative) -> (f32, f32) {
        let epsilon = self.epsilon.get();
        let affinity = self.curve.affinity(distance_squared);
        let value = -(affinity + epsilon).ln();
        if distance_squared.is_zero() {
            return (value, 0.0);
        }

        // d/du of -ln(q + ε) = a b u^(b - 1) q² / (q + ε).
        let derivative = self.mass(distance_squared, affinity) / (affinity + epsilon);
        (value, derivative)
    }

    /// Evaluates the repulsion energy and its derivative in the squared distance.
    ///
    /// Returns `(-ln(1 - q + ε), d/du of the same)`. The derivative is zero at `u = 0` for the same
    /// directional reason as [`attraction`](Self::attraction). Near coincidence the offset carries
    /// the boundedness: `1 - q` itself vanishes there, and without the offset the coordinate
    /// gradient would diverge for every exponent.
    #[must_use]
    pub(crate) fn repulsion(self, distance_squared: NonNegative) -> (f32, f32) {
        let epsilon = self.epsilon.get();
        let affinity = self.curve.affinity(distance_squared);
        let value = -(1.0 - affinity + epsilon).ln();
        if distance_squared.is_zero() {
            return (value, 0.0);
        }

        // d/du of -ln(1 - q + ε) = -a b u^(b - 1) q² / (1 - q + ε).
        let derivative = -self.mass(distance_squared, affinity) / (1.0 - affinity + epsilon);
        (value, derivative)
    }

    /// Computes the shared derivative mass `a b u^(b - 1) q²`.
    ///
    /// This is `-q'(u)` in both derivatives. The callers divide by their respective logarithm
    /// arguments and choose the sign.
    #[expect(
        clippy::min_ident_chars,
        reason = "a and b are the affinity curve's literature parameter names"
    )]
    fn mass(self, distance_squared: NonNegative, affinity: f32) -> f32 {
        let (a, b) = (self.curve.a(), self.curve.b());
        let power = distance_squared.powf(b - Positive::ONE);
        (a * b * power * affinity * affinity).into_raw()
    }
}

/// The Proximal class energy, a bounded pull that softens inside its radius.
///
/// `E(z) = temperature · softplus((z - radius) / temperature)` rises linearly once the normalized
/// distance exceeds the radius and decays exponentially toward zero below it. The temperature sets
/// the width of the soft transition.
///
/// The pull is `sigmoid((z - radius) / temperature)`. It reaches half strength exactly at the
/// radius and stays positive at every finite distance, asymptotically a factor of `e` per
/// temperature of depth inside, with residual `sigmoid(-radius / temperature)` at coincidence.
///
/// The energy is strictly increasing, and coincidence is its unique minimum. That residual and the
/// competing terms jointly set a pair's equilibrium distance.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProximalEnergy {
    pub radius: NonNegative,
    pub temperature: Positive,
}

impl ProximalEnergy {
    /// Creates a Proximal energy.
    ///
    /// The domains ride in the types, so there is nothing left to validate.
    #[must_use]
    pub(crate) const fn new(radius: NonNegative, temperature: Positive) -> Self {
        Self {
            radius,
            temperature,
        }
    }

    /// Returns the target radius.
    #[inline]
    #[must_use]
    pub(crate) const fn radius(self) -> NonNegative {
        self.radius
    }

    /// Evaluates the energy and its derivative at a normalized distance.
    ///
    /// The derivative is the logistic function of the scaled excess: it approaches one far outside
    /// the radius and zero far inside. A value that overflows the `f32` range saturates at
    /// [`f32::MAX`].
    #[must_use]
    pub(crate) fn evaluate(self, normalized: NonNegative) -> (NonNegative, NonNegative) {
        // the scaled excess can overflow. softplus preserves +∞, which saturates at the output's
        // maximum. sigmoid accepts either infinity.
        let argument = ((normalized - self.radius) / self.temperature).into_raw();

        (
            NonNegative::new_unchecked((self.temperature * softplus(argument)).min(f32::MAX)),
            NonNegative::sigmoid(argument),
        )
    }
}

/// The Coincident class energy, an outlier-resistant pull below a tight radius.
///
/// `E(z) = huber(max(z - radius, 0), threshold)` is zero inside the radius, quadratic immediately
/// outside it, and linear beyond the threshold, so one far-flung pair cannot dominate a batch. The
/// derivative is continuous everywhere.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct CoincidentEnergy {
    pub radius: NonNegative,
    pub threshold: Positive,
}

impl CoincidentEnergy {
    /// Creates a Coincident energy.
    ///
    /// Both settings carry their domain in the type, so construction validates nothing.
    #[must_use]
    pub(crate) const fn new(radius: NonNegative, threshold: Positive) -> Self {
        Self { radius, threshold }
    }

    /// Returns the target radius.
    #[inline]
    #[must_use]
    pub(crate) const fn radius(self) -> NonNegative {
        self.radius
    }

    /// Returns the Huber threshold.
    #[inline]
    #[must_use]
    pub(crate) const fn threshold(self) -> Positive {
        self.threshold
    }

    /// Evaluates the energy and its derivative at a normalized distance.
    ///
    /// The derivative is zero inside the radius, the excess itself in the quadratic regime, and the
    /// threshold in the linear regime.
    #[must_use]
    pub(crate) fn evaluate(self, normalized: NonNegative) -> (NonNegative, NonNegative) {
        let excess = normalized.saturating_sub(self.radius);

        (
            excess.huber(self.threshold),
            excess.min(self.threshold.into()),
        )
    }
}

/// The relation edge energy.
///
/// A weighted Coincident and Proximal mixture over locally normalized distance.
///
/// The radii satisfy `coincident < proximal`: the tight class must ask for a strictly closer
/// placement than the loose one. `epsilon` guards the local scales in the normalization `z = d /
/// √((scale_i + ε)(scale_j + ε))`, keeping `z` finite where a diverged neighbourhood measured a
/// zero radius.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationEnergy {
    coincident: CoincidentEnergy,
    proximal: ProximalEnergy,
    epsilon: Positive,
}

impl RelationEnergy {
    /// Validates a relation energy.
    ///
    /// Returns [`None`] unless the Coincident radius lies strictly below the Proximal one.
    #[must_use]
    pub(crate) fn new(
        coincident: CoincidentEnergy,
        proximal: ProximalEnergy,
        epsilon: Positive,
    ) -> Option<Self> {
        (coincident.radius() < proximal.radius()).then_some(Self {
            coincident,
            proximal,
            epsilon,
        })
    }

    /// Returns the scale guard.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> Positive {
        self.epsilon
    }

    /// Returns the Proximal component.
    #[inline]
    #[must_use]
    pub(crate) const fn proximal(self) -> ProximalEnergy {
        self.proximal
    }

    /// Evaluates the weighted class mixture and its derivative at a normalized distance.
    ///
    /// The mixture scales each class energy by its weight, and the derivative is the matching
    /// weighted sum of class derivatives. The fold widens the f32-born readings once and runs
    /// in double width, where a product of two in-domain `f32` operands lies far inside the
    /// `f64` range and cannot overflow. The types carry no such bound. The pair therefore
    /// returns as unclaimed [`Derivation`]s, and each consumer chooses its own exit: a checked
    /// finish or a raw fold.
    pub(crate) fn mixture(
        self,
        normalized: NonNegative,
        coincident_weight: NonNegative,
        proximal_weight: NonNegative,
    ) -> (Derivation<DNonNegative>, Derivation<DNonNegative>) {
        let (coincident_value, coincident_derivative) = self.coincident.evaluate(normalized);
        let (proximal_value, proximal_derivative) = self.proximal.evaluate(normalized);

        (
            Derivation::from(coincident_weight.widen()).mul_add(
                coincident_value.widen(),
                proximal_weight.widen() * proximal_value.widen(),
            ),
            Derivation::from(coincident_weight.widen()).mul_add(
                coincident_derivative.widen(),
                proximal_weight.widen() * proximal_derivative.widen(),
            ),
        )
    }
}
