//! Certificates of the report instruments: the probe's curvature census.

use super::super::{
    SOLVER_DIMENSIONS,
    config::SolverConfig,
    gram::{Gram, GramView},
    prepare::{PreparationSettings, prepare},
    problem::ScaledProblem,
    work::WorkCounters,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::Sha256Digest,
    math::{BoxedDVecN, MatrixN},
    salt::policy::classifier::fit::TrainingRow,
};

/// Six rows covering every class, with small deterministic embeddings.
fn fixture_corpus() -> (MatrixN<CANONICAL_DIMENSIONS>, Vec<TrainingRow>) {
    let rows: u8 = 6;
    let classes = [0_usize, 1, 2].into_iter().cycle();
    let mut embeddings = MatrixN::zeroed(usize::from(rows));
    for ((index, embedding), class) in embeddings.rows_mut().iter_mut().enumerate().zip(classes) {
        let ordinal = f32::from(u8::try_from(index).expect("six rows"));
        let components = embedding.as_array_mut();
        components[0] = 0.25_f32.mul_add(ordinal, 1.0);
        components[1] = [0.0_f32, 1.0, 2.0][class];
        components[7] = (-0.125_f32).mul_add(ordinal, 0.5);
    }

    let classes = [0_usize, 1, 2].into_iter().cycle();
    let training = (0..usize::from(rows))
        .zip(classes)
        .map(|(index, class)| {
            let mut target = [0.0_f64; 3];
            target[class] = 1.0;
            TrainingRow {
                target,
                weight: 1.0,
                group: Sha256Digest::of([u8::try_from(index).expect("six rows")]),
            }
        })
        .collect();

    (embeddings, training)
}

/// At the physical origin every row's probabilities are uniform, so the curvature scale is
/// exactly `(1/3)·(2/3)` for every row.
#[test]
fn curvature_scales_at_the_origin_are_uniform() {
    let (embeddings, training) = fixture_corpus();

    let mut counters = WorkCounters::default();
    let prepared = prepare(
        embeddings.rows(),
        &training,
        PreparationSettings { .. },
        &mut counters,
    )
    .expect("the fixture corpus prepares");
    let gram = Gram::assemble(embeddings.rows(), &mut counters);
    let problem = ScaledProblem {
        prepared,
        gram: GramView::full(&gram),
        config: SolverConfig { .. },
    };

    let origin = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let point = problem.point(&origin);
    let scales = problem.prepared.row_curvature_scales(&point);

    let probability = 1.0_f64 / 3.0;
    let expected = probability * (1.0 - probability);
    assert_eq!(scales.len(), 6);
    for scale in &scales {
        assert_eq!(
            scale.to_bits(),
            expected.to_bits(),
            "a uniform row's curvature scale is exactly (1/3)(2/3)",
        );
    }
}
