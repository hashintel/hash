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
/// at every step, so lens variation could teach the modulation head nothing but batch-sampling
/// noise. A zero condition instead leaves the head's condition weights with exactly zero gradient,
/// so every projected step of a forceless corpus is bit-identical - the flat ladder is a
/// certificate, not an accident.
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

/// Assembles one step's drawn populations at their step.
///
/// # Panics
///
/// This panics when relation draws happen before a scale-bearing tick. The boundary always runs
/// one, so a miss is a wiring defect.
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
