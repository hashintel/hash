//! Certificates of the report probes: the probe's curvature census.

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
    math::{BoxedDVecN, MatrixN, d_positive},
    salt::policy::classifier::fit::TrainingRow,
};

/// Builds a six-row corpus that covers every class with small deterministic embeddings.
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

/// Reads every origin row's curvature scale as the `f64` reference `p·(1 − p)`, bit for bit.
///
/// At the physical origin every row's probabilities are uniform, and the curvature scale
/// `max_c p_c(1 − p_c)` is `(1/3)·(2/3) = 2/9` in real arithmetic. The census computes it as the
/// `f64` expression `p·(1 − p)` with `p = 1/3`, the rounded expression the test builds as its
/// reference, and the two agree bit for bit. That reference differs from the `f64` nearest to
/// `2/9` by one unit in the last place, and the assertion pins the computed expression rather
/// than the exactly rounded fraction.
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
    let census = problem.prepared.curvature_census(&point);

    let probability = 1.0_f64 / 3.0;
    let expected = probability * (1.0 - probability);
    assert_eq!(census.readings.len(), 6);
    for reading in &census.readings {
        assert_eq!(
            reading.scale.to_bits(),
            expected.to_bits(),
            "a uniform row's curvature scale is exactly (1/3)(2/3)",
        );
    }
}

/// Pairs each census reading with its row's own weight and the preparation-validated total.
///
/// The census pairs each row's reading with that row's own weight in original order and carries the
/// preparation-validated total: a weight share divides by the exact row-order sum.
#[test]
fn census_readings_carry_row_weights_and_the_validated_total() {
    let (embeddings, _) = fixture_corpus();
    let classes = [0_usize, 1, 2].into_iter().cycle();
    let training: Vec<TrainingRow> = (0..6_u8)
        .zip(classes)
        .map(|(index, class)| {
            let mut target = [0.0_f64; 3];
            target[class] = 1.0;
            TrainingRow {
                target,
                weight: f64::from(index) + 1.0,
                group: Sha256Digest::of([index]),
            }
        })
        .collect();

    let mut counters = WorkCounters::default();
    let prepared = prepare(
        embeddings.rows(),
        &training,
        PreparationSettings { .. },
        &mut counters,
    )
    .expect("the weighted fixture corpus prepares");
    let gram = Gram::assemble(embeddings.rows(), &mut counters);
    let problem = ScaledProblem {
        prepared,
        gram: GramView::full(&gram),
        config: SolverConfig { .. },
    };

    let origin = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let point = problem.point(&origin);
    let census = problem.prepared.curvature_census(&point);

    for (index, reading) in census.readings.iter().enumerate() {
        let expected = f64::from(u8::try_from(index).expect("six rows")) + 1.0;
        assert_eq!(
            reading.weight.to_bits(),
            expected.to_bits(),
            "reading {index} carries its own row's weight",
        );
    }
    assert_eq!(
        census.total_weight,
        d_positive!(21.0),
        "the total is the validated row-order sum 1+2+3+4+5+6",
    );
}
