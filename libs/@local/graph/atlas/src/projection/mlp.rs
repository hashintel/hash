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
use rand::{SeedableRng as _, seq::SliceRandom};
use rand_xoshiro::Xoshiro256PlusPlus;

use crate::float::{FloatBytes, Sample};

/// Width of the projected output: entities are placed on a 2D map.
const OUTPUT_DIM: usize = 2;

#[derive(Debug, Copy, Clone)]
pub(crate) struct TrainingConfig {
    pub batch_size: usize = 8192,
    pub epochs: usize = 30,
    pub learning_rate: f64 = 1e-3,
    pub learning_rate_min: f64 = 1e-4,
    pub validation_fraction: f64 = 0.02,
    pub seed: u64 = 42,
    pub patience: usize = 5,
    pub num_workers: usize = 4,
}

/// One entity: its embedding and the map coordinates to distill.
#[derive(Debug, Clone)]
pub(crate) struct ProjectionItem {
    pub embedding: Sample,
    pub position: [f32; OUTPUT_DIM],
}

/// A batch of entities, ready for the model.
#[derive(Debug, Clone)]
pub(crate) struct ProjectionBatch<B: Backend> {
    /// Embeddings, shape `[batch, input_dim]`.
    pub embeddings: Tensor<B, 2>,
    /// Target map coordinates, shape `[batch, 2]`.
    pub positions: Tensor<B, 2>,
}

/// Row-major view over the sampled embeddings and layout coordinates,
/// restricted to the rows selected for one split. Rows are copied out lazily,
/// one item at a time, so `xs` can later be backed by something large and
/// read-only (e.g. a memmap) without materializing the whole split.
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

/// A small encoder distilled from a fitted 2D layout: maps entity embeddings
/// (`[batch, input_dim]`) to map coordinates (`[batch, 2]`).
#[derive(Module, Debug)]
pub(crate) struct Projector<B: Backend> {
    l0: Linear<B>,
    l1: Linear<B>,
    l2: Linear<B>,
    activation: Gelu,
}

impl<B: Backend> Projector<B> {
    pub(crate) fn new(input_dim: usize, device: &B::Device) -> Self {
        Self {
            l0: LinearConfig::new(input_dim, 512).init(device),
            l1: LinearConfig::new(512, 512).init(device),
            l2: LinearConfig::new(512, OUTPUT_DIM).init(device),
            activation: Gelu::new(),
        }
    }

    pub(crate) fn forward(&self, xs: Tensor<B, 2>) -> Tensor<B, 2> {
        let xs = self.activation.forward(self.l0.forward(xs));
        let xs = self.activation.forward(self.l1.forward(xs));
        self.l2.forward(xs)
    }

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
    /// Distills the layout into this encoder.
    ///
    /// `xs` are the input embeddings and `ys` the target map coordinates:
    /// row `i` of `xs` is the embedding of the entity whose coordinates are
    /// row `i` of `ys`, so both must have the same number of rows and `ys`
    /// must be 2 wide.
    ///
    /// The rows are split into training and validation sets (seeded by
    /// `config.seed`), and the model is trained with MSE loss, Adam, and a
    /// cosine-annealed learning rate, stopping early once the validation
    /// loss has not improved for `config.patience` epochs.
    ///
    /// `artifact_dir` receives the training logs and metric store backing
    /// the dashboard rendered while training runs.
    ///
    /// Consumes the model and returns the fitted one on the inference
    /// (non-autodiff) backend.
    ///
    /// # Panics
    ///
    /// Panics if `xs`/`ys` are empty or have inconsistent row counts, or if
    /// the learning-rate range in `config` is invalid (e.g. not in `(0, 1]`).
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
