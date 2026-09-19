#![expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the row width is recovered as an exact integer quotient"
)]

use rand_xoshiro::Xoshiro256PlusPlus;

use super::{Batch, Model};
use crate::device::Device;

/// A synthetic batch of `rows` rows from the fixed seed 7.
fn batch(rows: usize) -> Batch {
    Batch::new::<Xoshiro256PlusPlus>(rows, 7)
}

#[test]
fn batches_are_unit_norm_and_deterministic() {
    let one = batch(8);
    let two = batch(8);
    assert_eq!(one.representation, two.representation);
    assert_eq!(one.rows(), 8);

    let dimensions = one.representation.len() / one.rows();
    for row in one.representation.chunks_exact(dimensions) {
        let norm_squared: f32 = row.iter().map(|component| component * component).sum();
        assert!(
            (norm_squared - 1.0).abs() < 1e-5,
            "row norm should be 1, got {norm_squared}"
        );
    }
}

/// Compares the bench model's forward `sum / count` with its forward-backward mean.
///
/// Both are finite and agree as `sum / count` within `1e-4`.
///
/// The count is the output's element count: 16 rows of planar coordinates give 32.
#[test]
fn autodiff_numerical_stability() {
    let model = Model::build::<Xoshiro256PlusPlus>(Device::Cpu.pin(0), 42);
    let batch = batch(16);

    let inference = model.forward(&batch);
    assert!(inference.is_finite());

    let mean = model.forward_backward(&batch);
    assert!(mean.is_finite());
    assert!(
        (inference / 32.0 - mean).abs() < 1e-4,
        "sum/count {inference}/32 should match mean {mean}"
    );
}

/// Runs the live fixture's four phases to finite numbers.
///
/// The fixture draws, assembles, and runs the input, forward, objective and step phases.
///
/// A small corpus keeps the smoke test fast. The phases are the ones the bench target times, apart
/// from `refresh`, and a fixture defect in them therefore fails here instead of in a wall-time run.
#[test]
fn live_fixture_steps_every_phase() {
    let fixture = super::live::Fixture::build(256, 11);
    assert_eq!(fixture.rows(), 256);

    let sampler = fixture.sampler();
    let batch = fixture.assemble(sampler.draw(17));
    assert!(batch.rows() > 0, "the ratified plan draws participants");

    let mut stepper = super::live::Stepper::build(&fixture, Device::Cpu.pin(0), 42);
    stepper.input(&batch);
    assert!(stepper.forward(&batch).is_finite());
    assert!(stepper.objective(&batch).is_finite());

    let first = stepper.step(&batch);
    let second = stepper.step(&batch);
    assert!(first.is_finite() && second.is_finite());
    #[expect(
        clippy::float_cmp,
        reason = "exact inequality is the point: the optimizer moved the parameters"
    )]
    {
        assert_ne!(first, second, "the optimizer moved the parameters");
    }
}
