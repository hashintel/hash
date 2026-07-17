//! Projector training on burn's supervised `Learner`.

use std::path::Path;

use burn::{
    data::dataloader::DataLoaderBuilder,
    lr_scheduler::cosine::CosineAnnealingLrSchedulerConfig,
    module::Module as _,
    nn::loss::{MseLoss, Reduction},
    optim::AdamConfig,
    record::{FullPrecisionSettings, NamedMpkFileRecorder},
    tensor::backend::{AutodiffBackend, Backend},
    train::{
        ExecutionStrategy, InferenceStep, Learner, LearnerSummary, MetricEarlyStoppingStrategy,
        RegressionOutput, StoppingCondition, SupervisedTraining, TrainOutput, TrainStep,
        TrainingStrategy,
        metric::{
            LossMetric,
            store::{Aggregate, Direction, Split},
        },
    },
};
use rand::{SeedableRng as _, seq::SliceRandom as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    FittedProjector, OUTPUT_DIM, ProjectionBatch, ProjectionBatcher, Projector, ProjectorError,
    TrainingConfig, data::ProjectionDataset,
};
use crate::float::FloatBytes;

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

impl<B: Backend> Projector<B> {
    /// Runs the forward pass shared by training and validation steps and
    /// packages predictions, targets, and MSE loss for burn's metrics.
    fn forward_step(&self, batch: ProjectionBatch<B>) -> RegressionOutput<B> {
        let output = self.forward(batch.embeddings);
        let loss = MseLoss.forward(output.clone(), batch.positions.clone(), Reduction::Mean);

        RegressionOutput::new(loss, output, batch.positions)
    }
}

/// The per-axis standardization parameters of one layout.
struct Standardization {
    center: [f32; OUTPUT_DIM],
    scale: [f32; OUTPUT_DIM],
}

/// Computes each axis's mean and population standard deviation, validating
/// that every coordinate is finite.
///
/// The scale is clamped to at least `1e-6` so degenerate axes cannot divide
/// by zero, matching the prototype's behavior.
#[expect(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    reason = "row counts fit f64 exactly and the standardization is stored in f32 by design"
)]
fn standardization(ys: &FloatBytes) -> Result<Standardization, ProjectorError> {
    let rows = ys.len();
    let mut sums = [0.0_f64; OUTPUT_DIM];
    let mut squared_sums = [0.0_f64; OUTPUT_DIM];

    for row in 0..rows {
        for (axis, &value) in ys.row(row).iter().enumerate() {
            if !value.is_finite() {
                return Err(ProjectorError::NonFiniteCoordinate { row, axis, value });
            }

            sums[axis] += f64::from(value);
            squared_sums[axis] += f64::from(value) * f64::from(value);
        }
    }

    let inverse_rows = 1.0 / rows as f64;
    let center = core::array::from_fn(|axis| (sums[axis] * inverse_rows) as f32);
    let scale = core::array::from_fn(|axis| {
        let mean = sums[axis] * inverse_rows;
        let variance = (squared_sums[axis] * inverse_rows - mean * mean).max(0.0);
        (variance.sqrt() as f32).max(1e-6)
    });

    Ok(Standardization { center, scale })
}

impl<B: AutodiffBackend> Projector<B> {
    /// Trains the encoder to reproduce a fitted layout.
    ///
    /// Row `i` of `xs` is the feature row of the entity whose map
    /// coordinates are row `i` of `ys`. Targets are standardized per axis
    /// (mean removed, standard deviation divided out) before training; the
    /// inverse transform is folded back into the returned encoder, so its
    /// outputs are raw layout units.
    ///
    /// A shuffle seeded by `config.seed` holds out
    /// [`TrainingConfig::validation_fraction`] of the rows as the validation
    /// split; the remaining rows form the training split and are reshuffled
    /// every epoch. Training minimizes the mean squared error with Adam, the
    /// learning rate following a cosine schedule from
    /// [`TrainingConfig::learning_rate`] down to
    /// [`TrainingConfig::learning_rate_min`]. Training runs for
    /// [`TrainingConfig::epochs`] epochs, or stops earlier once the
    /// validation loss has not improved for [`TrainingConfig::patience`]
    /// consecutive epochs.
    ///
    /// Every epoch is checkpointed under `artifact_dir`, and the epoch with
    /// the lowest validation loss is restored after training, so early
    /// stopping never returns a model from an arbitrarily later epoch. The
    /// reported [`FittedProjector::validation_rmse`] is that best epoch's
    /// RMSE converted to layout units.
    ///
    /// # Errors
    ///
    /// Returns an error when the configuration is invalid, when the inputs
    /// are empty, mismatched, or non-finite, or when the recorded metrics or
    /// best checkpoint cannot be read back.
    pub(crate) fn fit(
        self,
        xs: FloatBytes,
        ys: FloatBytes,
        config: TrainingConfig,
        artifact_dir: impl AsRef<Path>,
        device: &B::Device,
    ) -> Result<FittedProjector<B::InnerBackend>, ProjectorError> {
        let config = config.validate()?;
        let artifact_dir = artifact_dir.as_ref();
        let mut rng = Xoshiro256PlusPlus::seed_from_u64(config.seed);

        if ys.is_empty() {
            return Err(ProjectorError::EmptyTrainingData);
        }
        if ys.dim() != OUTPUT_DIM {
            return Err(ProjectorError::OutputDimension { actual: ys.dim() });
        }
        if xs.len() != ys.len() {
            return Err(ProjectorError::RowCount {
                features: xs.len(),
                coordinates: ys.len(),
            });
        }
        if xs.dim() != self.input_dim() {
            return Err(ProjectorError::InputDimension {
                expected: self.input_dim(),
                actual: xs.dim(),
            });
        }

        let n = xs.len();
        let standardization = standardization(&ys)?;

        B::seed(device, config.seed);

        // Split into training and validation sets: shuffle `0..n` once, then
        // carve the first `n * validation_fraction` indices off as the
        // validation set. (The per-epoch shuffling of training batches is
        // handled by the dataloader below.)
        #[expect(
            clippy::cast_precision_loss,
            clippy::cast_sign_loss,
            clippy::cast_possible_truncation,
            reason = "the validated fraction is within (0, 1), so the product fits usize"
        )]
        let n_val = (n as f64 * config.validation_fraction) as usize;
        if n_val == 0 || n_val >= n {
            return Err(ProjectorError::InvalidValidationSplit {
                rows: n,
                fraction: config.validation_fraction,
            });
        }

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
                center: standardization.center,
                scale: standardization.scale,
                indices: indices_train,
            });
        let dataloader_valid = DataLoaderBuilder::new(ProjectionBatcher)
            .batch_size(config.batch_size)
            .num_workers(config.num_workers)
            .build(ProjectionDataset {
                xs,
                ys,
                center: standardization.center,
                scale: standardization.scale,
                indices: indices_val,
            });

        let optimizer = AdamConfig::new().with_epsilon(1e-8).init();
        let schedule = CosineAnnealingLrSchedulerConfig::new(
            config.learning_rate,
            config.epochs * steps_per_epoch,
        )
        .with_min_lr(config.learning_rate_min)
        .init()
        .expect("learning-rate schedule inputs were validated above");

        let recorder = NamedMpkFileRecorder::<FullPrecisionSettings>::new();
        // Registering the file checkpointer activates the default
        // checkpointing strategy, which retains the epoch with the best
        // validation loss alongside the most recent ones.
        let result = SupervisedTraining::new(artifact_dir, dataloader_train, dataloader_valid)
            .num_epochs(config.epochs)
            .with_training_strategy(TrainingStrategy::Default(ExecutionStrategy::SingleDevice(
                device.clone(),
            )))
            .metric_train_numeric(LossMetric::new())
            .metric_valid_numeric(LossMetric::new())
            .with_file_checkpointer(recorder.clone())
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
            .launch(Learner::new(self, optimizer, schedule));

        let (best_epoch, best_loss) = best_validation_epoch(artifact_dir)?;

        // Early stopping leaves the model at the last trained epoch, which
        // trails the best validation epoch by up to `patience` epochs;
        // restore the best epoch's checkpoint instead.
        let model = result
            .model
            .load_file(
                artifact_dir
                    .join("checkpoint")
                    .join(format!("model-{best_epoch}")),
                &recorder,
                device,
            )
            .map_err(ProjectorError::Checkpoint)?;

        // The validation loss is the MSE over standardized coordinates;
        // multiplying its root by the mean per-axis scale converts it to
        // layout units, matching the prototype's report.
        let mean_scale =
            f64::from(standardization.scale[0]).midpoint(f64::from(standardization.scale[1]));
        let validation_rmse = best_loss.sqrt() * mean_scale;

        Ok(FittedProjector {
            encoder: model.clone().fold_output(
                standardization.center,
                standardization.scale,
                device,
            ),
            standardized: model,
            validation_rmse,
            center: standardization.center,
            scale: standardization.scale,
        })
    }
}

/// Finds the epoch with the lowest recorded validation loss.
///
/// Reads the metric logs burn wrote under `artifact_dir` during training.
fn best_validation_epoch(artifact_dir: &Path) -> Result<(usize, f64), ProjectorError> {
    let summary = LearnerSummary::new(artifact_dir, &["Loss"]).map_err(ProjectorError::Summary)?;
    summary
        .metrics
        .valid
        .iter()
        .find(|metric| metric.name == "Loss")
        .and_then(|metric| {
            metric
                .entries
                .iter()
                .min_by(|left, right| left.value.total_cmp(&right.value))
                .map(|entry| (entry.step, entry.value))
        })
        .ok_or_else(|| {
            ProjectorError::Summary("no validation loss entries were recorded".to_owned())
        })
}
