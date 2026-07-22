#![expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the row width is recovered as an exact integer quotient"
)]

use rand_xoshiro::Xoshiro256PlusPlus;

use super::{BackendKind, Batch, Model};

fn batch(rows: usize) -> Batch {
    super::batch::<Xoshiro256PlusPlus>(rows, 7)
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

/// Both models of one flavor agree.
///
/// The autodiff decoration wraps the same weights, so the training loss is the inference mean.
fn assert_flavors_agree(kind: BackendKind) {
    let model = Model::build::<Xoshiro256PlusPlus>(kind, 42);
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

#[test]
fn cpu_flavors_run_and_agree() {
    assert_flavors_agree(BackendKind::Cpu);
}

#[cfg(feature = "bench-gpu")]
#[test]
#[ignore = "requires an Apple GPU; run with --run-ignored all"]
fn metal_flavors_run_and_agree() {
    assert_flavors_agree(BackendKind::Metal);
}

/// The live fixture draws, assembles, and steps every phase to finite numbers.
///
/// A small corpus keeps the smoke fast; the phases exercised are exactly the ones the bench
/// target times, so a fixture defect fails here instead of in a wall-time run.
#[test]
fn live_fixture_steps_every_phase() {
    let fixture = super::live::Fixture::build(256, 11);
    assert_eq!(fixture.rows(), 256);

    let sampler = fixture.sampler();
    let batch = fixture.assemble(sampler.draw(17));
    assert!(batch.rows() > 0, "the ratified plan draws participants");

    let mut stepper = super::live::Stepper::build(&fixture, BackendKind::Cpu, 42);
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
