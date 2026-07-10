use std::path::Path;

use burn::{
    data::{
        dataloader::{DataLoaderBuilder, batcher::Batcher},
        dataset::Dataset,
    },
    lr_scheduler::cosine::CosineAnnealingLrSchedulerConfig,
    module::Module,
    nn::{
        Gelu, Linear, LinearConfig,
        loss::{MseLoss, Reduction},
    },
    optim::AdamConfig,
    tensor::{
        Tensor, TensorData,
        backend::{AutodiffBackend, Backend},
    },
    train::{
        ExecutionStrategy, InferenceStep, Learner, MetricEarlyStoppingStrategy, RegressionOutput,
        StoppingCondition, SupervisedTraining, TrainOutput, TrainStep, TrainingStrategy,
        metric::{
            LossMetric,
            store::{Aggregate, Direction, Split},
        },
    },
};
use rand::{SeedableRng as _, seq::SliceRandom as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use crate::float::{FloatBytes, Sample};

/// Width of the projected output: entities are placed on a 2D map.
const OUTPUT_DIM: usize = 2;

/// Hyperparameters for [`Projector::fit`].
///
/// Every field has a default, so a training run only needs
/// `TrainingConfig { .. }`; name individual fields to override them, for
/// example `TrainingConfig { epochs: 100, .. }`.
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct TrainingConfig {
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
    /// Must be in `[0, learning_rate]`.
    pub learning_rate_min: f64 = 1e-4,
    /// Fraction of rows held out as the validation split.
    ///
    /// The held-out rows drive early stopping and never influence the
    /// weights. The row count rounds down.
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

/// A single training example: one entity's embedding and its target map
/// coordinates.
#[derive(Debug, Clone)]
pub(crate) struct ProjectionItem {
    /// The entity's embedding, [`FloatBytes::dim`] values wide.
    pub embedding: Sample,
    /// The map coordinates the encoder learns to reproduce.
    pub position: [f32; OUTPUT_DIM],
}

/// A collated batch of examples on the training device.
#[derive(Debug, Clone)]
pub(crate) struct ProjectionBatch<B: Backend> {
    /// Embeddings, shape `[batch, input_dim]`.
    pub embeddings: Tensor<B, 2>,
    /// Target map coordinates, shape `[batch, 2]`.
    pub positions: Tensor<B, 2>,
}

/// The examples of one split (training or validation), selected by row index
/// from the shared embedding and coordinate matrices.
///
/// Rows are read on demand, one example per [`Dataset::get`] call, so only
/// the rows a dataloader actually requests are paged in.
struct ProjectionDataset {
    xs: FloatBytes,
    ys: FloatBytes,

    input_dim: usize,
    indices: Vec<usize>,
}

impl Dataset<ProjectionItem> for ProjectionDataset {
    fn get(&self, index: usize) -> Option<ProjectionItem> {
        let &row = self.indices.get(index)?;

        let embedding = self.xs.sample(row);
        let position = *self
            .ys
            .sample(row)
            .as_array::<2>()
            .unwrap_or_else(|| unreachable!("slice is `OUTPUT_DIM` long by construction"));

        Some(ProjectionItem {
            embedding,
            position,
        })
    }

    fn len(&self) -> usize {
        self.indices.len()
    }
}

/// Collates [`ProjectionItem`]s into one [`ProjectionBatch`] on the device.
#[derive(Debug, Clone, Default)]
struct ProjectionBatcher;

impl<B: Backend> Batcher<B, ProjectionItem, ProjectionBatch<B>> for ProjectionBatcher {
    fn batch(&self, items: Vec<ProjectionItem>, device: &B::Device) -> ProjectionBatch<B> {
        let input_dim = items.first().map_or(0, |item| item.embedding.len());

        let mut embeddings = Vec::with_capacity(items.len() * input_dim);
        let mut positions = Vec::with_capacity(items.len() * OUTPUT_DIM);
        for item in &items {
            embeddings.extend_from_slice(&item.embedding);
            positions.extend_from_slice(&item.position);
        }

        ProjectionBatch {
            embeddings: Tensor::from_data(
                TensorData::new(embeddings, [items.len(), input_dim]),
                device,
            ),
            positions: Tensor::from_data(
                TensorData::new(positions, [items.len(), OUTPUT_DIM]),
                device,
            ),
        }
    }
}

/// An encoder that places entity embeddings on a fitted 2D map.
///
/// A projector is distilled from one level of a fitted layout:
/// [`Projector::fit`] trains it to reproduce the layout's coordinates from
/// the entities' embeddings, after which [`Projector::forward`] places any
/// embedding, including ones the layout was never fitted on, at the position
/// the layout would have assigned.
///
/// The encoder is a three-layer perceptron (`input_dim -> 512 -> 512 -> 2`)
/// with GELU activations. The architecture is part of the encoder's exchange
/// format: consumers of exported weights must apply the same activation, and
/// [`Gelu`] is the exact erf-based form, not the tanh approximation.
#[derive(Module, Debug)]
pub(crate) struct Projector<B: Backend> {
    l0: Linear<B>,
    l1: Linear<B>,
    l2: Linear<B>,
    activation: Gelu,
}

impl<B: Backend> Projector<B> {
    /// Creates an untrained projector for embeddings `input_dim` values wide.
    ///
    /// Weights are randomly initialized on `device`; train them with
    /// [`Projector::fit`].
    pub(crate) fn new(input_dim: usize, device: &B::Device) -> Self {
        Self {
            l0: LinearConfig::new(input_dim, 512).init(device),
            l1: LinearConfig::new(512, 512).init(device),
            l2: LinearConfig::new(512, OUTPUT_DIM).init(device),
            activation: Gelu::new(),
        }
    }

    /// Places a batch of embeddings on the map.
    ///
    /// `xs` has shape `[batch, input_dim]` and the result has shape
    /// `[batch, 2]`: one coordinate pair per input row, in the same order.
    /// To place a single entity, pass a batch of one.
    pub(crate) fn forward(&self, xs: Tensor<B, 2>) -> Tensor<B, 2> {
        let xs = self.activation.forward(self.l0.forward(xs));
        let xs = self.activation.forward(self.l1.forward(xs));
        self.l2.forward(xs)
    }

    /// Runs the forward pass shared by training and validation steps and
    /// packages predictions, targets, and MSE loss for burn's metrics.
    fn forward_step(&self, batch: ProjectionBatch<B>) -> RegressionOutput<B> {
        let output = self.forward(batch.embeddings);
        let loss = MseLoss.forward(output.clone(), batch.positions.clone(), Reduction::Mean);

        RegressionOutput::new(loss, output, batch.positions)
    }
}

impl<B: AutodiffBackend> TrainStep for Projector<B> {
    type Input = ProjectionBatch<B>;
    type Output = RegressionOutput<B>;

    fn step(&self, item: Self::Input) -> TrainOutput<Self::Output> {
        let output = self.forward_step(item);
        TrainOutput::new(self, output.loss.backward(), output)
    }
}

impl<B: Backend> InferenceStep for Projector<B> {
    type Input = ProjectionBatch<B>;
    type Output = RegressionOutput<B>;

    fn step(&self, item: Self::Input) -> Self::Output {
        self.forward_step(item)
    }
}

impl<B: AutodiffBackend> Projector<B> {
    /// Trains the encoder to reproduce a fitted layout.
    ///
    /// Row `i` of `xs` is the embedding of the entity whose map coordinates
    /// are row `i` of `ys`. A shuffle seeded by `config.seed` holds out
    /// [`TrainingConfig::validation_fraction`] of the rows as the validation
    /// split; the remaining rows form the training split and are reshuffled
    /// every epoch.
    ///
    /// Training minimizes the mean squared error between projected and
    /// target coordinates with Adam, the learning rate following a cosine
    /// schedule from [`TrainingConfig::learning_rate`] down to
    /// [`TrainingConfig::learning_rate_min`]. Training runs for
    /// [`TrainingConfig::epochs`] epochs, or stops earlier once the
    /// validation loss has not improved for [`TrainingConfig::patience`]
    /// consecutive epochs.
    ///
    /// While training runs, a terminal dashboard shows per-epoch training
    /// and validation loss; `artifact_dir` receives the experiment log and
    /// the metric store behind the dashboard.
    ///
    /// The returned encoder holds the weights of the last trained epoch, on
    /// the inference (non-autodiff) backend. Note that with early stopping
    /// this trails the best validation epoch by up to
    /// [`TrainingConfig::patience`] epochs.
    ///
    /// # Panics
    ///
    /// Panics when `ys` is empty, when `ys` rows are not 2 values wide, when
    /// `xs` and `ys` disagree on the number of rows, when `config.epochs` is
    /// zero, or when the learning rates are invalid
    /// (`learning_rate` outside `(0, 1]` or `learning_rate_min` outside
    /// `[0, learning_rate]`).
    pub(crate) fn fit(
        self,
        xs: FloatBytes,
        ys: FloatBytes,
        config: TrainingConfig,
        artifact_dir: impl AsRef<Path>,
        device: &B::Device,
    ) -> Projector<B::InnerBackend> {
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(config.seed);

        assert!(!ys.is_empty(), "training data must not be empty");
        assert_eq!(
            ys.dim(),
            OUTPUT_DIM,
            "`ys` rows must be {OUTPUT_DIM}-wide map coordinates"
        );
        assert_eq!(
            xs.len(),
            ys.len(),
            "`xs` and `ys` must have the same number of rows"
        );

        let n = xs.len();
        let input_dim = xs.dim();

        B::seed(device, config.seed);

        // Split into training and validation sets: shuffle `0..n` once, then
        // carve the first `n * validation_fraction` indices off as the
        // validation set. (The per-epoch shuffling of training batches is
        // handled by the dataloader below.)
        #[expect(
            clippy::cast_precision_loss,
            clippy::cast_sign_loss,
            clippy::cast_possible_truncation
        )]
        let n_val = (n as f64 * config.validation_fraction) as usize;

        let mut permutation: Vec<usize> = (0..n).collect();
        permutation.shuffle(&mut rng);

        let indices_val = permutation.split_off(permutation.len() - n_val);
        let indices_train = permutation;

        let steps_per_epoch = indices_train.len().div_ceil(config.batch_size);

        let dataloader_train = DataLoaderBuilder::new(ProjectionBatcher)
            .batch_size(config.batch_size)
            .shuffle(config.seed)
            .num_workers(config.num_workers)
            .build(ProjectionDataset {
                xs: xs.clone(),
                ys: ys.clone(),
                input_dim,
                indices: indices_train,
            });
        let dataloader_valid = DataLoaderBuilder::new(ProjectionBatcher)
            .batch_size(config.batch_size)
            .num_workers(config.num_workers)
            .build(ProjectionDataset {
                xs,
                ys,
                input_dim,
                indices: indices_val,
            });

        let optimizer = AdamConfig::new().with_epsilon(1e-8).init();
        let schedule = CosineAnnealingLrSchedulerConfig::new(
            config.learning_rate,
            config.epochs * steps_per_epoch,
        )
        .with_min_lr(config.learning_rate_min)
        .init()
        .expect("learning-rate schedule configuration must be valid");

        SupervisedTraining::new(artifact_dir, dataloader_train, dataloader_valid)
            .num_epochs(config.epochs)
            .with_training_strategy(TrainingStrategy::Default(ExecutionStrategy::SingleDevice(
                device.clone(),
            )))
            .metric_train_numeric(LossMetric::new())
            .metric_valid_numeric(LossMetric::new())
            .early_stopping(MetricEarlyStoppingStrategy::new(
                &LossMetric::<B::InnerBackend>::new(),
                Aggregate::Mean,
                Direction::Lowest,
                Split::Valid,
                StoppingCondition::NoImprovementSince {
                    n_epochs: config.patience,
                },
            ))
            .summary()
            .launch(Learner::new(self, optimizer, schedule))
            .model
    }
}
