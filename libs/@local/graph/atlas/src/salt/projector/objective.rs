use super::error::ObjectiveError;
use crate::salt::relation::AttractionEdge;

/// Bounded semantic affinity and sampled-negative coefficients.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SemanticAffinity {
    a: f64,
    b: f64,
    epsilon: f64,
    maximum_positive_weight: f64,
    maximum_negative_weight: f64,
}

impl SemanticAffinity {
    /// Validates the low-dimensional affinity `q(d) = 1 / (1 + a d^(2b))`.
    ///
    /// # Errors
    ///
    /// This returns an error unless all coefficients and weight caps are
    /// finite and strictly positive.
    pub(crate) fn new(
        a: f64,
        b: f64,
        epsilon: f64,
        maximum_positive_weight: f64,
        maximum_negative_weight: f64,
    ) -> Result<Self, ObjectiveError> {
        if [
            a,
            b,
            epsilon,
            maximum_positive_weight,
            maximum_negative_weight,
        ]
        .into_iter()
        .any(|value| !value.is_finite() || value <= 0.0)
        {
            return Err(ObjectiveError::InvalidAffinity {
                a,
                b,
                epsilon,
                maximum_positive_weight,
                maximum_negative_weight,
            });
        }
        Ok(Self {
            a,
            b,
            epsilon,
            maximum_positive_weight,
            maximum_negative_weight,
        })
    }

    /// Computes capped positive semantic cross-entropy.
    ///
    /// # Errors
    ///
    /// This returns an error when distance or weight is negative or non-finite.
    pub(crate) fn positive_loss(self, distance: f64, weight: f64) -> Result<f64, ObjectiveError> {
        let affinity = self.affinity(distance)?;
        Ok(-validate_weight(weight)?.min(self.maximum_positive_weight)
            * (affinity + self.epsilon).ln())
    }

    /// Computes capped sampled-negative cross-entropy.
    ///
    /// # Errors
    ///
    /// This returns an error when distance or weight is negative or non-finite.
    pub(crate) fn negative_loss(self, distance: f64, weight: f64) -> Result<f64, ObjectiveError> {
        let affinity = self.affinity(distance)?;
        Ok(-validate_weight(weight)?.min(self.maximum_negative_weight)
            * ((1.0 - affinity) + self.epsilon).ln())
    }

    fn affinity(self, distance: f64) -> Result<f64, ObjectiveError> {
        let distance = validate_distance(distance)?;
        Ok(1.0 / self.a.mul_add(distance.powf(2.0 * self.b), 1.0))
    }
}

/// Shared Coincident and Proximal normalized-distance energies.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationEnergy {
    coincident_radius: f64,
    proximal_radius: f64,
    coincident_huber_delta: f64,
    proximal_temperature: f64,
    epsilon: f64,
}

impl RelationEnergy {
    /// Validates normalized-distance energy parameters.
    ///
    /// # Errors
    ///
    /// This returns an error unless radii are finite with
    /// `0 <= coincident < proximal`, and delta, temperature, and epsilon are
    /// finite and positive.
    pub(crate) fn new(
        coincident_radius: f64,
        proximal_radius: f64,
        coincident_huber_delta: f64,
        proximal_temperature: f64,
        epsilon: f64,
    ) -> Result<Self, ObjectiveError> {
        if !coincident_radius.is_finite()
            || !proximal_radius.is_finite()
            || coincident_radius < 0.0
            || coincident_radius >= proximal_radius
            || !coincident_huber_delta.is_finite()
            || coincident_huber_delta <= 0.0
            || !proximal_temperature.is_finite()
            || proximal_temperature <= 0.0
            || !epsilon.is_finite()
            || epsilon <= 0.0
        {
            return Err(ObjectiveError::InvalidRelationEnergy {
                coincident_radius,
                proximal_radius,
                coincident_huber_delta,
                proximal_temperature,
                epsilon,
            });
        }
        Ok(Self {
            coincident_radius,
            proximal_radius,
            coincident_huber_delta,
            proximal_temperature,
            epsilon,
        })
    }

    /// Computes normalized endpoint distance from detached local scales.
    ///
    /// # Errors
    ///
    /// This returns an error when distance or either local scale is negative
    /// or non-finite.
    pub(crate) fn normalized_distance(
        self,
        distance: f64,
        left_scale: f64,
        right_scale: f64,
    ) -> Result<f64, ObjectiveError> {
        let distance = validate_distance(distance)?;
        for value in [left_scale, right_scale] {
            if !value.is_finite() || value < 0.0 {
                return Err(ObjectiveError::InvalidLocalScale { value });
            }
        }
        Ok(distance / ((left_scale + self.epsilon) * (right_scale + self.epsilon)).sqrt())
    }

    /// Computes one factorized attraction-edge contribution.
    ///
    /// The edge already carries shared class coefficients multiplied by the
    /// effective class probabilities. Confidence, degree normalization, and
    /// frozen strength are each applied once here.
    ///
    /// # Errors
    ///
    /// This returns an error when normalized distance is negative or
    /// non-finite.
    pub(crate) fn attraction_loss(
        self,
        normalized_distance: f64,
        edge: AttractionEdge,
    ) -> Result<f64, ObjectiveError> {
        let distance = validate_distance(normalized_distance)?;
        let coincident_excess = (distance - self.coincident_radius).max(0.0);
        let coincident = huber(coincident_excess, self.coincident_huber_delta);
        let proximal_argument = (distance - self.proximal_radius) / self.proximal_temperature;
        let proximal = self.proximal_temperature * softplus(proximal_argument);
        let mixture = edge
            .coincident
            .mul_add(coincident, edge.proximal * proximal);
        Ok(edge.confidence.value() * edge.degree_normalization * edge.strength.get() * mixture)
    }
}

/// Per-node positive and total relation-gradient budgets.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct GradientBudget {
    positive: f64,
    total: f64,
    semantic_floor: f64,
    epsilon: f64,
}

impl GradientBudget {
    /// Validates coordinate-space clipping coefficients.
    ///
    /// # Errors
    ///
    /// This returns an error unless `0 <= positive <= total` and the semantic
    /// floor and epsilon are finite and positive.
    pub(crate) fn new(
        positive: f64,
        total: f64,
        semantic_floor: f64,
        epsilon: f64,
    ) -> Result<Self, ObjectiveError> {
        if !positive.is_finite()
            || !total.is_finite()
            || positive < 0.0
            || positive > total
            || !semantic_floor.is_finite()
            || semantic_floor <= 0.0
            || !epsilon.is_finite()
            || epsilon <= 0.0
        {
            return Err(ObjectiveError::InvalidGradientBudget {
                positive,
                total,
                semantic_floor,
                epsilon,
            });
        }
        Ok(Self {
            positive,
            total,
            semantic_floor,
            epsilon,
        })
    }

    /// Clips one attractive relation gradient against semantic gradient scale.
    ///
    /// # Errors
    ///
    /// This returns an error when either input gradient is non-finite.
    pub(crate) fn clip(
        self,
        semantic: [f64; 2],
        relation: [f64; 2],
    ) -> Result<ClippedGradient, ObjectiveError> {
        if !semantic.into_iter().chain(relation).all(f64::is_finite) {
            return Err(ObjectiveError::NonFiniteGradient);
        }
        let semantic_norm = norm(semantic);
        let relation_norm = norm(relation);
        let scale = semantic_norm.max(self.semantic_floor);
        let positive_factor = (self.positive * scale / (relation_norm + self.epsilon)).min(1.0);
        let positive = [relation[0] * positive_factor, relation[1] * positive_factor];
        let positive_norm = norm(positive);
        let total_factor = (self.total * scale / (positive_norm + self.epsilon)).min(1.0);
        Ok(ClippedGradient {
            value: [positive[0] * total_factor, positive[1] * total_factor],
            positive_clipped: positive_factor < 1.0,
            total_clipped: total_factor < 1.0,
        })
    }
}

/// A budgeted relation gradient and clipping diagnostics.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ClippedGradient {
    pub value: [f64; 2],
    pub positive_clipped: bool,
    pub total_clipped: bool,
}

#[inline]
fn validate_distance(value: f64) -> Result<f64, ObjectiveError> {
    if !value.is_finite() || value < 0.0 {
        Err(ObjectiveError::InvalidDistance { value })
    } else {
        Ok(value)
    }
}

#[inline]
fn validate_weight(value: f64) -> Result<f64, ObjectiveError> {
    if !value.is_finite() || value < 0.0 {
        Err(ObjectiveError::InvalidWeight { value })
    } else {
        Ok(value)
    }
}

#[inline]
fn huber(value: f64, delta: f64) -> f64 {
    if value <= delta {
        0.5 * value * value
    } else {
        delta * (value - 0.5 * delta)
    }
}

#[inline]
fn softplus(value: f64) -> f64 {
    if value > 0.0 {
        value + (-value).exp().ln_1p()
    } else {
        value.exp().ln_1p()
    }
}

#[inline]
fn norm([x, y]: [f64; 2]) -> f64 {
    x.hypot(y)
}
