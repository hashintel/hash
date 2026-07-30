//! Terminal-diagnosis probe over one frozen classifier corpus.
//!
//! The probe reconstructs the classifier training set from staged annotation artifacts
//! ([`replay`](crate::salt::policy::classifier::report::replay)) - a published generation's or
//! a supplied directory's - re-runs the bounded solver over one fold subset, and dumps every
//! receipt: the terminal is the observation. The fold-assignment seed and the regularization
//! strength are the caller's, so any assignment and any candidate strength - the production CV
//! candidates included - can be probed.
//!
//! When the solve ends at the CG iteration budget (or a traced outer is requested), the probe
//! replays the outer trajectory to the stalling iteration - certifying every replayed outer
//! against the production receipts' digests - and runs the instrumented inner recurrence there
//! ([`trace`](super::trace)): true-versus-recursive residual, Ritz spectrum, and the per-row
//! curvature-scale census separate a smeared spectrum from rounding drift.
//!
//! Failures panic with the failing step's error: a probe run has no recovery path, and the
//! error is the diagnosis.

use camino::Utf8Path;

use super::{
    super::{
        super::grouped_folds,
        SOLVER_DIMENSIONS,
        cg::bounded_steihaug_cg,
        flat,
        prepare::prepare,
        problem::ScaledProblem,
        receipt::{OuterReceipt, ReceiptDetail, vector_digest},
        solve::{AcceptedPoint, SolverControl, rejected, solve},
        stable::checked_dot,
        terminal::SolverFailure,
        work::WorkCounters,
    },
    trace::{CgTrace, TraceTermination, ritz_values, traced_cg},
};
use crate::{
    file::generation::{GenerationId, GenerationRoot},
    math::{BoxedDVecN, DPositive, MatrixN},
    salt::policy::classifier::report::replay::Frozen,
};

/// Where the probed corpus artifacts come from.
#[derive(Debug)]
pub(crate) enum ProbeCorpus<'caller> {
    /// The staged artifacts of a published generation, under its echoed configuration.
    Generation {
        /// The generation root directory.
        root: &'caller GenerationRoot,
        /// The published generation.
        generation: GenerationId,
    },
    /// Supplied artifact files under their staged names, under the compiled deployment
    /// defaults; the corpus of a fit that never published probes through this form.
    Supplied {
        /// The directory holding the three annotation artifacts.
        directory: &'caller Utf8Path,
    },
}

/// The probed solve's settings beside the corpus.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ProbeSettings {
    /// The fold-assignment seed; the configured seed probes the production assignment.
    pub seed: u64,
    /// The held-out fold of the probed subset.
    pub fold: usize,
    /// Regularization-strength override; a CV candidate's fold solve probes through this.
    pub strength: Option<f64>,
    /// The outer iteration whose inner recurrence is traced; defaults to the stalling outer
    /// when the solve ends at the CG iteration budget.
    pub trace_outer: Option<u64>,
    /// Instrumented-recurrence depth; defaults to four times the CG iteration allowance.
    pub trace_depth: Option<u64>,
}

/// Solves one fold subset solo and dumps every receipt: the terminal-diagnosis probe.
///
/// # Panics
///
/// Panics when the corpus cannot be opened or fails reconstruction, or when a requested trace
/// cannot certify its replayed trajectory against the production receipts; the probed solve
/// itself may fail - its terminal is the observation.
#[expect(
    clippy::print_stdout,
    clippy::use_debug,
    clippy::too_many_lines,
    reason = "the probe's receipt dump is its whole output; terminals and outcomes format through \
              their debug forms, and the dump is one linear script"
)]
pub(crate) async fn probe_fold(corpus: ProbeCorpus<'_>, settings: ProbeSettings) {
    let frozen = match corpus {
        ProbeCorpus::Generation { root, generation } => Frozen::load(root, generation),
        ProbeCorpus::Supplied { directory } => Frozen::from_supplied(directory),
    };
    let reconstructed = frozen.reconstruct().await;
    let embeddings = reconstructed.trained_embeddings();
    let rows = reconstructed.rows();

    let mut config = frozen.fit();
    if let Some(strength) = settings.strength {
        let strength =
            DPositive::new(strength).expect("the strength override is positive and finite");
        println!(
            "regularization: configured {:e} overridden to {:e}",
            config.solver.preparation.regularization.get(),
            strength.get(),
        );
        config.solver.preparation.regularization = strength;
    } else {
        println!(
            "regularization: configured {:e}",
            config.solver.preparation.regularization.get(),
        );
    }

    let folds =
        grouped_folds(rows, config.folds, settings.seed).expect("the corpus has enough groups");
    let members: Vec<usize> = folds
        .iter()
        .enumerate()
        .filter(|(_, assigned)| **assigned != settings.fold)
        .map(|(row, _)| row)
        .collect();

    let mut fold_embeddings = MatrixN::zeroed(members.len());
    let fold_rows_mut = fold_embeddings.rows_mut();
    let mut fold_training = Vec::with_capacity(members.len());
    for (position, &member) in members.iter().enumerate() {
        *fold_rows_mut[position].as_array_mut() = *embeddings[member].as_array();
        fold_training.push(rows[member]);
    }

    let mut counters = WorkCounters::default();
    let prepared = prepare(
        fold_embeddings.rows(),
        &fold_training,
        config.solver.preparation,
        &mut counters,
    )
    .expect("the fold corpus prepares");
    // The replay of a traced outer re-enters the solve with these exact charges.
    let prepared_counters = counters;

    println!(
        "fold {} at seed {}: {} member rows",
        settings.fold,
        settings.seed,
        members.len(),
    );
    println!(
        "total weight {} scaling range {:?} curvature floor {:e} sum range {:?} adjustment {:e}",
        prepared.total_weight,
        prepared.evidence.scaling_range,
        prepared.evidence.curvature_floor,
        prepared.evidence.sum_range,
        prepared.evidence.maximum_adjustment,
    );

    let problem = ScaledProblem {
        prepared,
        config: config.solver,
    };
    let allowance = problem.config.cg_iteration_allowance();
    println!("cg iteration allowance {allowance}");

    let run = solve(&problem, counters, ReceiptDetail::Digests);

    println!("outcome: {:?}", run.outcome.as_ref().err());
    println!(
        "accepted objective {:.15e} zeta norm {:e} scaled gradient norm {:e}",
        run.accepted.objective,
        run.accepted.zeta.norm_squared().sqrt(),
        run.accepted.scaled_gradient.norm_squared().sqrt(),
    );
    println!(
        "control: radius {:e} rejections {} outers {}",
        run.control.radius,
        run.control.consecutive_rejections,
        run.control.outer_iterations_started,
    );
    for receipt in &run.receipts {
        println!(
            "outer {} radius {:e} objective {:.15e} gradient {:e} hvp {}\n  outcome {:?}",
            receipt.outer_iteration,
            receipt.radius,
            receipt.objective,
            receipt.gradient_norm,
            receipt.counters.hvp_requests,
            receipt.outcome,
        );
        println!(
            "  zeta {} gradient {}",
            receipt.digests.zeta, receipt.digests.gradient
        );
    }
    println!("counters: {:?}", run.control.counters);
    if let Some(coordinates) = run.coordinates {
        println!(
            "coordinates: {} over {} at {} dimensions",
            coordinates.domain_tag, coordinates.coordinate_system, coordinates.dimensions,
        );
    }

    // The traced outer: the caller's, or the stalling one when the CG budget refused.
    let target = settings.trace_outer.or_else(|| {
        matches!(run.outcome, Err(SolverFailure::CgIterationBudget))
            .then_some(run.control.outer_iterations_started)
    });
    let Some(target) = target else {
        return;
    };
    assert!(
        target >= 1 && target <= run.control.outer_iterations_started,
        "the traced outer {target} is one of the {} started outer iterations",
        run.control.outer_iterations_started,
    );

    println!("\n=== inner-recurrence trace at outer {target} ===");
    let (accepted, radius) = replay_to_outer(&problem, prepared_counters, &run.receipts, target);
    let point = problem.point(&accepted.zeta);
    println!(
        "replay certified through outer {target}: objective {:.15e} radius {:e}",
        accepted.objective, radius,
    );

    // Curvature census at the origin (every row uniform) and at the traced iterate: the pair
    // exposes the saturation cliff between the fit's start and its stall.
    let weights: Vec<f64> = problem.prepared.rows.iter().map(|row| row.weight).collect();
    let origin_point = problem.point(&BoxedDVecN::<SOLVER_DIMENSIONS>::zero());
    print_curvature_census(
        "row curvature scales max_c p(1-p) at origin",
        &problem.prepared.row_curvature_scales(&origin_point),
        &weights,
    );
    print_curvature_census(
        "row curvature scales max_c p(1-p) at traced outer",
        &problem.prepared.row_curvature_scales(&point),
        &weights,
    );

    let depth = settings
        .trace_depth
        .unwrap_or_else(|| allowance.saturating_mul(4));
    let mut trace_counters = WorkCounters::default();
    let trace = traced_cg(
        &problem,
        &point,
        &accepted.scaled_gradient,
        radius,
        depth,
        &mut trace_counters,
    );
    print_trace(&trace, allowance, depth);

    let (alphas, betas) = trace.krylov_coefficients();
    match ritz_values(&alphas, &betas) {
        Some(values) => print_ritz(&values),
        None => println!("ritz spectrum: no completed iterations"),
    }
}

/// Replays the production outer trajectory to the start of `target`, certifying every replayed
/// outer against its production receipt.
///
/// Returns the accepted state entering `target` and its trust radius. The replay re-runs the
/// production functions over the same problem from the same charged counters, so equality of
/// radii, objectives, counters, and start-state digests at every outer proves the replayed
/// trajectory is the production trajectory.
///
/// # Panics
///
/// Panics when a replayed outer disagrees with its production receipt, or when a stage the
/// production solve completed fails in replay.
fn replay_to_outer(
    problem: &ScaledProblem<'_>,
    counters: WorkCounters,
    receipts: &[OuterReceipt],
    target: u64,
) -> (AcceptedPoint, f64) {
    let config = &problem.config;
    let mut control = SolverControl {
        radius: config.radius_initial.get(),
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters,
        final_reserve: true,
    };

    let origin = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let point = problem.point(&origin);
    let Some((objective, scaled_gradient)) = problem.joint(&point, &mut control.counters) else {
        unreachable!("the origin is the zero vector, whose joint request is always finite")
    };
    let mut accepted = AcceptedPoint {
        zeta: origin,
        objective,
        scaled_gradient,
    };

    for outer in 1..=target {
        let receipt = receipts
            .get(usize::try_from(outer - 1).expect("outer indices fit the address space"))
            .expect("every replayed outer has a production receipt");
        assert!(
            receipt.outer_iteration == outer
                && receipt.radius.to_bits() == control.radius.to_bits()
                && receipt.objective.to_bits() == accepted.objective.to_bits()
                && receipt.counters == control.counters
                && receipt.digests.zeta == vector_digest(&accepted.zeta)
                && receipt.digests.gradient == vector_digest(&accepted.scaled_gradient),
            "the replayed start state of outer {outer} reproduces its production receipt",
        );

        if outer == target {
            break;
        }
        control.outer_iterations_started += 1;

        // The body below mirrors the production outer loop stage for stage; every terminal the
        // production solve survived is an expect here.
        let point = problem.point(&accepted.zeta);
        let inner = bounded_steihaug_cg(problem, &point, &accepted.scaled_gradient, &mut control)
            .expect("the production solve completed this inner solve");

        let trial_zeta = flat::advance(&accepted.zeta, 1.0, inner.step());
        let trial_point = problem.point(&trial_zeta);
        let trial_objective = problem.objective(&trial_point, &mut control.counters);
        if !trial_objective.is_finite() {
            control.counters.reject_non_finite_candidate();
            rejected(&mut control, config)
                .expect("the production solve continued past this rejection");
            continue;
        }

        let along_gradient = checked_dot(&accepted.scaled_gradient, inner.step())
            .expect("the production solve priced this step");
        let along_curvature = checked_dot(inner.step(), inner.hessian_step())
            .expect("the production solve priced this step");
        let predicted = (-0.5_f64).mul_add(along_curvature, -along_gradient);
        let actual = accepted.objective - trial_objective;
        let ratio = actual / predicted;

        if ratio < config.eta_accept.get() {
            control.counters.reject_finite_candidate();
            rejected(&mut control, config)
                .expect("the production solve continued past this rejection");
            continue;
        }

        let trial_gradient = problem
            .gradient(&trial_point, &mut control.counters)
            .filter(|gradient| gradient.is_finite())
            .expect("the production solve accepted this candidate's gradient");
        accepted = AcceptedPoint {
            zeta: trial_zeta,
            objective: trial_objective,
            scaled_gradient: trial_gradient,
        };
        control.counters.accept_candidate();
        control.consecutive_rejections = 0;

        if inner.is_boundary() && ratio >= config.eta_expand.get() {
            control.radius =
                (config.expansion_factor.get() * control.radius).min(config.radius_maximum.get());
        }
    }

    (accepted, control.radius)
}

/// Prints the cumulative decade census of one curvature-scale reading.
#[expect(
    clippy::print_stdout,
    reason = "the probe's receipt dump is its whole output"
)]
fn print_curvature_census(label: &str, scales: &[f64], weights: &[f64]) {
    let total_weight: f64 = weights.iter().sum();
    let mut sorted = scales.to_vec();
    sorted.sort_unstable_by(f64::total_cmp);
    let median = sorted[sorted.len() >> 1];
    println!(
        "{label}: rows {} min {:e} median {median:e} max {:e}",
        scales.len(),
        sorted.first().copied().unwrap_or(f64::NAN),
        sorted.last().copied().unwrap_or(f64::NAN),
    );
    for threshold in [1e-14, 1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 1e-2] {
        let below = scales.iter().filter(|scale| **scale < threshold).count();
        let weight_below: f64 = scales
            .iter()
            .zip(weights)
            .filter(|(scale, _)| **scale < threshold)
            .map(|(_, weight)| *weight)
            .sum();
        println!(
            "  < {threshold:>7.0e}: {below:>5} rows, weight share {:.4}",
            weight_below / total_weight,
        );
    }
}

/// Prints the traced recurrence: a bounded selection of iterations and the termination.
#[expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the probe's receipt dump is its whole output"
)]
fn print_trace(trace: &CgTrace, allowance: u64, depth: u64) {
    println!(
        "trace: residual base {:e} tolerance {:e} depth {depth} (allowance {allowance})",
        trace.residual_base, trace.tolerance,
    );
    let last = trace.iterations.last().map_or(0, |entry| entry.iteration);
    for entry in &trace.iterations {
        let selected = entry.iteration <= 15
            || entry.iteration.is_multiple_of(10)
            || entry.iteration == last
            || entry.iteration == allowance
            || entry.iteration == allowance + 1;
        if !selected {
            continue;
        }
        let marker = if entry.iteration <= allowance {
            ' '
        } else {
            '+'
        };
        println!(
            "  {marker}{:>5} alpha {:.6e} beta {} |r_rec| {:.6e} |r_true| {:.6e} gap/true {:.3e} \
             |p| {:.6e}",
            entry.iteration,
            entry.alpha,
            entry
                .beta
                .map_or_else(|| "-".to_owned(), |beta| format!("{beta:.6e}")),
            entry.recursive_residual_norm,
            entry.true_residual_norm,
            entry.residual_gap / entry.true_residual_norm,
            entry.step_norm,
        );
    }
    match trace.boundary_contact {
        Some(iteration) => println!("  boundary contact at iteration {iteration} (not enforced)"),
        None => println!("  no boundary contact within the traced depth"),
    }
    match trace.termination {
        TraceTermination::Converged { iteration } => {
            println!("  termination: converged at iteration {iteration}");
        }
        other @ (TraceTermination::DepthExhausted
        | TraceTermination::CurvatureGuard { .. }
        | TraceTermination::NonFinite { .. }) => println!("  termination: {other:?}"),
    }
}

/// Prints the Ritz spectrum: extremes, non-positive count, and the cumulative decade census.
#[expect(
    clippy::print_stdout,
    reason = "the probe's receipt dump is its whole output"
)]
fn print_ritz(values: &[f64]) {
    let minimum = values.first().copied().unwrap_or(f64::NAN);
    let maximum = values.last().copied().unwrap_or(f64::NAN);
    let non_positive = values.iter().filter(|value| **value <= 0.0).count();
    println!(
        "ritz spectrum: order {} min {minimum:e} max {maximum:e} spread {:e} non-positive {}",
        values.len(),
        maximum / minimum,
        non_positive,
    );
    for threshold in [1e-8, 1e-6, 1e-4, 1e-2, 1e-1, 0.5, 1.0] {
        let below = values.iter().filter(|value| **value < threshold).count();
        println!("  < {threshold:>7.0e}: {below:>5} values");
    }
    let smallest: Vec<String> = values
        .iter()
        .take(12)
        .map(|value| format!("{value:.6e}"))
        .collect();
    let largest: Vec<String> = values
        .iter()
        .rev()
        .take(4)
        .rev()
        .map(|value| format!("{value:.6e}"))
        .collect();
    println!("  smallest {}", smallest.join(" "));
    println!("  largest {}", largest.join(" "));
}
