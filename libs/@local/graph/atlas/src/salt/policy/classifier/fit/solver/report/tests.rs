//! Certificates of the report instruments: the traced recurrence and the Ritz extraction.

use super::{
    super::{
        SOLVER_DIMENSIONS,
        cg::{CgOutcome, bounded_steihaug_cg},
        config::SolverConfig,
        prepare::{PreparationSettings, prepare},
        problem::ScaledProblem,
        solve::SolverControl,
        stable::stable_l2,
        work::WorkCounters,
    },
    trace::{TraceTermination, ritz_values, traced_cg},
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::Sha256Digest,
    math::{BoxedDVecN, DPositive, MatrixN},
    salt::policy::classifier::fit::TrainingRow,
};

/// A one-iteration recurrence pins the single Ritz value at the reciprocal step length.
#[test]
fn ritz_single_iteration_is_the_reciprocal_step_length() {
    let values = ritz_values(&[0.25], &[]).expect("one iteration yields one value");
    assert_eq!(values.len(), 1);
    assert!(
        (values[0] - 4.0).abs() < 1e-12,
        "the single Ritz value is 1/α = 4, got {}",
        values[0],
    );
}

/// Two unit coefficients build the tridiagonal `[[1, 1], [1, 2]]` with eigenvalues `(3 ± √5)/2`.
#[test]
fn ritz_two_iterations_reproduce_the_analytic_tridiagonal() {
    let values = ritz_values(&[1.0, 1.0], &[1.0]).expect("two iterations yield two values");
    assert_eq!(values.len(), 2);
    let expected = [
        f64::midpoint(3.0, -(5.0_f64.sqrt())),
        f64::midpoint(3.0, 5.0_f64.sqrt()),
    ];
    for (value, expected) in values.iter().zip(expected) {
        assert!(
            (value - expected).abs() < 1e-12,
            "Ritz value {value} approximates the analytic eigenvalue {expected}",
        );
    }
}

/// Zero direction coefficients decouple the tridiagonal into repeated diagonal entries.
#[test]
fn ritz_zero_beta_decouples_the_recurrence() {
    let values = ritz_values(&[0.5, 0.5, 0.5], &[0.0, 0.0]).expect("three iterations yield three");
    assert_eq!(values.len(), 3);
    for value in &values {
        assert!(
            (value - 2.0).abs() < 1e-12,
            "a decoupled entry is exactly 1/α = 2, got {value}",
        );
    }
}

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

/// The traced recurrence reproduces the production inner solve byte-for-byte and its true
/// residual tracks the recursion on a well-conditioned problem.
#[test]
fn traced_recurrence_matches_the_production_inner_solve() {
    let (embeddings, training) = fixture_corpus();

    // A trust radius wide enough that the production solve converges interior.
    let config = SolverConfig {
        radius_initial: DPositive::new(1.0e4).expect("the radius is positive"),
        ..
    };

    let mut counters = WorkCounters::default();
    let prepared = prepare(
        embeddings.rows(),
        &training,
        PreparationSettings { .. },
        &mut counters,
    )
    .expect("the fixture corpus prepares");
    let prepared_counters = counters;
    let problem = ScaledProblem { prepared, config };

    let origin = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let point = problem.point(&origin);
    let (_, gradient) = problem
        .joint(&point, &mut counters)
        .expect("the origin joint evaluation is finite");

    let mut trace_counters = WorkCounters::default();
    let trace = traced_cg(
        &problem,
        &point,
        &gradient,
        config.radius_initial.get(),
        200,
        &mut trace_counters,
    );

    let TraceTermination::Converged { iteration } = trace.termination else {
        panic!(
            "the traced recurrence converges, got {:?}",
            trace.termination
        );
    };
    assert!(iteration >= 1, "convergence takes at least one iteration");
    let last = trace
        .iterations
        .last()
        .expect("a converged trace records its iterations");
    assert!(
        last.recursive_residual_norm <= trace.tolerance,
        "the recorded residual met the tolerance",
    );
    assert!(
        last.residual_gap <= 1e-8 * trace.residual_base,
        "the recursive residual tracks the true residual on a well-conditioned problem (gap {:e} \
         against base {:e})",
        last.residual_gap,
        trace.residual_base,
    );
    assert!(
        trace.boundary_contact.is_none(),
        "the wide radius keeps the recurrence interior",
    );

    // The production inner solve over the same state returns the identical step.
    let mut control = SolverControl {
        radius: config.radius_initial.get(),
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters: prepared_counters,
        final_reserve: true,
    };
    let outcome = bounded_steihaug_cg(&problem, &point, &gradient, &mut control)
        .expect("the production inner solve converges on the fixture");
    let CgOutcome::ResidualConverged { step, .. } = outcome else {
        panic!("the production inner solve converges interior");
    };
    let production_norm = stable_l2(&step).expect("the production step is finite");
    assert_eq!(
        production_norm.to_bits(),
        last.step_norm.to_bits(),
        "the traced recurrence reproduces the production step byte-for-byte",
    );

    // The Ritz values of a positive-definite operator are positive, ascending, and bounded by
    // the traced spectrum's scale.
    let (alphas, betas) = trace.krylov_coefficients();
    let values = ritz_values(&alphas, &betas).expect("a converged recurrence yields values");
    assert_eq!(values.len(), trace.iterations.len());
    assert!(values.is_sorted(), "the Ritz values ascend");
    assert!(
        values.iter().all(|value| *value > 0.0 && *value < 3.0),
        "the scaled-Hessian Ritz values are positive and near-unit at the origin, got {values:?}",
    );
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
    let problem = ScaledProblem {
        prepared,
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
