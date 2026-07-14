use burn::{
    module::{Initializer, Module},
    nn::{Embedding, EmbeddingConfig, LayerNorm, LayerNormConfig, Linear, LinearConfig},
    tensor::{Int, Tensor, activation::silu, backend::Backend},
};

use super::error::ProjectorError;
use crate::salt::representation::PROJECTOR_DIMENSIONS;

/// Version of the residual FiLM architecture and feature order.
pub(crate) const PROJECTOR_ARCHITECTURE_VERSION: u32 = 1;

/// Entity-role vocabulary consumed by the learned role embedding.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u32)]
pub(crate) enum EntityRole {
    KnowledgeEntity = 0,
    OntologyType = 1,
    Other = 2,
}

impl EntityRole {
    /// Returns the role embedding index.
    #[must_use]
    #[inline]
    pub(crate) const fn index(self) -> u32 {
        self as u32
    }
}

/// Pinned architecture dimensions for a conditioned projector.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ProjectorConfig {
    pub width: usize,
    pub residual_blocks: usize,
    pub type_context_dimensions: usize,
    pub role_count: usize,
    pub role_dimensions: usize,
}

impl Default for ProjectorConfig {
    fn default() -> Self {
        Self {
            width: 512,
            residual_blocks: 4,
            type_context_dimensions: 0,
            role_count: 3,
            role_dimensions: 16,
        }
    }
}

impl ProjectorConfig {
    fn validate(self) -> Result<Self, ProjectorError> {
        if self.width == 0 {
            return Err(ProjectorError::ZeroWidth);
        }
        self.width
            .checked_mul(2)
            .ok_or(ProjectorError::DimensionOverflow)?;
        if self.residual_blocks == 0 {
            return Err(ProjectorError::ZeroResidualBlocks);
        }
        if self.role_count < 3 {
            return Err(ProjectorError::TooFewRoles {
                count: self.role_count,
            });
        }
        if self.role_dimensions == 0 {
            return Err(ProjectorError::ZeroRoleDimensions);
        }
        self.input_dimensions()?;
        self.condition_dimensions()?;
        Ok(self)
    }

    #[inline]
    fn input_dimensions(self) -> Result<usize, ProjectorError> {
        PROJECTOR_DIMENSIONS
            .checked_add(self.type_context_dimensions)
            .and_then(|dimensions| dimensions.checked_add(self.role_dimensions))
            .ok_or(ProjectorError::DimensionOverflow)
    }

    #[inline]
    fn condition_dimensions(self) -> Result<usize, ProjectorError> {
        self.type_context_dimensions
            .checked_add(1)
            .ok_or(ProjectorError::DimensionOverflow)
    }
}

/// One batched projector forward input.
pub(crate) struct ProjectorInput<B: Backend> {
    /// Normalized 512-component projector representations.
    pub representation: Tensor<B, 2>,
    /// Optional pooled closed-type context.
    pub type_context: Option<Tensor<B, 2>>,
    /// Role indices with shape `[batch, 1]`.
    pub roles: Tensor<B, 2, Int>,
    /// Global relation condition repeated with shape `[batch, 1]`.
    pub condition: Tensor<B, 2>,
}

#[derive(Module, Debug)]
struct ResidualBlock<B: Backend> {
    input: Linear<B>,
    normalization: LayerNorm<B>,
    output: Linear<B>,
    film: Linear<B>,
    width: usize,
}

impl<B: Backend> ResidualBlock<B> {
    fn new(width: usize, condition_dimensions: usize, device: &B::Device) -> Self {
        Self {
            input: LinearConfig::new(width, width).init(device),
            normalization: LayerNormConfig::new(width).init(device),
            output: LinearConfig::new(width, width)
                .with_initializer(Initializer::Zeros)
                .init(device),
            film: LinearConfig::new(condition_dimensions, 2 * width)
                .with_initializer(Initializer::Zeros)
                .init(device),
            width,
        }
    }

    fn forward(&self, hidden: Tensor<B, 2>, condition: Tensor<B, 2>) -> Tensor<B, 2> {
        let rows = hidden.dims()[0];
        let modulation = self.film.forward(condition);
        let gamma = modulation.clone().slice([0..rows, 0..self.width]) + 1.0;
        let beta = modulation.slice([0..rows, self.width..2 * self.width]);
        let modulated = hidden.clone() * gamma + beta;
        let update = self.output.forward(silu(
            self.normalization.forward(self.input.forward(modulated)),
        ));
        hidden + update
    }
}

/// Residual LayerNorm/SiLU projector with global-condition FiLM.
///
/// The feature order is normalized 512-prefix representation, optional pooled
/// type context, then learned role embedding. Every residual block computes
///
/// ```text
/// h' = h + W2 SiLU(LN(W1 FiLM(h, type_context, condition) + b1)) + b2.
/// ```
///
/// FiLM predicts a delta from unit scale and a shift. Its linear map and each
/// residual output map initialize to zero, so all conditions share the same
/// function before training and residual blocks initially preserve their
/// input. The condition is global to a complete coordinate field; no
/// relation-type identity enters this model.
#[derive(Module, Debug)]
pub(crate) struct ConditionedProjector<B: Backend> {
    input: Linear<B>,
    input_normalization: LayerNorm<B>,
    role: Embedding<B>,
    blocks: Vec<ResidualBlock<B>>,
    output: Linear<B>,
    config: ProjectorConfig,
}

impl<B: Backend> ConditionedProjector<B> {
    /// Initializes the pinned conditioned architecture.
    ///
    /// # Errors
    ///
    /// This returns an error when an architecture dimension is zero, the role
    /// vocabulary has fewer than three entries, or dimensions overflow.
    pub(crate) fn new(config: ProjectorConfig, device: &B::Device) -> Result<Self, ProjectorError> {
        let config = config.validate()?;
        let input_dimensions = config.input_dimensions()?;
        let condition_dimensions = config.condition_dimensions()?;
        Ok(Self {
            input: LinearConfig::new(input_dimensions, config.width).init(device),
            input_normalization: LayerNormConfig::new(config.width).init(device),
            role: EmbeddingConfig::new(config.role_count, config.role_dimensions).init(device),
            blocks: (0..config.residual_blocks)
                .map(|_| ResidualBlock::new(config.width, condition_dimensions, device))
                .collect(),
            output: LinearConfig::new(config.width, 2).init(device),
            config,
        })
    }

    /// Projects one batch into two-dimensional coordinates.
    ///
    /// # Errors
    ///
    /// This returns an error when representation, type-context, role, or
    /// condition shapes disagree with the architecture or batch row count.
    pub(crate) fn forward(&self, input: ProjectorInput<B>) -> Result<Tensor<B, 2>, ProjectorError> {
        let [rows, representation_dimensions] = input.representation.dims();
        if representation_dimensions != PROJECTOR_DIMENSIONS {
            return Err(ProjectorError::RepresentationShape {
                rows,
                dimensions: representation_dimensions,
            });
        }
        let [role_rows, role_columns] = input.roles.dims();
        if role_rows != rows || role_columns != 1 {
            return Err(ProjectorError::RoleShape {
                rows: role_rows,
                columns: role_columns,
                expected_rows: rows,
            });
        }
        let [condition_rows, condition_dimensions] = input.condition.dims();
        if condition_rows != rows || condition_dimensions != 1 {
            return Err(ProjectorError::ConditionShape {
                rows: condition_rows,
                dimensions: condition_dimensions,
                expected_rows: rows,
            });
        }

        let role = self.role.forward(input.roles).squeeze_dim::<2>(1);
        let (features, film_condition) =
            match (self.config.type_context_dimensions, input.type_context) {
                (0, None) => (
                    Tensor::cat(vec![input.representation, role], 1),
                    input.condition,
                ),
                (0, Some(_)) => return Err(ProjectorError::UnexpectedTypeContext),
                (dimensions, None) => {
                    return Err(ProjectorError::MissingTypeContext { dimensions });
                }
                (dimensions, Some(type_context)) => {
                    let [context_rows, context_dimensions] = type_context.dims();
                    if context_rows != rows || context_dimensions != dimensions {
                        return Err(ProjectorError::TypeContextShape {
                            rows: context_rows,
                            dimensions: context_dimensions,
                            expected_rows: rows,
                            expected_dimensions: dimensions,
                        });
                    }
                    (
                        Tensor::cat(vec![input.representation, type_context.clone(), role], 1),
                        Tensor::cat(vec![type_context, input.condition], 1),
                    )
                }
            };

        let mut hidden = silu(
            self.input_normalization
                .forward(self.input.forward(features)),
        );
        for block in &self.blocks {
            hidden = block.forward(hidden, film_condition.clone());
        }
        Ok(self.output.forward(hidden))
    }

    /// Returns the architecture configuration.
    #[must_use]
    #[inline]
    pub(crate) const fn config(&self) -> ProjectorConfig {
        self.config
    }
}
