//! Benchmark seams over the projector model.
//!
//! The training backend decision (train time is the binding
//! constraint) and the refresh-cost risk (one full-corpus forward per
//! ladder rung per cadence tick) both price out through two numbers:
//! forward wall time at inference batches, and forward-plus-backward
//! wall time at training minibatches, each at the real architecture.
//! This module gives the bench target (an external crate) those levers
//! over the production [`Projector`] - never a mirror - while the model
//! types stay private.
//!
//! Batches are synthesized at the corpus shape the trainer feeds:
//! unit-norm 512-wide representations, mixed roles, a width-1 `[eta]`
//! condition. The backward pass drives a mean-coordinate loss;
//! gradient VALUES are meaningless, but the traversal is the full
//! autodiff graph the composite objective shares, so its wall time is
//! the decision's number.

use burn::{
    backend::{Autodiff, NdArray, ndarray::NdArrayDevice},
    prelude::Backend,
    tensor::{Int, Tensor, TensorData},
};
use rand::{Rng, RngExt as _, SeedableRng};

use super::model::{Architecture, NodeRole, Projector, ProjectorInput};

#[cfg(test)]
mod tests;

/// The default architecture every measurement runs at.
const ARCHITECTURE: Architecture = Architecture { .. };

/// The CPU backend under measurement.
type Cpu = NdArray;

/// The GPU backend under measurement: burn's `CubeCL` `wgpu` runtime
/// compiling to MSL, with fusion enabled - the configuration a GPU
/// deployment would run.
#[cfg(feature = "bench-gpu")]
type Gpu = burn::backend::Metal;

/// One synthesized batch at the trainer's input shape.
///
/// Holds the raw columns; tensors materialize per run so device
/// transfer and graph construction stay inside the timed region,
/// exactly as they recur per training step.
pub struct Batch {
    rows: usize,
    representation: Vec<f32>,
    roles: Vec<i64>,
    condition: Vec<f32>,
}

/// The backend flavor a [`Model`] runs on.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum BackendKind {
    /// The CPU backend, burn's ndarray.
    Cpu,
    /// The Metal GPU backend, available behind the `bench-gpu`
    /// feature.
    #[cfg(feature = "bench-gpu")]
    Metal,
}

impl BackendKind {
    /// Every flavor this build can run.
    pub const ALL: &[Self] = &[
        Self::Cpu,
        #[cfg(feature = "bench-gpu")]
        Self::Metal,
    ];

    /// Returns the flavor's benchmark label.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Cpu => "cpu",
            #[cfg(feature = "bench-gpu")]
            Self::Metal => "metal",
        }
    }
}

/// A [`Projector`] pair at the default architecture on one backend.
///
/// Holds the plain model for inference forwards and the
/// autodiff-decorated model for training steps, built from equal
/// seeds: the same function, differing only in bookkeeping. The
/// backend stays an internal choice, selected by [`BackendKind`].
pub struct Model(Flavor);

// Boxed for variant-size parity: a CPU pair holds its parameters
// inline (megabytes), a GPU pair holds device handles.
enum Flavor {
    Cpu(Box<Pair<Cpu>>),
    #[cfg(feature = "bench-gpu")]
    Metal(Box<Pair<Gpu>>),
}

/// The plain and autodiff-decorated models of one backend, in the
/// f32 configuration every flavor is measured at.
struct Pair<B: Backend<FloatElem = f32>> {
    projector: Projector<B>,
    trained: Projector<Autodiff<B>>,
    device: B::Device,
}

/// Synthesizes a batch of `rows` unit-norm representations.
///
/// Representations are random unit vectors (the prepared node matrix's
/// contract), roles cycle over the vocabulary, and the condition is
/// the relation-lens column, alternating the ladder's pinned extremes
/// so `FiLM` sees both.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the role and condition columns cycle by row position"
)]
#[must_use]
pub fn batch<R>(rows: usize, seed: u64) -> Batch
where
    R: Rng + SeedableRng,
{
    let mut rng = R::seed_from_u64(seed);
    let dimensions = ARCHITECTURE.representation_dimensions.get();

    let mut representation = Vec::with_capacity(rows * dimensions);
    for _ in 0..rows {
        let start = representation.len();
        let mut norm_squared = 0.0_f32;
        for _ in 0..dimensions {
            let component = rng.random_range(-1.0_f32..=1.0);
            norm_squared = component.mul_add(component, norm_squared);
            representation.push(component);
        }
        // A 512-dimensional uniform draw is never the zero vector in
        // practice; the guard keeps the normalization total.
        let scale = if norm_squared > 0.0 {
            norm_squared.sqrt().recip()
        } else {
            1.0
        };
        for component in &mut representation[start..] {
            *component *= scale;
        }
    }

    #[expect(
        clippy::cast_possible_wrap,
        reason = "the role vocabulary holds three variants, far inside every integer type"
    )]
    let roles = (0..rows)
        .map(|row| (row % NodeRole::COUNT) as i64)
        .collect();
    let condition = (0..rows)
        .map(|row| if row % 2 == 0 { 0.0 } else { 1.0 })
        .collect();

    Batch {
        rows,
        representation,
        roles,
        condition,
    }
}

impl Model {
    /// Builds the default architecture on the chosen backend.
    ///
    /// The plain and decorated models are built from equal seeds, so
    /// every flavor computes the same function.
    #[must_use]
    pub fn build<R>(kind: BackendKind, seed: u64) -> Self
    where
        R: Rng + SeedableRng,
    {
        match kind {
            BackendKind::Cpu => Self(Flavor::Cpu(Box::new(Pair::build::<R>(
                NdArrayDevice::default(),
                seed,
            )))),
            #[cfg(feature = "bench-gpu")]
            BackendKind::Metal => Self(Flavor::Metal(Box::new(Pair::build::<R>(
                burn::backend::wgpu::WgpuDevice::default(),
                seed,
            )))),
        }
    }

    /// Runs one inference forward pass, returning the coordinate sum.
    ///
    /// The scalar readback forces the whole output to materialize and
    /// blocks on the device, so asynchronous backends cannot defer
    /// work past the timed region.
    #[must_use]
    pub fn forward(&self, batch: &Batch) -> f32 {
        match &self.0 {
            Flavor::Cpu(pair) => pair.forward(batch),
            #[cfg(feature = "bench-gpu")]
            Flavor::Metal(pair) => pair.forward(batch),
        }
    }

    /// Runs one training step's tensor work: forward, loss, backward.
    ///
    /// The loss is the coordinate mean - the cheapest scalar that pulls
    /// gradients through every parameter - and a device sync after the
    /// backward fences the traversal inside the timed region.
    #[must_use]
    pub fn forward_backward(&self, batch: &Batch) -> f32 {
        match &self.0 {
            Flavor::Cpu(pair) => pair.forward_backward(batch),
            #[cfg(feature = "bench-gpu")]
            Flavor::Metal(pair) => pair.forward_backward(batch),
        }
    }
}

impl<B: Backend<FloatElem = f32>> Pair<B> {
    fn build<R>(device: B::Device, seed: u64) -> Self
    where
        R: Rng + SeedableRng,
    {
        Self {
            projector: Projector::new(ARCHITECTURE, R::seed_from_u64(seed), &device),
            trained: Projector::new(ARCHITECTURE, R::seed_from_u64(seed), &device),
            device,
        }
    }

    fn forward(&self, batch: &Batch) -> f32 {
        let output = self.projector.forward(batch.input::<B>(&self.device));
        output.sum().into_scalar()
    }

    fn forward_backward(&self, batch: &Batch) -> f32 {
        let output = self
            .trained
            .forward(batch.input::<Autodiff<B>>(&self.device));
        let loss = output.mean();
        let value = loss.clone().into_scalar();
        let gradients = loss.backward();
        drop(gradients);
        B::sync(&self.device).expect("the measured device should complete its queue");
        value
    }
}

impl Batch {
    /// Returns the batch's row count.
    #[inline]
    #[must_use]
    pub const fn rows(&self) -> usize {
        self.rows
    }

    /// Materializes the batch as tensors on `device`.
    fn input<B: Backend>(&self, device: &B::Device) -> ProjectorInput<B> {
        let dimensions = ARCHITECTURE.representation_dimensions.get();
        ProjectorInput {
            representation: Tensor::from_data(
                TensorData::new(self.representation.clone(), [self.rows, dimensions]),
                device,
            ),
            roles: Tensor::<B, 1, Int>::from_data(
                TensorData::new(self.roles.clone(), [self.rows]),
                device,
            ),
            condition: Tensor::from_data(
                TensorData::new(self.condition.clone(), [self.rows, 1]),
                device,
            ),
        }
    }
}
