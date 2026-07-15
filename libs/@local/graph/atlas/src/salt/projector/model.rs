use burn::{
    module::{Initializer, Module, Param, ParamId},
    nn::{Embedding, EmbeddingConfig, LayerNorm, LayerNormConfig, Linear, LinearConfig},
    tensor::{Int, Tensor, TensorData, activation::silu, backend::Backend},
};
use rand_xoshiro::{
    Xoshiro256PlusPlus,
    rand_core::{Rng as _, SeedableRng as _},
};

use super::error::ProjectorError;
use crate::salt::{
    hash::{ContentHash, ContentHasher},
    representation::PROJECTOR_DIMENSIONS,
};

/// Version of the residual `FiLM` architecture and feature order.
pub(crate) const PROJECTOR_ARCHITECTURE_VERSION: u32 = 2;
const MAXIMUM_PROJECTOR_WIDTH: usize = 1024;
const MAXIMUM_RESIDUAL_BLOCKS: usize = 6;
const MAXIMUM_TYPE_CONTEXT_DIMENSIONS: usize = 4096;
const MAXIMUM_ROLE_DIMENSIONS: usize = 256;
const MAXIMUM_PROJECTOR_PARAMETERS: usize = 64 * 1024 * 1024;

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
    pub(crate) fn validate(self) -> Result<Self, ProjectorError> {
        if self.width == 0 {
            return Err(ProjectorError::ZeroWidth);
        }
        bounded("hidden width", self.width, MAXIMUM_PROJECTOR_WIDTH)?;
        self.width
            .checked_mul(2)
            .ok_or(ProjectorError::DimensionOverflow)?;
        if self.residual_blocks == 0 {
            return Err(ProjectorError::ZeroResidualBlocks);
        }
        bounded(
            "residual block count",
            self.residual_blocks,
            MAXIMUM_RESIDUAL_BLOCKS,
        )?;
        if self.role_count != 3 {
            return Err(ProjectorError::RoleCount {
                count: self.role_count,
            });
        }
        if self.role_dimensions == 0 {
            return Err(ProjectorError::ZeroRoleDimensions);
        }
        bounded(
            "type-context dimensions",
            self.type_context_dimensions,
            MAXIMUM_TYPE_CONTEXT_DIMENSIONS,
        )?;
        bounded(
            "role dimensions",
            self.role_dimensions,
            MAXIMUM_ROLE_DIMENSIONS,
        )?;
        let input_dimensions = self.input_dimensions()?;
        let condition_dimensions = self.condition_dimensions()?;
        let doubled_width = self
            .width
            .checked_mul(2)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let matrix_parameters = self
            .width
            .checked_mul(self.width)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let matrix_parameters = matrix_parameters
            .checked_mul(2)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let film_parameters = condition_dimensions
            .checked_mul(doubled_width)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let block_parameters = matrix_parameters
            .checked_add(film_parameters)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let input_parameters = input_dimensions
            .checked_mul(self.width)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let residual_parameters = block_parameters
            .checked_mul(self.residual_blocks)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let role_parameters = self
            .role_count
            .checked_mul(self.role_dimensions)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let output_parameters = self
            .width
            .checked_mul(2)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let parameters = input_parameters
            .checked_add(residual_parameters)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let parameters = parameters
            .checked_add(role_parameters)
            .ok_or(ProjectorError::DimensionOverflow)?;
        let parameters = parameters
            .checked_add(output_parameters)
            .ok_or(ProjectorError::DimensionOverflow)?;
        bounded("parameter count", parameters, MAXIMUM_PROJECTOR_PARAMETERS)?;
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

    /// Returns the stable identity of the architecture and feature widths.
    #[must_use]
    #[expect(
        clippy::little_endian_bytes,
        reason = "persistent architecture identities require canonical little-endian integers"
    )]
    pub(crate) fn content_hash(self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.projector-architecture.v1");
        hasher.update(&PROJECTOR_ARCHITECTURE_VERSION.to_le_bytes());
        for value in [
            self.width,
            self.residual_blocks,
            self.type_context_dimensions,
            self.role_count,
            self.role_dimensions,
        ] {
            hasher.update(
                &u64::try_from(value)
                    .expect("projector architecture dimension should fit u64")
                    .to_le_bytes(),
            );
        }
        hasher.finish()
    }
}

#[inline]
const fn bounded(field: &'static str, value: usize, maximum: usize) -> Result<(), ProjectorError> {
    if value <= maximum {
        Ok(())
    } else {
        Err(ProjectorError::DimensionLimit {
            field,
            value,
            maximum,
        })
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
    fn new(
        width: usize,
        condition_dimensions: usize,
        initialization: &mut DeterministicInitialization,
        device: &B::Device,
    ) -> Self {
        Self {
            input: initialization.linear(width, width, false, device),
            normalization: initialization.layer_norm(width, device),
            output: initialization.linear(width, width, true, device),
            film: initialization.linear(condition_dimensions, 2 * width, true, device),
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

/// Residual LayerNorm/SiLU projector with global-condition `FiLM`.
///
/// The feature order is normalized 512-prefix representation, optional pooled
/// type context, then learned role embedding. Every residual block computes
///
/// ```text
/// h' = h + W2 SiLU(LN(W1 FiLM(h, type_context, condition) + b1)) + b2.
/// ```
///
/// `FiLM` predicts a delta from unit scale and a shift. Its linear map and each
/// residual output map initialize to zero, so all conditions share the same
/// function before training and residual blocks initially preserve their
/// input. The condition is global to a complete coordinate field; no
/// relation-type identity enters this model.
#[derive(Module, Debug)]
#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "Burn's Module derive emits scoped field visibility"
)]
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
    /// vocabulary differs from the three supported roles, or dimensions
    /// overflow.
    pub(crate) fn new(config: ProjectorConfig, device: &B::Device) -> Result<Self, ProjectorError> {
        Self::initialize(config, 0, device)
    }

    /// Initializes one model from a seed without using Burn's backend RNG.
    ///
    /// SALT materializes every initial parameter from its own Xoshiro stream.
    /// This makes concurrent generation identities independent of backend
    /// global or thread-local random state.
    ///
    /// # Errors
    ///
    /// This returns an error when the architecture is invalid.
    pub(crate) fn new_seeded(
        config: ProjectorConfig,
        seed: u64,
        device: &B::Device,
    ) -> Result<Self, ProjectorError> {
        Self::initialize(config, seed, device)
    }

    fn initialize(
        config: ProjectorConfig,
        seed: u64,
        device: &B::Device,
    ) -> Result<Self, ProjectorError> {
        let config = config.validate()?;
        let input_dimensions = config.input_dimensions()?;
        let condition_dimensions = config.condition_dimensions()?;
        let mut initialization = DeterministicInitialization::new(seed);
        Ok(Self {
            input: initialization.linear(input_dimensions, config.width, false, device),
            input_normalization: initialization.layer_norm(config.width, device),
            role: initialization.embedding(config.role_count, config.role_dimensions, device),
            blocks: core::iter::repeat_with(|| {
                ResidualBlock::new(
                    config.width,
                    condition_dimensions,
                    &mut initialization,
                    device,
                )
            })
            .take(config.residual_blocks)
            .collect(),
            output: initialization.linear(config.width, 2, false, device),
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

    /// Verifies every loaded tensor against the declared architecture.
    ///
    /// Burn records carry tensor shapes independently of [`ProjectorConfig`].
    /// Checking the complete module after record loading prevents a compatible
    /// envelope from concealing incompatible parameter tensors.
    ///
    /// # Errors
    ///
    /// Returns an error when a residual-block count or parameter shape differs
    /// from the declared architecture.
    pub(crate) fn validate_loaded_architecture(
        &self,
        expected: ProjectorConfig,
    ) -> Result<(), ProjectorError> {
        let expected = expected.validate()?;
        let input_dimensions = expected.input_dimensions()?;
        let condition_dimensions = expected.condition_dimensions()?;
        validate_linear(&self.input, "input", input_dimensions, expected.width)?;
        validate_layer_norm(
            &self.input_normalization,
            "input-normalization",
            expected.width,
        )?;
        validate_matrix(
            "role.weight",
            self.role.weight.val().dims(),
            [expected.role_count, expected.role_dimensions],
        )?;
        if self.blocks.len() != expected.residual_blocks {
            return Err(ProjectorError::LoadedBlockCount {
                expected: expected.residual_blocks,
                actual: self.blocks.len(),
            });
        }
        for block in &self.blocks {
            validate_linear(&block.input, "block.input", expected.width, expected.width)?;
            validate_layer_norm(&block.normalization, "block.normalization", expected.width)?;
            validate_linear(
                &block.output,
                "block.output",
                expected.width,
                expected.width,
            )?;
            validate_linear(
                &block.film,
                "block.film",
                condition_dimensions,
                expected.width * 2,
            )?;
        }
        validate_linear(&self.output, "output", expected.width, 2)
    }

    /// Replaces runtime-generated parameter IDs with stable module-order IDs.
    ///
    /// Burn records include parameter IDs even though inference semantics do
    /// not depend on their process-global allocation order. Canonical IDs make
    /// independently trained, numerically identical projectors byte-identical.
    #[must_use]
    pub(crate) fn canonicalize_parameter_ids(mut self) -> Self {
        let mut next = 1_u64;
        let mut assign = |id: &mut ParamId| {
            *id = ParamId::from(next);
            next += 1;
        };
        assign(&mut self.input.weight.id);
        if let Some(bias) = &mut self.input.bias {
            assign(&mut bias.id);
        }
        assign(&mut self.input_normalization.gamma.id);
        if let Some(beta) = &mut self.input_normalization.beta {
            assign(&mut beta.id);
        }
        assign(&mut self.role.weight.id);
        for block in &mut self.blocks {
            assign(&mut block.input.weight.id);
            if let Some(bias) = &mut block.input.bias {
                assign(&mut bias.id);
            }
            assign(&mut block.normalization.gamma.id);
            if let Some(beta) = &mut block.normalization.beta {
                assign(&mut beta.id);
            }
            assign(&mut block.output.weight.id);
            if let Some(bias) = &mut block.output.bias {
                assign(&mut bias.id);
            }
            assign(&mut block.film.weight.id);
            if let Some(bias) = &mut block.film.bias {
                assign(&mut bias.id);
            }
        }
        assign(&mut self.output.weight.id);
        if let Some(bias) = &mut self.output.bias {
            assign(&mut bias.id);
        }
        self
    }
}

struct DeterministicInitialization {
    rng: Xoshiro256PlusPlus,
    next_parameter_id: u64,
}

impl DeterministicInitialization {
    fn new(seed: u64) -> Self {
        Self {
            rng: Xoshiro256PlusPlus::seed_from_u64(seed),
            next_parameter_id: 1,
        }
    }

    fn linear<B: Backend>(
        &mut self,
        input: usize,
        output: usize,
        zero: bool,
        device: &B::Device,
    ) -> Linear<B> {
        let mut linear = LinearConfig::new(input, output)
            .with_initializer(Initializer::Zeros)
            .init(device);
        let bound = if zero {
            0.0
        } else {
            let input = u16::try_from(input)
                .expect("validated projector linear input should fit deterministic initializer");
            1.0 / f32::from(input).sqrt()
        };
        let weight_values = self.symmetric_values(input.saturating_mul(output), bound);
        linear.weight = self.parameter(linear.weight, weight_values, [input, output], device);
        linear.bias = linear.bias.take().map(|bias| {
            let bias_values = self.symmetric_values(output, bound);
            self.parameter(bias, bias_values, [output], device)
        });
        linear
    }

    fn layer_norm<B: Backend>(&mut self, width: usize, device: &B::Device) -> LayerNorm<B> {
        let mut normalization = LayerNormConfig::new(width).init(device);
        normalization.gamma =
            self.parameter(normalization.gamma, vec![1.0; width], [width], device);
        normalization.beta = normalization
            .beta
            .take()
            .map(|beta| self.parameter(beta, vec![0.0; width], [width], device));
        normalization
    }

    fn embedding<B: Backend>(
        &mut self,
        count: usize,
        dimensions: usize,
        device: &B::Device,
    ) -> Embedding<B> {
        let mut embedding = EmbeddingConfig::new(count, dimensions)
            .with_initializer(Initializer::Zeros)
            .init(device);
        let values = self.symmetric_values(count.saturating_mul(dimensions), 1.732_050_8);
        embedding.weight = self.parameter(embedding.weight, values, [count, dimensions], device);
        embedding
    }

    fn parameter<B: Backend, const DIMENSIONS: usize>(
        &mut self,
        parameter: Param<Tensor<B, DIMENSIONS>>,
        values: Vec<f32>,
        shape: [usize; DIMENSIONS],
        device: &B::Device,
    ) -> Param<Tensor<B, DIMENSIONS>> {
        let id = ParamId::from(self.next_parameter_id);
        self.next_parameter_id = self
            .next_parameter_id
            .checked_add(1)
            .expect("projector parameter identifier should not overflow");
        parameter.transform_for_load(
            Tensor::from_data(TensorData::new(values, shape), device),
            id,
        )
    }

    fn symmetric_values(&mut self, count: usize, bound: f32) -> Vec<f32> {
        core::iter::repeat_with(|| {
            let bits = self.rng.next_u32();
            let high = u16::try_from(bits >> 16).expect("upper random bits should fit u16");
            let low = u8::try_from((bits >> 8) & 0xFF).expect("lower random bits should fit u8");
            let unit = f32::from(high) / 65_536.0 + f32::from(low) / 16_777_216.0;
            2.0_f32.mul_add(unit, -1.0) * bound
        })
        .take(count)
        .collect()
    }
}

fn validate_linear<B: Backend>(
    linear: &Linear<B>,
    parameter: &'static str,
    input: usize,
    output: usize,
) -> Result<(), ProjectorError> {
    validate_matrix(parameter, linear.weight.val().dims(), [input, output])?;
    validate_vector(
        parameter,
        linear.bias.as_ref().map_or(0, |bias| bias.val().dims()[0]),
        output,
    )
}

fn validate_layer_norm<B: Backend>(
    normalization: &LayerNorm<B>,
    parameter: &'static str,
    width: usize,
) -> Result<(), ProjectorError> {
    validate_vector(parameter, normalization.gamma.val().dims()[0], width)?;
    validate_vector(
        parameter,
        normalization
            .beta
            .as_ref()
            .map_or(0, |bias| bias.val().dims()[0]),
        width,
    )
}

#[inline]
fn validate_matrix(
    parameter: &'static str,
    actual: [usize; 2],
    expected: [usize; 2],
) -> Result<(), ProjectorError> {
    if actual == expected {
        Ok(())
    } else {
        Err(ProjectorError::LoadedMatrixShape {
            parameter,
            expected,
            actual,
        })
    }
}

#[inline]
const fn validate_vector(
    parameter: &'static str,
    actual: usize,
    expected: usize,
) -> Result<(), ProjectorError> {
    if actual == expected {
        Ok(())
    } else {
        Err(ProjectorError::LoadedVectorLength {
            parameter,
            expected,
            actual,
        })
    }
}
