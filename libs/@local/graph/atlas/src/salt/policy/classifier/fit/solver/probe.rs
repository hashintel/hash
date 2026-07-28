//! Terminal-diagnosis probe over one published generation's frozen classifier corpus.
//!
//! The probe reconstructs the classifier training set of one published generation from its
//! staged annotation artifacts ([`replay`](crate::salt::policy::classifier::replay)), re-runs
//! the bounded solver over one fold subset under the generation's echoed fit configuration -
//! with the fold-assignment seed supplied externally, so any assignment can be probed - and
//! dumps every receipt: the terminal is the observation.
//!
//! Failures panic with the failing step's error: a probe run has no recovery path, and the
//! error is the diagnosis.

use super::{
    super::{super::replay::Frozen, grouped_folds},
    prepare::prepare,
    problem::ScaledProblem,
    receipt::ReceiptDetail,
    solve::solve,
    work::WorkCounters,
};
use crate::{
    file::generation::{GenerationId, GenerationRoot},
    math::MatrixN,
};

/// Solves one fold subset solo and dumps every receipt: the terminal-diagnosis probe.
///
/// The solver runs under the generation's echoed fit configuration; the fold-assignment seed
/// is the caller's, so any assignment - the echoed one or another - can be probed.
///
/// # Panics
///
/// Panics when the generation cannot be opened or its staged corpus fails reconstruction; the
/// probed solve itself may fail - its terminal is the observation.
#[expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the probe's receipt dump is its whole output; terminals and outcomes format through \
              their debug forms"
)]
pub(crate) async fn probe_fold(
    root: &GenerationRoot,
    generation: GenerationId,
    seed: u64,
    fold: usize,
) {
    let frozen = Frozen::load(root, generation);
    let reconstructed = frozen.reconstruct().await;
    let embeddings = reconstructed.trained_embeddings();
    let rows = reconstructed.rows();
    let config = frozen.fit();

    let folds = grouped_folds(rows, config.folds, seed).expect("the corpus has groups");
    let members: Vec<usize> = folds
        .iter()
        .enumerate()
        .filter(|(_, assigned)| **assigned != fold)
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

    println!("fold {fold} at seed {seed}: {} member rows", members.len());
    println!(
        "total weight {} scaling range {:?} sum range {:?} adjustment {:e}",
        prepared.total_weight,
        prepared.evidence.scaling_range,
        prepared.evidence.sum_range,
        prepared.evidence.maximum_adjustment,
    );

    let problem = ScaledProblem {
        prepared,
        config: config.solver,
    };
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
            "outer {} radius {:e} objective {:.15e} gradient {:e}\n  outcome {:?}",
            receipt.outer_iteration,
            receipt.radius,
            receipt.objective,
            receipt.gradient_norm,
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
}
