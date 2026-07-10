//! Distilled per-level encoders that place entity embeddings on fitted 2D
//! maps without refitting the layout.
//!
//! The primary type is [`Projector`]. For each level of the alpha ladder,
//! [`Projector::fit`] distills the fitted layout into a small encoder by
//! training it to reproduce the layout's coordinates from the entities'
//! structure features; [`TrainingConfig`] holds the hyperparameters and
//! defaults.
//!
//! Training happens in standardized coordinate space: the layout's per-axis
//! mean and standard deviation are removed from the targets, and the inverse
//! transform is folded back into the encoder's final linear layer after
//! training. The returned [`FittedProjector`] therefore produces raw layout
//! units from [`Projector::forward`], while its standardized twin carries the
//! trained weights forward to the next rung of the ladder.

mod data;
#[cfg(test)]
mod tests;
mod train;

use core::{error::Error, fmt};

use burn::{
    module::{Module, Param},
    nn::{Gelu, Linear, LinearConfig},
    record::RecorderError,
    tensor::{Tensor, backend::Backend},
};

pub(crate) use self::data::{ProjectionBatch, ProjectionBatcher, ProjectionItem};

/// Width of the projected output: entities are placed on a 2D map.
pub(crate) const OUTPUT_DIM: usize = 2;
/// Width of the hidden layers.
pub(crate) const HIDDEN_DIM: usize = 512;

/// An invalid training configuration or input, or a failed checkpoint
/// restore.
#[derive(Debug)]
pub enum ProjectorError {
    /// The training data has no rows.
    EmptyTrainingData,
    /// The target matrix rows are not 2-wide map coordinates.
    OutputDimension { actual: usize },
    /// The feature matrix width does not match the encoder's input layer.
    InputDimension { expected: usize, actual: usize },
    /// The feature and coordinate matrices disagree on the row count.
    RowCount { features: usize, coordinates: usize },
    /// A target coordinate is NaN or infinite.
    NonFiniteCoordinate { row: usize, axis: usize, value: f32 },
    /// The batch size is zero.
    InvalidBatchSize(usize),
    /// The epoch count is zero.
    InvalidEpochs(usize),
    /// The early-stopping patience is zero.
    InvalidPatience(usize),
    /// The dataloader worker count is zero.
    InvalidWorkers(usize),
    /// The validation fraction leaves no validation or no training rows.
    InvalidValidationSplit { rows: usize, fraction: f64 },
    /// The learning rates are outside `0 < min <= rate <= 1`.
    InvalidLearningRate { rate: f64, minimum: f64 },
    /// The recorded training metrics could not be read back.
    Summary(String),
    /// The best-epoch checkpoint could not be restored.
    Checkpoint(RecorderError),
}

impl fmt::Display for ProjectorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyTrainingData => formatter.write_str("training data must not be empty"),
            Self::OutputDimension { actual } => write!(
                formatter,
                "target rows must be {OUTPUT_DIM}-wide map coordinates, got {actual} values"
            ),
            Self::InputDimension { expected, actual } => write!(
                formatter,
                "encoder expects {expected}-wide feature rows, got {actual} values"
            ),
            Self::RowCount {
                features,
                coordinates,
            } => write!(
                formatter,
                "training inputs disagree on row count: {features} feature rows and {coordinates} \
                 coordinate rows"
            ),
            Self::NonFiniteCoordinate { row, axis, value } => write!(
                formatter,
                "target coordinate at row {row}, axis {axis} is non-finite: {value}"
            ),
            Self::InvalidBatchSize(size) => {
                write!(formatter, "batch size must be positive, got {size}")
            }
            Self::InvalidEpochs(epochs) => {
                write!(formatter, "epoch count must be positive, got {epochs}")
            }
            Self::InvalidPatience(patience) => {
                write!(
                    formatter,
                    "early-stopping patience must be positive, got {patience}"
                )
            }
            Self::InvalidWorkers(workers) => {
                write!(
                    formatter,
                    "dataloader worker count must be positive, got {workers}"
                )
            }
            Self::InvalidValidationSplit { rows, fraction } => write!(
                formatter,
                "validation fraction {fraction} leaves no validation or no training rows out of \
                 {rows}"
            ),
            Self::InvalidLearningRate { rate, minimum } => write!(
                formatter,
                "learning rates must satisfy 0 < minimum <= rate <= 1, got rate {rate} with \
                 minimum {minimum}"
            ),
            Self::Summary(error) => {
                write!(
                    formatter,
                    "failed to read recorded training metrics: {error}"
                )
            }
            Self::Checkpoint(_) => {
                formatter.write_str("failed to restore the best validation checkpoint")
            }
        }
    }
}

impl Error for ProjectorError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Checkpoint(error) => Some(error),
            Self::EmptyTrainingData
            | Self::OutputDimension { .. }
            | Self::InputDimension { .. }
            | Self::RowCount { .. }
            | Self::NonFiniteCoordinate { .. }
            | Self::InvalidBatchSize(_)
            | Self::InvalidEpochs(_)
            | Self::InvalidPatience(_)
            | Self::InvalidWorkers(_)
            | Self::InvalidValidationSplit { .. }
            | Self::InvalidLearningRate { .. }
            | Self::Summary(_) => None,
        }
    }
}

/// Hyperparameters for [`Projector::fit`].
///
/// Every field has a default, so a training run only needs
/// `TrainingConfig { .. }`; name individual fields to override them, for
/// example `TrainingConfig { epochs: 100, .. }`.
#[derive(Debug, Copy, Clone, Default)]
pub struct TrainingConfig {
    /// Number of rows per optimizer step.
    pub batch_size: usize = 8192,
    /// Upper bound on passes over the training split.
    ///
    /// Early stopping usually ends training sooner; see [`Self::patience`].
    pub epochs: usize = 30,
    /// Learning rate at the start of the cosine schedule.
    ///
    /// Must be in `(0, 1]`.
    pub learning_rate: f64 = 1e-3,
    /// Learning rate the cosine schedule decays toward by the final
    /// scheduled step.
    ///
    /// Must be in `(0, learning_rate]`.
    pub learning_rate_min: f64 = 1e-4,
    /// Fraction of rows held out as the validation split.
    ///
    /// The held-out rows drive early stopping and never influence the
    /// weights. The row count rounds down and must leave at least one row on
    /// each side of the split.
    pub validation_fraction: f64 = 0.02,
    /// Seed for the train/validation split, the per-epoch batch shuffling,
    /// and the backend RNG for the run.
    ///
    /// Weight initialization happens in [`Projector::new`] and is not
    /// covered by this seed.
    pub seed: u64 = 42,
    /// Number of consecutive epochs the validation loss may fail to improve
    /// before training stops early.
    pub patience: usize = 5,
    /// Number of worker threads each dataloader uses to fetch and collate
    /// batches.
    pub num_workers: usize = 4,
}

impl TrainingConfig {
    /// Rejects configurations that would stall, diverge, or divide by zero.
    ///
    /// # Errors
    ///
    /// Returns an error naming the first invalid field; row-dependent checks
    /// (the validation split) happen in [`Projector::fit`].
    pub(super) fn validate(self) -> Result<Self, ProjectorError> {
        if self.batch_size == 0 {
            return Err(ProjectorError::InvalidBatchSize(self.batch_size));
        }

        if self.epochs == 0 {
            return Err(ProjectorError::InvalidEpochs(self.epochs));
        }

        if self.patience == 0 {
            return Err(ProjectorError::InvalidPatience(self.patience));
        }

        if self.num_workers == 0 {
            return Err(ProjectorError::InvalidWorkers(self.num_workers));
        }

        if !self.learning_rate.is_finite()
            || !self.learning_rate_min.is_finite()
            || self.learning_rate_min <= 0.0
            || self.learning_rate_min > self.learning_rate
            || self.learning_rate > 1.0
        {
            return Err(ProjectorError::InvalidLearningRate {
                rate: self.learning_rate,
                minimum: self.learning_rate_min,
            });
        }

        if !self.validation_fraction.is_finite()
            || self.validation_fraction <= 0.0
            || self.validation_fraction >= 1.0
        {
            return Err(ProjectorError::InvalidValidationSplit {
                rows: 0,
                fraction: self.validation_fraction,
            });
        }

        Ok(self)
    }
}

/// An encoder that places entity embeddings on a fitted 2D map.
///
/// A projector is distilled from one level of a fitted layout:
/// [`Projector::fit`] trains it to reproduce the layout's coordinates from
/// the entities' structure features, after which [`Projector::forward`]
/// places any feature row, including ones the layout was never fitted on, at
/// the position the layout would have assigned.
///
/// The encoder is a three-layer perceptron (`input_dim -> 512 -> 512 -> 2`)
/// with GELU activations. The architecture is part of the encoder's exchange
/// format: consumers of exported weights must apply the same activation, and
/// [`Gelu`] is the exact erf-based form, not the tanh approximation.
#[derive(Module, Debug)]
pub struct Projector<B: Backend> {
    l0: Linear<B>,
    l1: Linear<B>,
    l2: Linear<B>,
    activation: Gelu,
}

impl<B: Backend> Projector<B> {
    /// Creates an untrained projector for feature rows `input_dim` values
    /// wide.
    ///
    /// Weights are randomly initialized on `device`; train them with
    /// [`Projector::fit`].
    pub(crate) fn new(input_dim: usize, device: &B::Device) -> Self {
        Self {
            l0: LinearConfig::new(input_dim, HIDDEN_DIM).init(device),
            l1: LinearConfig::new(HIDDEN_DIM, HIDDEN_DIM).init(device),
            l2: LinearConfig::new(HIDDEN_DIM, OUTPUT_DIM).init(device),
            activation: Gelu::new(),
        }
    }

    /// The feature width this encoder was built for.
    pub(crate) fn input_dim(&self) -> usize {
        self.l0.weight.val().dims()[0]
    }

    /// Places a batch of feature rows on the map.
    ///
    /// `xs` has shape `[batch, input_dim]` and the result has shape
    /// `[batch, 2]`: one coordinate pair per input row, in the same order.
    /// To place a single entity, pass a batch of one.
    pub(crate) fn forward(&self, xs: Tensor<B, 2>) -> Tensor<B, 2> {
        let xs = self.activation.forward(self.l0.forward(xs));
        let xs = self.activation.forward(self.l1.forward(xs));
        self.l2.forward(xs)
    }

    /// Rescales the output layer so the encoder emits `y * scale + center`.
    ///
    /// Training standardizes the target coordinates; folding the inverse
    /// transform into the final linear layer afterwards means consumers get
    /// layout units without an extra step: `(W x + b) * s + c` equals
    /// `(s * W) x + (b * s + c)`. [`Projector::unfold_output`] with the same
    /// parameters is the exact inverse up to floating-point rounding.
    pub(crate) fn fold_output(self, center: [f32; 2], scale: [f32; 2], device: &B::Device) -> Self {
        self.transform_output(scale, center, device, false)
    }

    /// Undoes [`Projector::fold_output`], restoring standardized outputs.
    ///
    /// This is how a persisted encoder (which emits layout units) becomes a
    /// warm start for training, which happens in standardized space again.
    pub(crate) fn unfold_output(
        self,
        center: [f32; 2],
        scale: [f32; 2],
        device: &B::Device,
    ) -> Self {
        self.transform_output(scale, center, device, true)
    }

    fn transform_output(
        mut self,
        scale: [f32; 2],
        center: [f32; 2],
        device: &B::Device,
        invert: bool,
    ) -> Self {
        let scale = Tensor::<B, 1>::from_floats(scale, device);
        let center = Tensor::<B, 1>::from_floats(center, device);

        let weight = self.l2.weight.val();
        let bias = self
            .l2
            .bias
            .as_ref()
            .map_or_else(|| Tensor::zeros([OUTPUT_DIM], device), Param::val);

        let (weight, bias) = if invert {
            (
                weight / scale.clone().unsqueeze::<2>(),
                (bias - center) / scale,
            )
        } else {
            (
                weight * scale.clone().unsqueeze::<2>(),
                bias * scale + center,
            )
        };

        self.l2.weight = Param::from_tensor(weight);
        self.l2.bias = Some(Param::from_tensor(bias));
        self
    }
}

/// The result of distilling one layout level into an encoder.
pub struct FittedProjector<B: Backend> {
    /// The trained encoder with de-standardization folded in; its outputs
    /// are raw layout units.
    pub encoder: Projector<B>,
    /// The trained encoder in standardized output space; the next ladder
    /// rung fine-tunes from these weights.
    pub standardized: Projector<B>,
    /// The best validation RMSE observed during training, in layout units.
    pub validation_rmse: f64,
    /// The per-axis layout mean removed from the targets during training.
    pub center: [f32; 2],
    /// The per-axis layout standard deviation (clamped to at least `1e-6`)
    /// divided out of the targets during training.
    pub scale: [f32; 2],
}
