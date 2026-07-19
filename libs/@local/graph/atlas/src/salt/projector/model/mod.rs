//! The projector model: a `FiLM`-conditioned residual MLP to 2D.
//!
//! A [`Projector`] maps a batch of node representations, each paired
//! with a [`NodeRole`] and a global condition vector, to 2D
//! coordinates:
//!
//! ```text
//! u  = [representation; role embedding]
//! h0 = SiLU(LN(W0 u + b0))
//! h' = h + W2 SiLU(FiLM(LN(W1 h + b1), c)) + b2      (per block)
//! y  = W_head h_last + b_head
//! ```
//!
//! `FiLM` predicts a delta from unit scale and a shift out of the
//! condition vector: `FiLM(v, c) = (1 + dgamma(c)) * v + beta(c)`.
//! Modulation sits between normalization and activation, so it gates
//! normalized features directly; placed before the block's linear and
//! normalization instead, the downstream LN would cancel the
//! modulation's scale component (exactly so for a uniform gamma).
//! The model does not know what the condition columns mean; the batch
//! assembler names them, and their count is the [`Architecture`]'s
//! `condition_dimensions`.
//!
//! Two initialization contracts hold, and the unit tests certify both:
//!
//! - every residual block is the identity (its second linear and bias initialize to zero), so the
//!   initial model is stem plus head;
//! - `FiLM` is the identity for every condition (its linear map and bias initialize to zero), so
//!   all conditions share one function before training.
//!
//! All other biases initialize to zero and all weights to scaled
//! uniform values, except the role embedding, whose per-component
//! scale matches the representation's (a unit-norm vector has
//! per-component variance `1/dimensions`): no input block dominates
//! the stem by construction.
//!
//! Every initial parameter is materialized from a caller-supplied
//! random stream with sequential parameter identifiers, never from the
//! backend's global random state: two models built from equal
//! architectures, seeds, and stream types are identical on every
//! backend.

#![expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "the Module derive mirrors a struct's visibility onto its generated record fields"
)]

#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

use burn::{
    module::{Module, Param, ParamId},
    nn::{
        Embedding, EmbeddingConfig, Initializer, LayerNorm, LayerNormConfig, Linear, LinearConfig,
    },
    tensor::{Int, Tensor, TensorData, activation::silu, backend::Backend},
};
use rand::{Rng, RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use crate::dataset::PROJECTOR_DIMENSIONS;

/// A verified layer of the model, named as its mismatch reports it.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Layer {
    /// The residual block stack as a whole.
    BlockStack,
    /// The representation input columns.
    InputColumns,
    /// The condition input columns.
    ConditionColumns,
    /// The stem linear.
    Stem,
    /// The stem's layer normalization.
    StemNormalization,
    /// The role embedding table.
    RoleEmbedding,
    /// A residual block's input linear.
    InputLinear,
    /// A residual block's condition-modulation linear.
    ModulationLinear,
    /// A residual block's layer normalization.
    Normalization,
    /// A residual block's output linear.
    OutputLinear,
    /// The coordinate head.
    Head,
}

impl Layer {
    /// Returns the layer's display name.
    #[must_use]
    pub(crate) const fn name(self) -> &'static str {
        match self {
            Self::BlockStack => "block stack",
            Self::InputColumns => "input columns",
            Self::ConditionColumns => "condition columns",
            Self::Stem => "stem",
            Self::StemNormalization => "stem normalization",
            Self::RoleEmbedding => "role embedding",
            Self::InputLinear => "input linear",
            Self::ModulationLinear => "modulation linear",
            Self::Normalization => "normalization",
            Self::OutputLinear => "output linear",
            Self::Head => "head",
        }
    }
}

/// A verified dimension of a layer, named as its mismatch reports it.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Dimension {
    /// The block stack's block count.
    Depth,
    /// The representation column width.
    RepresentationWidth,
    /// A plain width: condition columns, the role embedding's rows.
    Width,
    /// The role embedding's vocabulary size.
    RoleCount,
    /// A linear's input width.
    InputWidth,
    /// A linear's output width.
    OutputWidth,
    /// A linear's bias length.
    BiasLength,
    /// A normalization's scale length.
    ScaleLength,
    /// A normalization's shift length.
    ShiftLength,
}

impl Dimension {
    /// Returns the dimension's display name.
    #[must_use]
    pub(crate) const fn name(self) -> &'static str {
        match self {
            Self::Depth => "depth",
            Self::RepresentationWidth => "representation width",
            Self::Width => "width",
            Self::RoleCount => "role count",
            Self::InputWidth => "input width",
            Self::OutputWidth => "output width",
            Self::BiasLength => "bias length",
            Self::ScaleLength => "scale length",
            Self::ShiftLength => "shift length",
        }
    }
}

/// A model's parameters do not describe an architecture.
///
/// The named dimension is the first one that differs; an `actual` of
/// zero on a bias or shift reports the parameter as absent, a shape no
/// present parameter can have.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ArchitectureMismatch {
    /// The layer carrying the differing dimension.
    pub layer: Layer,
    /// The differing dimension.
    pub dimension: Dimension,
    /// The residual block carrying the layer; [`None`] outside the
    /// block stack.
    pub block: Option<usize>,
    /// The architecture's value.
    pub expected: usize,
    /// The model's value.
    pub actual: usize,
}

impl fmt::Display for ArchitectureMismatch {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self {
            layer,
            dimension,
            block,
            expected,
            actual,
        } = *self;
        let (layer, dimension) = (layer.name(), dimension.name());
        if let Some(block) = block {
            write!(
                formatter,
                "the model's {layer} {dimension} in residual block {block} is {actual}, not the \
                 architecture's {expected}",
            )
        } else {
            write!(
                formatter,
                "the model's {layer} {dimension} is {actual}, not the architecture's {expected}",
            )
        }
    }
}

impl Error for ArchitectureMismatch {}

/// The projection role of a node row.
///
/// Roles distinguish what kind of thing a row is on the map; the model
/// learns one embedding vector per role and concatenates it to the
/// representation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum NodeRole {
    /// A knowledge-graph entity.
    KnowledgeEntity,
    /// An ontology type projected as a first-class map citizen.
    OntologyType,
    /// A supported row that is neither of the above.
    Other,
}

impl NodeRole {
    /// Distinct roles: the role embedding's vocabulary size.
    pub(crate) const COUNT: usize = core::mem::variant_count::<Self>();

    /// This role's embedding index.
    #[inline]
    #[must_use]
    pub(crate) const fn index(self) -> u32 {
        self as u32
    }
}

const DEFAULT_WIDTH: NonZero<usize> = const { NonZero::new(512).unwrap() };
const DEFAULT_RESIDUAL_BLOCKS: NonZero<usize> = const { NonZero::new(4).unwrap() };
const DEFAULT_REPRESENTATION_DIMENSIONS: NonZero<usize> =
    const { NonZero::new(PROJECTOR_DIMENSIONS).unwrap() };
const DEFAULT_ROLE_DIMENSIONS: NonZero<usize> = const { NonZero::new(16).unwrap() };
const DEFAULT_CONDITION_DIMENSIONS: NonZero<usize> = const { NonZero::new(1).unwrap() };

/// Shape of a [`Projector`]: every dimension the model is built from.
///
/// All fields are construction-valid; building a model from an
/// architecture cannot fail. Width and depth are benchmark axes - the
/// defaults are the candidate the quality and throughput criteria
/// judge first, not validated optima.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Architecture {
    /// Hidden width of the stem and every residual block.
    pub width: NonZero<usize> = DEFAULT_WIDTH,
    /// Residual block count between stem and head.
    pub residual_blocks: NonZero<usize> = DEFAULT_RESIDUAL_BLOCKS,
    /// Width of the input representation rows.
    pub representation_dimensions: NonZero<usize> = DEFAULT_REPRESENTATION_DIMENSIONS,
    /// Width of the learned role embedding.
    pub role_dimensions: NonZero<usize> = DEFAULT_ROLE_DIMENSIONS,
    /// Width of the condition vector consumed by every `FiLM` layer.
    ///
    /// The initial generation feeds the single relation-lens column
    /// `[eta]`; a future type-conditioned generation appends pooled
    /// type-context columns without touching the model code.
    pub condition_dimensions: NonZero<usize> = DEFAULT_CONDITION_DIMENSIONS,
}

/// One projection batch.
#[derive(Debug)]
pub(crate) struct ProjectorInput<B: Backend> {
    /// Normalized representations with shape `[rows, representation]`.
    pub representation: Tensor<B, 2>,
    /// [`NodeRole::index`] values with shape `[rows]`.
    pub roles: Tensor<B, 1, Int>,
    /// Condition vectors with shape `[rows, condition]`.
    pub condition: Tensor<B, 2>,
}

/// Feature-wise linear modulation from a condition vector.
///
/// `forward(h, c) = (1 + dgamma(c)) * h + beta(c)`, where one linear
/// map produces `[dgamma; beta]`. The map and its bias initialize to
/// zero, so modulation starts as the identity for every condition.
#[derive(Module, Debug)]
struct Film<B: Backend> {
    linear: Linear<B>,
}

impl<B: Backend> Film<B> {
    fn new<R: Rng>(
        width: usize,
        condition_dimensions: usize,
        initialization: &mut Initialization<R>,
        device: &B::Device,
    ) -> Self {
        Self {
            linear: initialization.linear(
                condition_dimensions,
                2 * width,
                LinearInit::Zero,
                device,
            ),
        }
    }

    fn forward(&self, features: Tensor<B, 2>, condition: Tensor<B, 2>) -> Tensor<B, 2> {
        let width = features.dims()[1];
        let modulation = self.linear.forward(condition);
        let gamma = modulation.clone().narrow(1, 0, width) + 1.0;
        let beta = modulation.narrow(1, width, width);

        features * gamma + beta
    }
}

/// One residual block, condition-modulated between LN and activation.
///
/// `forward(h, c) = h + W2 SiLU(FiLM(LN(W1 h + b1), c)) + b2`. The
/// second linear and its bias initialize to zero, so the block is the
/// identity before training.
#[derive(Module, Debug)]
struct ResidualBlock<B: Backend> {
    film: Film<B>,
    input: Linear<B>,
    normalization: LayerNorm<B>,
    output: Linear<B>,
}

impl<B: Backend> ResidualBlock<B> {
    fn new<R: Rng>(
        width: usize,
        condition_dimensions: usize,
        initialization: &mut Initialization<R>,
        device: &B::Device,
    ) -> Self {
        Self {
            film: Film::new(width, condition_dimensions, initialization, device),
            input: initialization.linear(width, width, LinearInit::Scaled, device),
            normalization: initialization.layer_norm(width, device),
            output: initialization.linear(width, width, LinearInit::Zero, device),
        }
    }

    fn forward(&self, hidden: Tensor<B, 2>, condition: Tensor<B, 2>) -> Tensor<B, 2> {
        let normalized = self
            .normalization
            .forward(self.input.forward(hidden.clone()));
        let update = self
            .output
            .forward(silu(self.film.forward(normalized, condition)));

        hidden + update
    }
}

/// The conditioned projector model.
///
/// See the module documentation for the forward computation and the
/// initialization contracts.
#[derive(Module, Debug)]
pub(crate) struct Projector<B: Backend> {
    stem: Linear<B>,
    stem_normalization: LayerNorm<B>,
    role: Embedding<B>,
    blocks: Vec<ResidualBlock<B>>,
    head: Linear<B>,
    representation_dimensions: usize,
    condition_dimensions: usize,
}

impl<B: Backend> Projector<B> {
    /// Builds a freshly initialized model.
    ///
    /// Every parameter is drawn from `rng` in construction order, so
    /// equal architectures, stream types, and seeds produce identical
    /// models on every backend.
    #[must_use]
    pub(crate) fn new<R: Rng>(architecture: Architecture, mut rng: R, device: &B::Device) -> Self {
        let width = architecture.width.get();
        let condition_dimensions = architecture.condition_dimensions.get();
        let representation_dimensions = architecture.representation_dimensions.get();

        let input_dimensions = representation_dimensions
            .checked_add(architecture.role_dimensions.get())
            .expect("projector input dimensions should not overflow");

        let mut initialization = Initialization {
            rng: &mut rng,
            next_parameter_id: 1,
        };

        Self {
            stem: initialization.linear(input_dimensions, width, LinearInit::Scaled, device),
            stem_normalization: initialization.layer_norm(width, device),
            role: initialization.embedding(
                NodeRole::COUNT,
                architecture.role_dimensions.get(),
                representation_dimensions,
                device,
            ),
            blocks: core::iter::repeat_with(|| {
                ResidualBlock::new(width, condition_dimensions, &mut initialization, device)
            })
            .take(architecture.residual_blocks.get())
            .collect(),
            head: initialization.linear(width, 2, LinearInit::Scaled, device),
            representation_dimensions,
            condition_dimensions,
        }
    }

    /// Projects one batch into 2D coordinates with shape `[rows, 2]`.
    ///
    /// # Panics
    ///
    /// Panics when the representation width, the condition width, or
    /// the per-tensor row counts disagree with the architecture and
    /// each other.
    #[must_use]
    pub(crate) fn forward(&self, input: ProjectorInput<B>) -> Tensor<B, 2> {
        let [rows, representation_dimensions] = input.representation.dims();
        assert_eq!(
            representation_dimensions, self.representation_dimensions,
            "representation width should match the architecture"
        );

        let [role_rows] = input.roles.dims();
        assert_eq!(
            role_rows, rows,
            "role count should match the representation rows"
        );

        let [condition_rows, condition_dimensions] = input.condition.dims();
        assert_eq!(
            condition_rows, rows,
            "condition rows should match the representation rows"
        );
        assert_eq!(
            condition_dimensions, self.condition_dimensions,
            "condition width should match the architecture"
        );

        let roles = input.roles.unsqueeze_dim::<2>(1);
        let role = self.role.forward(roles).squeeze_dim::<2>(1);

        let features = Tensor::cat(vec![input.representation, role], 1);

        let mut hidden = silu(self.stem_normalization.forward(self.stem.forward(features)));
        for block in &self.blocks {
            hidden = block.forward(hidden, input.condition.clone());
        }

        self.head.forward(hidden)
    }

    /// Builds the model a record describes, verified against the
    /// architecture.
    ///
    /// A record loaded into a model adopts the record's tensor shapes,
    /// so a record decoded against the wrong architecture would
    /// produce a structurally wrong model without an error of its own;
    /// this constructor is what turns that into one. The block-stack
    /// depth is verified before the record loads - a depth mismatch
    /// panics inside the module zip - and every parameter shape after.
    ///
    /// # Errors
    ///
    /// Returns the first differing dimension.
    pub(crate) fn from_record(
        architecture: Architecture,
        record: ProjectorRecord<B>,
        device: &B::Device,
    ) -> Result<Self, ArchitectureMismatch> {
        Site::model(Layer::BlockStack).confirm(
            Dimension::Depth,
            architecture.residual_blocks.get(),
            record.blocks.len(),
        )?;

        // The freshly drawn parameters are wholly replaced by the
        // record; the throwaway stream is the price of reusing the
        // one construction path.
        let model = Self::new(architecture, Xoshiro256PlusPlus::seed_from_u64(0), device)
            .load_record(record);
        model.check_architecture(architecture)?;
        Ok(model)
    }

    /// Verifies that every parameter has the shape the architecture
    /// describes.
    ///
    /// # Errors
    ///
    /// Returns the first differing dimension.
    fn check_architecture(&self, architecture: Architecture) -> Result<(), ArchitectureMismatch> {
        let width = architecture.width.get();
        let condition = architecture.condition_dimensions.get();
        let representation = architecture.representation_dimensions.get();
        let role = architecture.role_dimensions.get();
        let input = representation
            .checked_add(role)
            .expect("projector input dimensions should not overflow");

        Site::model(Layer::InputColumns).confirm(
            Dimension::RepresentationWidth,
            representation,
            self.representation_dimensions,
        )?;
        Site::model(Layer::ConditionColumns).confirm(
            Dimension::Width,
            condition,
            self.condition_dimensions,
        )?;
        check_linear(Site::model(Layer::Stem), &self.stem, input, width)?;
        check_normalization(
            Site::model(Layer::StemNormalization),
            &self.stem_normalization,
            width,
        )?;

        let [roles, role_width] = self.role.weight.val().dims();
        let embedding = Site::model(Layer::RoleEmbedding);
        embedding.confirm(Dimension::RoleCount, NodeRole::COUNT, roles)?;
        embedding.confirm(Dimension::Width, role, role_width)?;

        Site::model(Layer::BlockStack).confirm(
            Dimension::Depth,
            architecture.residual_blocks.get(),
            self.blocks.len(),
        )?;
        for (index, block) in self.blocks.iter().enumerate() {
            check_linear(
                Site::block(Layer::InputLinear, index),
                &block.input,
                width,
                width,
            )?;
            check_linear(
                Site::block(Layer::ModulationLinear, index),
                &block.film.linear,
                condition,
                2 * width,
            )?;
            check_normalization(
                Site::block(Layer::Normalization, index),
                &block.normalization,
                width,
            )?;
            check_linear(
                Site::block(Layer::OutputLinear, index),
                &block.output,
                width,
                width,
            )?;
        }

        check_linear(
            Site::model(Layer::Head),
            &self.head,
            width,
            PROJECTED_DIMENSIONS,
        )
    }
}

/// Output coordinates per row.
const PROJECTED_DIMENSIONS: usize = 2;

/// One verified location in the model: a layer, positioned in the
/// block stack when it lives there.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct Site {
    layer: Layer,
    block: Option<usize>,
}

impl Site {
    /// A layer outside the block stack.
    const fn model(layer: Layer) -> Self {
        Self { layer, block: None }
    }

    /// A layer inside residual block `block`.
    const fn block(layer: Layer, block: usize) -> Self {
        Self {
            layer,
            block: Some(block),
        }
    }

    /// Confirms one of the site's dimensions against the architecture.
    const fn confirm(
        self,
        dimension: Dimension,
        expected: usize,
        actual: usize,
    ) -> Result<(), ArchitectureMismatch> {
        if expected == actual {
            return Ok(());
        }

        Err(ArchitectureMismatch {
            layer: self.layer,
            dimension,
            block: self.block,
            expected,
            actual,
        })
    }
}

/// Verifies a linear layer's weight shape and bias presence.
fn check_linear<B: Backend>(
    site: Site,
    linear: &Linear<B>,
    input: usize,
    output: usize,
) -> Result<(), ArchitectureMismatch> {
    let [rows, columns] = linear.weight.val().dims();
    site.confirm(Dimension::InputWidth, input, rows)?;
    site.confirm(Dimension::OutputWidth, output, columns)?;
    site.confirm(
        Dimension::BiasLength,
        output,
        linear.bias.as_ref().map_or(0, |bias| bias.val().dims()[0]),
    )
}

/// Verifies a layer normalization's scale and shift lengths.
fn check_normalization<B: Backend>(
    site: Site,
    normalization: &LayerNorm<B>,
    width: usize,
) -> Result<(), ArchitectureMismatch> {
    site.confirm(
        Dimension::ScaleLength,
        width,
        normalization.gamma.val().dims()[0],
    )?;
    site.confirm(
        Dimension::ShiftLength,
        width,
        normalization
            .beta
            .as_ref()
            .map_or(0, |beta| beta.val().dims()[0]),
    )
}

/// Weight initialization of one linear layer.
///
/// Every linear carries its bias, zero-initialized; only the weights
/// differ. Zero layers are the identity-contract layers (block
/// outputs, `FiLM`): together with their zero bias they contribute
/// nothing until training moves them.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum LinearInit {
    /// Uniform weights bounded by `1/sqrt(input)`.
    Scaled,
    /// Zero weights.
    Zero,
}

/// Deterministic parameter materialization from one random stream.
///
/// Parameters receive sequential identifiers and values drawn from the
/// stream in construction order, replacing whatever the layer configs
/// would have initialized; the backend's global random state is never
/// touched.
struct Initialization<'rng, R> {
    rng: &'rng mut R,
    next_parameter_id: u64,
}

impl<R: Rng> Initialization<'_, R> {
    /// Builds a linear layer in one of the two model forms.
    fn linear<B: Backend>(
        &mut self,
        input: usize,
        output: usize,
        init: LinearInit,
        device: &B::Device,
    ) -> Linear<B> {
        let mut linear = LinearConfig::new(input, output)
            .with_initializer(Initializer::Zeros)
            .init(device);

        #[expect(
            clippy::cast_precision_loss,
            reason = "layer widths are far below f32's exact-integer range"
        )]
        let bound = match init {
            LinearInit::Scaled => (input as f32).sqrt().recip(),
            LinearInit::Zero => 0.0,
        };

        let weights = self.values(input * output, bound);

        linear.weight = self.parameter(linear.weight, weights, [input, output], device);
        linear.bias = linear.bias.take().map(|parameter| {
            let values = self.values(output, 0.0);
            self.parameter(parameter, values, [output], device)
        });

        linear
    }

    /// Builds a layer normalization with unit scale and zero shift.
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

    /// Builds an embedding scaled to sit beside a unit-norm vector.
    ///
    /// Rows are uniform with per-component variance
    /// `1/reference_dimensions` - the per-component variance of a
    /// unit-norm `reference_dimensions`-vector - so concatenating a
    /// row to such a vector lets neither block dominate a downstream
    /// linear by scale alone.
    fn embedding<B: Backend>(
        &mut self,
        count: usize,
        dimensions: usize,
        reference_dimensions: usize,
        device: &B::Device,
    ) -> Embedding<B> {
        let mut embedding = EmbeddingConfig::new(count, dimensions)
            .with_initializer(Initializer::Zeros)
            .init(device);

        #[expect(
            clippy::cast_precision_loss,
            reason = "representation widths are far below f32's exact-integer range"
        )]
        // Uniform over [-b, b] has variance b^2/3.
        let bound = (3.0 / reference_dimensions as f32).sqrt();
        let values = self.values(count * dimensions, bound);

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
            .expect("parameter identifiers should not overflow");

        parameter.transform_for_load(
            Tensor::from_data(TensorData::new(values, shape), device),
            id,
        )
    }

    fn values(&mut self, count: usize, bound: f32) -> Vec<f32> {
        if bound == 0.0 {
            return vec![0.0; count];
        }

        core::iter::repeat_with(|| self.rng.random_range(-bound..=bound))
            .take(count)
            .collect()
    }
}
