use core::time::Duration;
use std::time::Instant;

use burn::{
    lr_scheduler::{LrScheduler as _, cosine::CosineAnnealingLrSchedulerConfig},
    module::AutodiffModule as _,
    optim::{AdamConfig, GradientsParams, Optimizer as _},
    prelude::ToElement as _,
    tensor::{
        Tensor,
        backend::{AutodiffBackend, Backend},
    },
};

use super::{
    CoordinateGradientDiagnostics, ProjectorBatchFactory, ProjectorFitError, ProjectorLossConfig,
    ProjectorOptimizerConfig, ProjectorTrainingBatch, ProjectorTrainingError, training_step,
};
use crate::salt::{
    hash::{ContentHash, ContentHasher},
    projector::{ConditionedProjector, ProjectorConfig},
};

/// Aggregate coordinate-budget diagnostics for one optimization run.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ProjectorTrainingMetrics {
    pub steps: usize,
    pub node_updates: u64,
    pub wall_time: Duration,
    pub positive_clip_fraction: f64,
    pub total_clip_fraction: f64,
    pub mean_unclipped_relation_ratio: f64,
    pub mean_clipped_relation_ratio: f64,
}

/// Trained inference model and the numerical contract that produced it.
pub(crate) struct FittedConditionedProjector<B: Backend> {
    pub model: ConditionedProjector<B>,
    pub metrics: ProjectorTrainingMetrics,
    pub training_config_hash: ContentHash,
}

/// Runs a fixed-length deterministic Adam schedule over prepared batches.
///
/// The caller owns model initialization and must seed it before construction.
///
/// # Errors
///
/// This returns an error when optimizer configuration is invalid, a batch
/// fails its coordinate-gradient step, or the iterator length differs from the
/// pinned step count.
pub(crate) fn fit_conditioned_projector<B, Batches>(
    mut model: ConditionedProjector<B>,
    batches: Batches,
    loss_config: ProjectorLossConfig,
    optimizer_config: ProjectorOptimizerConfig,
    device: &B::Device,
) -> Result<FittedConditionedProjector<B::InnerBackend>, ProjectorTrainingError>
where
    B: AutodiffBackend,
    Batches: IntoIterator<Item = ProjectorTrainingBatch<B>>,
{
    let started = Instant::now();
    let optimizer_config = optimizer_config.validate()?;
    B::seed(device, optimizer_config.seed);
    let mut optimizer = AdamConfig::new().with_epsilon(1.0e-8).init();
    let mut scheduler = CosineAnnealingLrSchedulerConfig::new(
        optimizer_config.initial_learning_rate,
        optimizer_config.steps.get(),
    )
    .with_min_lr(optimizer_config.minimum_learning_rate)
    .init()
    .expect("validated optimizer schedule should initialize");
    let mut batches = batches.into_iter();
    let mut metrics = MetricAccumulator::default();
    for _ in 0..optimizer_config.steps.get() {
        let batch = batches
            .next()
            .ok_or_else(|| ProjectorTrainingError::TrainingBatchCount {
                expected: optimizer_config.steps.get(),
                actual: metrics.steps,
            })?;
        let step = training_step(&model, batch, loss_config)?;
        metrics.push(step.diagnostics);
        let gradients = GradientsParams::from_grads(step.surrogate.backward(), &model);
        model = optimizer.step(scheduler.step(), model, gradients);
    }
    if batches.next().is_some() {
        return Err(ProjectorTrainingError::TrainingBatchCount {
            expected: optimizer_config.steps.get(),
            actual: optimizer_config.steps.get() + 1,
        });
    }
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.projector-training.v1");
    hasher.update(loss_config.content_hash().as_bytes());
    hasher.update(optimizer_config.content_hash().as_bytes());
    hasher.update(model.config().content_hash().as_bytes());
    let metrics = metrics.finish(started.elapsed());
    trace_metrics(metrics);
    Ok(FittedConditionedProjector {
        model: model.valid(),
        metrics,
        training_config_hash: hasher.finish(),
    })
}

/// Initializes a seeded model and runs Adam over adaptive detached-field
/// batches.
///
/// The factory observes the current model before every step and controls
/// semantic, relation, ordinary-negative, hard-negative, and condition
/// sampling. Its evidence identity is folded into the fitted checkpoint's
/// training configuration hash.
///
/// # Errors
///
/// This returns an error when configuration, adaptive batch production, or a
/// coordinate-gradient step fails.
pub(crate) fn fit_conditioned_projector_adaptive<B, Factory>(
    architecture: ProjectorConfig,
    mut factory: Factory,
    loss_config: ProjectorLossConfig,
    optimizer_config: ProjectorOptimizerConfig,
    device: &B::Device,
) -> Result<FittedConditionedProjector<B::InnerBackend>, ProjectorFitError>
where
    B: AutodiffBackend,
    Factory: ProjectorBatchFactory<B>,
{
    let started = Instant::now();
    let optimizer_config = optimizer_config.validate()?;
    let minimum_steps = factory.minimum_steps();
    if optimizer_config.steps.get() < minimum_steps {
        return Err(ProjectorFitError::InsufficientTrainingSteps {
            steps: optimizer_config.steps.get(),
            conditions: minimum_steps,
        });
    }
    B::seed(device, optimizer_config.seed);
    let mut model = ConditionedProjector::<B>::new(architecture, device)
        .map_err(ProjectorTrainingError::from)?;
    let mut optimizer = AdamConfig::new().with_epsilon(1.0e-8).init();
    let mut scheduler = CosineAnnealingLrSchedulerConfig::new(
        optimizer_config.initial_learning_rate,
        optimizer_config.steps.get(),
    )
    .with_min_lr(optimizer_config.minimum_learning_rate)
    .init()
    .expect("validated optimizer schedule should initialize");
    let mut metrics = MetricAccumulator::default();
    let factory_hash = factory.content_hash();
    for step_index in 0..optimizer_config.steps.get() {
        let batch = factory.batch(step_index, &model, device)?;
        let step = training_step(&model, batch, loss_config)?;
        metrics.push(step.diagnostics);
        let gradients = GradientsParams::from_grads(step.surrogate.backward(), &model);
        model = optimizer.step(scheduler.step(), model, gradients);
    }
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.adaptive-projector-training.v1");
    hasher.update(loss_config.content_hash().as_bytes());
    hasher.update(optimizer_config.content_hash().as_bytes());
    hasher.update(architecture.content_hash().as_bytes());
    hasher.update(factory_hash.as_bytes());
    let metrics = metrics.finish(started.elapsed());
    trace_metrics(metrics);
    Ok(FittedConditionedProjector {
        model: model.valid(),
        metrics,
        training_config_hash: hasher.finish(),
    })
}

struct MetricAccumulator<B: Backend> {
    relation_active: Option<Tensor<B, 1>>,
    positive_clipped: Option<Tensor<B, 1>>,
    total_clipped: Option<Tensor<B, 1>>,
    unclipped_ratio: Option<Tensor<B, 1>>,
    clipped_ratio: Option<Tensor<B, 1>>,
    steps: usize,
    node_updates: u64,
}

impl<B: Backend> Default for MetricAccumulator<B> {
    fn default() -> Self {
        Self {
            relation_active: None,
            positive_clipped: None,
            total_clipped: None,
            unclipped_ratio: None,
            clipped_ratio: None,
            steps: 0,
            node_updates: 0,
        }
    }
}

impl<B: Backend> MetricAccumulator<B> {
    fn push(&mut self, diagnostics: CoordinateGradientDiagnostics<B>) {
        let rows = diagnostics.positive_factor.dims()[0];
        self.steps += 1;
        self.node_updates += u64::try_from(rows).expect("batch row count should fit u64");
        let baseline = diagnostics.semantic_baseline;
        let relation_active = diagnostics.relation_norm.clone().greater_elem(0.0).float();
        accumulate(&mut self.relation_active, relation_active.clone().sum());
        accumulate(
            &mut self.positive_clipped,
            (diagnostics.positive_factor.clone().lower_elem(1.0).float() * relation_active.clone())
                .sum(),
        );
        accumulate(
            &mut self.total_clipped,
            (diagnostics.total_factor.clone().lower_elem(1.0).float() * relation_active.clone())
                .sum(),
        );
        accumulate(
            &mut self.unclipped_ratio,
            (diagnostics.relation_norm.clone() / baseline.clone() * relation_active.clone()).sum(),
        );
        accumulate(
            &mut self.clipped_ratio,
            (diagnostics.relation_norm * diagnostics.positive_factor * diagnostics.total_factor
                / baseline
                * relation_active)
                .sum(),
        );
    }

    fn finish(self, wall_time: Duration) -> ProjectorTrainingMetrics {
        let relation_updates = scalar(self.relation_active);
        ProjectorTrainingMetrics {
            steps: self.steps,
            node_updates: self.node_updates,
            wall_time,
            positive_clip_fraction: normalized(self.positive_clipped, relation_updates),
            total_clip_fraction: normalized(self.total_clipped, relation_updates),
            mean_unclipped_relation_ratio: normalized(self.unclipped_ratio, relation_updates),
            mean_clipped_relation_ratio: normalized(self.clipped_ratio, relation_updates),
        }
    }
}

#[inline]
fn accumulate<B: Backend>(accumulator: &mut Option<Tensor<B, 1>>, value: Tensor<B, 1>) {
    *accumulator = Some(match accumulator.take() {
        Some(current) => current + value,
        None => value,
    });
}

fn scalar<B: Backend>(tensor: Option<Tensor<B, 1>>) -> f64 {
    tensor.map_or(0.0, |tensor| tensor.into_scalar().to_f64())
}

#[inline]
fn normalized<B: Backend>(tensor: Option<Tensor<B, 1>>, count: f64) -> f64 {
    if count == 0.0 {
        0.0
    } else {
        scalar(tensor) / count
    }
}

fn trace_metrics(metrics: ProjectorTrainingMetrics) {
    tracing::info!(
        target: "hash_graph_atlas::salt",
        steps = metrics.steps,
        node_updates = metrics.node_updates,
        duration_ms = metrics.wall_time.as_millis(),
        positive_clip_fraction = metrics.positive_clip_fraction,
        total_clip_fraction = metrics.total_clip_fraction,
        mean_unclipped_relation_ratio = metrics.mean_unclipped_relation_ratio,
        mean_clipped_relation_ratio = metrics.mean_clipped_relation_ratio,
        "conditioned projector training completed"
    );
}
