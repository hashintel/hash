//! One step's rung selection and batch assembly.

use hashql_core::id::Id;

use super::super::super::{
    RUNGS,
    batch::{Batch, Populations},
};
use crate::salt::projector::scale::LocalScales;

/// Selects a step's rung index.
///
/// Zero through the opening segment, round-robin across [`RUNGS`] once the ladder opens.
///
/// A vacuous run pins the zero rung throughout. With no relation force the objective is identical
/// at every rung, so lens variation could teach the modulation head nothing but batch-sampling
/// noise. A zero condition instead leaves the head's condition weights with exactly zero gradient,
/// so every projected rung of a forceless corpus is bit-identical - the flat ladder is a
/// certificate, not an accident.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the rung round-robin is a step-count modulus"
)]
pub(super) const fn rung(step_index: usize, boundary: usize, vacuous: bool) -> usize {
    if vacuous || step_index < boundary {
        0
    } else {
        (step_index - boundary) % RUNGS.len()
    }
}

/// Assembles one step's drawn populations at their rung.
///
/// # Panics
///
/// This panics when relation draws happen before a scale-bearing tick. The boundary always runs
/// one, so a miss is a wiring defect.
pub(super) fn assemble_batch<N, E>(
    populations: Populations<'_, N, E>,
    rung_index: usize,
    scales: Option<&[LocalScales<N>; RUNGS.len()]>,
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
        Some(&scales[rung_index])
    };

    Batch::assemble(populations, batch_scales)
}
