#![expect(
    clippy::little_endian_bytes,
    reason = "projector configuration identities use canonical little-endian scalar encodings"
)]

use core::num::NonZeroUsize;

use super::{
    super::{GradientBudget, RelationEnergy, SemanticAffinity},
    ProjectorTrainingError,
};
use crate::salt::hash::{ContentHash, ContentHasher};

const MAX_OPTIMIZER_STEPS: usize = 100_000;

/// Scalar coefficients multiplying active projector loss families.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LossWeights {
    pub semantic_positive: f64,
    pub ordinary_negative: f64,
    pub hard_negative: f64,
    pub relation: f64,
    pub anchor: f64,
    pub landmark: f64,
}

impl LossWeights {
    /// Validates non-negative finite objective coefficients.
    ///
    /// # Errors
    ///
    /// This returns an error when a coefficient is negative or non-finite, or
    /// all semantic coefficients are zero.
    pub(crate) fn validate(self) -> Result<Self, ProjectorTrainingError> {
        for (name, value) in [
            ("semantic-positive", self.semantic_positive),
            ("ordinary-negative", self.ordinary_negative),
            ("hard-negative", self.hard_negative),
            ("relation", self.relation),
            ("anchor", self.anchor),
            ("landmark", self.landmark),
        ] {
            if !value.is_finite() || value.is_sign_negative() {
                return Err(ProjectorTrainingError::InvalidLossWeight { name, value });
            }
        }
        if self.semantic_positive == 0.0
            && self.ordinary_negative == 0.0
            && self.hard_negative == 0.0
        {
            return Err(ProjectorTrainingError::NoSemanticLoss);
        }
        Ok(self)
    }
}

/// Robust normalized coordinate support shared by anchors and landmarks.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SupportEnergy {
    pub huber_delta: f64,
    pub epsilon: f64,
}

impl SupportEnergy {
    /// Validates positive finite support-energy constants.
    ///
    /// # Errors
    ///
    /// This returns an error when delta or epsilon is not finite and positive.
    pub(crate) fn validate(self) -> Result<Self, ProjectorTrainingError> {
        for (name, value) in [
            ("support-huber-delta", self.huber_delta),
            ("support-epsilon", self.epsilon),
        ] {
            if !value.is_finite() || value <= 0.0 {
                return Err(ProjectorTrainingError::InvalidPositiveCoefficient { name, value });
            }
        }
        Ok(self)
    }
}

/// Fully pinned numerical contract for one projector optimization run.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProjectorLossConfig {
    pub semantic: SemanticAffinity,
    pub relation: RelationEnergy,
    pub budget: GradientBudget,
    pub support: SupportEnergy,
    pub weights: LossWeights,
}

/// Pinned Adam and cosine-decay schedule.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProjectorOptimizerConfig {
    pub initial_learning_rate: f64,
    pub minimum_learning_rate: f64,
    pub steps: NonZeroUsize,
    pub seed: u64,
}

impl ProjectorOptimizerConfig {
    /// Validates the optimizer schedule accepted by Burn.
    ///
    /// # Errors
    ///
    /// This returns an error unless `0 <= minimum <= initial <= 1` and the
    /// schedule fits the bounded M0 work envelope.
    pub(crate) fn validate(self) -> Result<Self, ProjectorTrainingError> {
        if self.steps.get() > MAX_OPTIMIZER_STEPS {
            return Err(ProjectorTrainingError::OptimizerSteps {
                steps: self.steps.get(),
                maximum: MAX_OPTIMIZER_STEPS,
            });
        }
        if !self.initial_learning_rate.is_finite()
            || self.initial_learning_rate <= 0.0
            || self.initial_learning_rate > 1.0
        {
            return Err(ProjectorTrainingError::InvalidOptimizerConfig {
                field: "initial-learning-rate",
                value: self.initial_learning_rate,
            });
        }
        if !self.minimum_learning_rate.is_finite()
            || self.minimum_learning_rate.is_sign_negative()
            || self.minimum_learning_rate > self.initial_learning_rate
        {
            return Err(ProjectorTrainingError::InvalidOptimizerConfig {
                field: "minimum-learning-rate",
                value: self.minimum_learning_rate,
            });
        }
        tensor_scalar("initial-learning-rate", self.initial_learning_rate)?;
        tensor_scalar("minimum-learning-rate", self.minimum_learning_rate)?;
        Ok(self)
    }

    /// Returns the stable identity of the schedule and seed.
    #[must_use]
    pub(crate) fn content_hash(self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.projector-optimizer.v1");
        hasher.update(&self.initial_learning_rate.to_bits().to_le_bytes());
        hasher.update(&self.minimum_learning_rate.to_bits().to_le_bytes());
        hasher.update(
            &u64::try_from(self.steps.get())
                .expect("optimizer step count should fit u64")
                .to_le_bytes(),
        );
        hasher.update(&self.seed.to_le_bytes());
        hasher.finish()
    }
}

impl ProjectorLossConfig {
    /// Validates and binds objective coefficients as one content identity.
    ///
    /// # Errors
    ///
    /// This returns an error when loss weights or support constants violate
    /// their numerical contracts. Semantic, relation, and budget parameters
    /// have already been validated by their constructors.
    pub(crate) fn new(
        semantic: SemanticAffinity,
        relation: RelationEnergy,
        budget: GradientBudget,
        support: SupportEnergy,
        weights: LossWeights,
    ) -> Result<Self, ProjectorTrainingError> {
        let config = Self {
            semantic,
            relation,
            budget,
            support: support.validate()?,
            weights: weights.validate()?,
        };
        config.validate_tensor_scalars()?;
        Ok(config)
    }

    /// Returns the stable identity of every active numerical coefficient.
    #[must_use]
    pub(crate) fn content_hash(self) -> ContentHash {
        let semantic = self.semantic.parameters();
        let relation = self.relation.parameters();
        let budget = self.budget.parameters();
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.projector-loss.v1");
        for value in [
            semantic.a,
            semantic.b,
            semantic.epsilon,
            semantic.maximum_positive_weight,
            semantic.maximum_negative_weight,
            relation.coincident_radius,
            relation.proximal_radius,
            relation.coincident_huber_delta,
            relation.proximal_temperature,
            relation.epsilon,
            budget.positive,
            budget.total,
            budget.semantic_floor,
            budget.epsilon,
            self.support.huber_delta,
            self.support.epsilon,
            self.weights.semantic_positive,
            self.weights.ordinary_negative,
            self.weights.hard_negative,
            self.weights.relation,
            self.weights.anchor,
            self.weights.landmark,
        ] {
            hasher.update(&value.to_bits().to_le_bytes());
        }
        hasher.finish()
    }

    fn validate_tensor_scalars(self) -> Result<(), ProjectorTrainingError> {
        let semantic = self.semantic.parameters();
        let relation = self.relation.parameters();
        let budget = self.budget.parameters();
        for (name, value) in [
            ("semantic-a", semantic.a),
            ("semantic-b", semantic.b),
            ("semantic-epsilon", semantic.epsilon),
            (
                "semantic-maximum-positive-weight",
                semantic.maximum_positive_weight,
            ),
            (
                "semantic-maximum-negative-weight",
                semantic.maximum_negative_weight,
            ),
            ("relation-coincident-radius", relation.coincident_radius),
            ("relation-proximal-radius", relation.proximal_radius),
            (
                "relation-coincident-huber-delta",
                relation.coincident_huber_delta,
            ),
            (
                "relation-proximal-temperature",
                relation.proximal_temperature,
            ),
            ("relation-epsilon", relation.epsilon),
            ("budget-positive", budget.positive),
            ("budget-total", budget.total),
            ("budget-semantic-floor", budget.semantic_floor),
            ("budget-epsilon", budget.epsilon),
            ("support-huber-delta", self.support.huber_delta),
            ("support-epsilon", self.support.epsilon),
            ("weight-semantic-positive", self.weights.semantic_positive),
            ("weight-ordinary-negative", self.weights.ordinary_negative),
            ("weight-hard-negative", self.weights.hard_negative),
            ("weight-relation", self.weights.relation),
            ("weight-anchor", self.weights.anchor),
            ("weight-landmark", self.weights.landmark),
        ] {
            tensor_scalar(name, value)?;
        }
        for (name, epsilon) in [
            ("semantic-epsilon-squared", semantic.epsilon),
            ("relation-epsilon-squared", relation.epsilon),
            ("support-epsilon-squared", self.support.epsilon),
        ] {
            tensor_scalar(name, epsilon * epsilon)?;
        }
        Ok(())
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "the tensor scalar is checked immediately after conversion"
)]
fn tensor_scalar(name: &'static str, value: f64) -> Result<(), ProjectorTrainingError> {
    let narrowed = value as f32;
    if narrowed.is_finite() && (value == 0.0 || narrowed.is_normal()) {
        Ok(())
    } else {
        Err(ProjectorTrainingError::UnrepresentableCoefficient { name, value })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_coefficients_that_underflow_the_tensor_backend() {
        let result = ProjectorLossConfig::new(
            SemanticAffinity::new(1.0, 1.0, 1.0e-8, 2.0, 2.0)
                .expect("semantic affinity should validate"),
            RelationEnergy::new(0.5, 1.0, 0.5, 0.25, 1.0e-8)
                .expect("relation energy should validate"),
            GradientBudget::new(0.1, 0.1, 1.0e-6, 1.0e-12)
                .expect("gradient budget should validate"),
            SupportEnergy {
                huber_delta: 1.0,
                epsilon: f64::MIN_POSITIVE,
            },
            LossWeights {
                semantic_positive: 1.0,
                ordinary_negative: 1.0,
                hard_negative: 1.0,
                relation: 1.0,
                anchor: 1.0,
                landmark: 1.0,
            },
        );

        assert!(matches!(
            result,
            Err(ProjectorTrainingError::UnrepresentableCoefficient {
                name: "support-epsilon",
                ..
            })
        ));
    }

    #[test]
    fn optimizer_rejects_effectively_unbounded_work() {
        let config = ProjectorOptimizerConfig {
            initial_learning_rate: 1.0e-3,
            minimum_learning_rate: 1.0e-4,
            steps: NonZeroUsize::new(MAX_OPTIMIZER_STEPS + 1)
                .expect("limit plus one should be non-zero"),
            seed: 17,
        };

        assert!(matches!(
            config.validate(),
            Err(ProjectorTrainingError::OptimizerSteps {
                steps,
                maximum: MAX_OPTIMIZER_STEPS,
            }) if steps == MAX_OPTIMIZER_STEPS + 1
        ));
    }
}
