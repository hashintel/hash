//! One step's step selection and batch assembly.

use hashql_core::id::Id;

use super::super::super::{
    STEPS,
    batch::{Batch, Populations},
};
use crate::salt::projector::scale::LocalScales;

/// Selects a step's index.
///
/// Zero through the opening segment, round-robin across [`STEPS`] once the ladder opens.
///
/// A vacuous run pins the zero step throughout. With no relation force the objective is identical
/// at every lens step, and lens variation could teach the modulation head nothing but
/// batch-sampling noise. A zero condition instead leaves the head's condition weights with exactly
/// zero gradient. The trainer's Adam applies no weight decay, and a parameter with zero gradient
/// and zero moments does not move under it while the optimizer arithmetic is finite and preserves
/// the zero. That Adam narrows its step count to `i32` for the bias corrections, and the argument
/// therefore covers step counts below `2³¹`. The head's bias receives gradient and can train
/// between optimizer updates, and every condition shares it. From the standard initialization (a
/// zero `FiLM` map and bias, fresh moments) a forceless run therefore projects, at any one model
/// state, the same map from representation to coordinate at every lens step, and the flat ladder
/// is a certificate rather than an accident. Bit identity between the projected lens steps holds
/// within one deterministic execution of one batch shape, as the projector's introduction states.
/// A supplied model with nonzero condition weights, or a resumed optimizer with nonzero moments, is
/// outside that argument.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the step round-robin is an index modulus"
)]
pub(super) const fn step(step_index: usize, boundary: usize, vacuous: bool) -> usize {
    if vacuous || step_index < boundary {
        0
    } else {
        (step_index - boundary) % STEPS.len()
    }
}

/// Assembles one step's drawn populations at their lens step.
///
/// # Panics
///
/// This panics when relation draws happen before a scale-bearing tick. The boundary always runs
/// one, and a miss is therefore a wiring defect.
pub(super) fn assemble_batch<N, E>(
    populations: Populations<'_, N, E>,
    step_index: usize,
    scales: Option<&[LocalScales<N>; STEPS.len()]>,
) -> Batch<N>
where
    N: Id,
    E: Id,
{
    let batch_scales = if populations.relation.is_empty() {
        None
    } else {
        let scales = scales.unwrap_or_else(|| {
            unreachable!("relation draws happen only after a scale-bearing tick")
        });
        Some(&scales[step_index])
    };

    Batch::assemble(populations, batch_scales)
}
