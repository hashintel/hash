//! Benchmark hooks over the projector model.
//!
//! The training backend decision (train time is the binding constraint) and the refresh-cost risk
//! (one full-corpus forward per ladder step per cadence tick) both price out through two numbers:
//! forward wall time at inference batches, and forward-plus-backward wall time at training
//! minibatches, each at the real architecture. This module gives the bench target (an external
//! crate) those levers over the production [`Projector`] - never a mirror - while the model types
//! stay private.
//!
//! This module synthesizes batches at the corpus shape the trainer feeds: unit-norm 512-wide
//! representations, mixed roles, a width-1 `[eta]` condition. The backward pass drives a
//! mean-coordinate loss; gradient values are meaningless, but the traversal is the full autodiff
//! graph the composite objective shares, so its wall time is the decision's number.

use burn::{
    DispatchDevice,
    prelude::Backend,
    tensor::{Int, Tensor, TensorData},
};
use rand::{Rng, RngExt as _, SeedableRng};

use super::model::{Architecture, NodeRole, Projector, ProjectorInput};
use crate::device::{Inference, PinnedDevice, Training};

pub mod live;

#[cfg(test)]
mod tests;

/// The default architecture every measurement runs at.
const ARCHITECTURE: Architecture = Architecture::default();

/// One synthesized batch at the trainer's input shape.
///
/// Holds the raw columns; tensors materialize per run so device transfer and graph construction
/// stay inside the timed region, exactly as they recur per training step.
pub struct Batch {
    rows: usize,
    representation: Vec<f32>,
    roles: Vec<i64>,
    condition: Vec<f32>,
}

impl Batch {
    /// Synthesizes a batch of `rows` unit-norm representations.
    ///
    /// Representations are random unit vectors (the prepared node matrix's contract), roles cycle
    /// over the vocabulary, and the condition is the relation-lens column, alternating the
    /// ladder's pinned extremes so `FiLM` sees both.
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "the role and condition columns cycle by row position"
    )]
    #[must_use]
    pub fn new<R>(rows: usize, seed: u64) -> Self
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
            // A 512-dimensional uniform draw is never the zero vector in practice. The guard keeps
            // the normalization total.
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

        Self {
            rows,
            representation,
            roles,
            condition,
        }
    }

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

/// The plain and autodiff-decorated models of one backend.
///
/// The benches measure every flavor in the f32 configuration.
pub struct Model {
    projector: Projector<Inference>,
    trained: Projector<Training>,
    device: DispatchDevice,
}

impl Model {
    #[must_use]
    pub fn build<R>(device: PinnedDevice, seed: u64) -> Self
    where
        R: Rng + SeedableRng,
    {
        let device = device.resolve();

        Self {
            projector: Projector::new(ARCHITECTURE, &device, R::seed_from_u64(seed)),
            trained: Projector::new(ARCHITECTURE, &device, R::seed_from_u64(seed)),
            device,
        }
    }

    pub fn forward(&self, batch: &Batch) -> f32 {
        let output = self
            .projector
            .forward(batch.input::<Inference>(&self.device));
        output.sum().into_scalar()
    }

    /// Run a forward-backward pass on the model, returning the loss value.
    ///
    /// # Panics
    ///
    /// If the device fails to complete its queue.
    pub fn forward_backward(&self, batch: &Batch) -> f32 {
        let output = self.trained.forward(batch.input::<Training>(&self.device));
        let loss = output.mean();
        let value = loss.clone().into_scalar();
        let gradients = loss.backward();
        drop(gradients);

        Inference::sync(&self.device).expect("the measured device should complete its queue");
        value
    }
}
