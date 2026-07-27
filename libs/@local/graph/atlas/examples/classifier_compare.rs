//! One measured comparison of the two classifier optimizers over a frozen corpus.
//!
//! Reconstructs the classifier training set of one published generation from its staged
//! annotation artifacts and runs the production L-BFGS path beside the trust-region Newton-CG
//! solver over the identical bytes:
//!
//! ```text
//! cargo build -p hash-graph-atlas --features bench --release --example classifier_compare
//! ./target/release/examples/classifier_compare
//! ```
//!
//! Environment:
//!
//! - `ATLAS_COMPARE_ROOT` - generation root directory holding the published generation.
//! - `ATLAS_COMPARE_GENERATION` - hex identity of the published generation.
//! - `ATLAS_COMPARE_REPEATS` - timed samples per measurement after one warmup; defaults to 5.
//! - `ATLAS_COMPARE_GROUPED=0` - skip the grouped rows; the solo rows always run.
//! - `ATLAS_COMPARE_GRADIENT_TOLERANCE` - override the echoed gradient tolerance, for
//!   stopping-sensitivity runs.
//!
//! The grouped rows fit fold models in parallel; pin `RAYON_NUM_THREADS` to measure them
//! without pool parallelism. The solo rows are single-threaded by construction.
#![feature(default_field_values)]
#![expect(
    clippy::print_stdout,
    reason = "the harness reports its measurements on stdout"
)]

use hash_graph_atlas::bench::classifier::{
    CompareOptions, Comparison, Timing, compare, probe_fold,
};

#[tokio::main]
async fn main() {
    let root = std::env::var("ATLAS_COMPARE_ROOT")
        .expect("ATLAS_COMPARE_ROOT names the generation root directory");
    let generation = std::env::var("ATLAS_COMPARE_GENERATION")
        .expect("ATLAS_COMPARE_GENERATION names the published generation");

    let mut options = CompareOptions {
        root: root.into(),
        generation,
        ..
    };
    if let Ok(value) = std::env::var("ATLAS_COMPARE_REPEATS") {
        options.timed_repeats = value
            .parse()
            .expect("ATLAS_COMPARE_REPEATS should be a positive integer");
    }
    if let Ok(value) = std::env::var("ATLAS_COMPARE_GROUPED") {
        options.grouped = value != "0";
    }
    if let Ok(value) = std::env::var("ATLAS_COMPARE_GRADIENT_TOLERANCE") {
        options.gradient_tolerance = Some(
            value
                .parse()
                .expect("ATLAS_COMPARE_GRADIENT_TOLERANCE should be a float"),
        );
    }

    if let Ok(value) = std::env::var("ATLAS_COMPARE_PROBE") {
        let (seed, fold) = value
            .split_once(':')
            .expect("ATLAS_COMPARE_PROBE should be seed:fold");
        probe_fold(
            &options,
            seed.parse().expect("the probe seed should be an integer"),
            fold.parse().expect("the probe fold should be an integer"),
        )
        .await;
        return;
    }

    let comparison = compare(&options).await;
    report(&comparison);
}

/// Prints every section of the comparison as plain numbers.
fn report(comparison: &Comparison) {
    solvers(comparison);
    verdicts(comparison);
}

/// Prints the corpus certificates and the two solo sections.
fn solvers(comparison: &Comparison) {
    let corpus = &comparison.corpus;
    println!("== corpus ==");
    println!("generation           {}", corpus.generation);
    println!("corpus digest        {}", corpus.corpus_digest);
    println!("document verified    {}", corpus.document_verified);
    println!("embeddings verified  {}", corpus.embeddings_verified);
    println!("hashes verified      {}", corpus.hashes_verified);
    println!("trained rows         {}", corpus.trained);
    println!("total weight         {}", corpus.total_weight);
    println!("recorded iterations  {}", corpus.recorded_iterations);
    println!("echoed regularization {}", corpus.regularization);
    println!("echoed grad tolerance {}", corpus.gradient_tolerance);
    println!("echoed max iterations {}", corpus.maximum_iterations);

    let old = &comparison.old;
    println!("\n== incumbent L-BFGS (More-Thuente), solo ==");
    println!("iterations           {}", old.iterations);
    println!("matches recorded     {}", old.matches_recorded_iterations);
    println!("status               {}", old.status);
    println!("final objective      {:.15e}", old.final_objective);
    println!("final gradient norm  {:.3e}", old.final_gradient_norm);
    println!("cost passes          {}", old.cost_passes);
    println!("gradient passes      {}", old.gradient_passes);
    println!(
        "solve passes         {}",
        old.cost_passes + old.gradient_passes
    );
    println!("validation passes    {}", old.validation_passes);
    println!("deterministic        {}", old.deterministic);
    println!("adapter transparent  {}", old.adapter_transparent);
    timing("wall", &old.timing);

    let armijo = &old.armijo;
    println!("\n== crate-default Armijo backtracking, bounded exhibit ==");
    println!("converged            {}", armijo.converged);
    println!("status               {}", armijo.status);
    println!("cost passes          {}", armijo.cost_passes);
    println!("gradient passes      {}", armijo.gradient_passes);
    println!("best objective       {:.15e}", armijo.best_objective);

    let new = &comparison.new;
    println!("\n== trust-region Newton-CG, solo ==");
    println!("outer iterations     {}", new.outer_iterations);
    println!("final objective      {:.15e}", new.final_objective);
    println!(
        "  normalized         {:.15e}",
        new.final_objective_normalized
    );
    println!(
        "scaled gradient norm {:.3e}",
        new.final_scaled_gradient_norm
    );
    println!("joint passes         {}", new.joint_passes);
    println!("objective passes     {}", new.objective_passes);
    println!("gradient passes      {}", new.gradient_passes);
    println!("hvp passes           {}", new.hvp_passes);
    println!(
        "solve passes         {}",
        new.joint_passes + new.objective_passes + new.gradient_passes + new.hvp_passes
    );
    println!("preparation passes   {}", new.preparation_passes);
    println!("acceptances          {}", new.acceptances);
    println!("ratio rejections     {}", new.ratio_rejections);
    println!("deterministic        {}", new.deterministic);
    timing("wall", &new.timing);
}

/// Prints the cross-frame checks, the shared-target row, the grouped rows, and the traces.
fn verdicts(comparison: &Comparison) {
    let cross = &comparison.cross;
    println!("\n== cross-frame ==");
    println!("old at old           {:.15e}", cross.old_at_old);
    println!("new frame at old     {:.15e}", cross.new_frame_at_old);
    println!("old frame at new     {:.15e}", cross.old_frame_at_new);
    println!("new at new           {:.15e}", cross.new_at_new);
    println!(
        "disagreement at old  {:.3e}",
        cross.relative_disagreement_at_old
    );
    println!(
        "disagreement at new  {:.3e}",
        cross.relative_disagreement_at_new
    );
    println!(
        "old-frame grad @ new {:.3e}",
        cross.old_frame_gradient_norm_at_new
    );
    println!("old gauge mass       {:.3e}", cross.old_gauge_mass);
    println!("old intercept gauge  {:.3e}", cross.old_intercept_gauge);

    let target = &comparison.work_to_target;
    println!("\n== work to shared target ==");
    println!("target               {:.15e}", target.target);
    match target.old_passes {
        Some(passes) => println!("old passes           {passes}"),
        None => println!("old passes           never reached"),
    }
    match target.new_passes {
        Some(passes) => println!("new passes           {passes}"),
        None => println!("new passes           never reached"),
    }

    if let Some(grouped) = &comparison.grouped {
        println!("\n== grouped (folds + 1 models) ==");
        println!("rayon threads        {}", rayon::current_num_threads());
        println!("old deterministic    {}", grouped.old_deterministic);
        for row in &grouped.old {
            timing(&format!("old seed {}", row.seed), &row.timing);
        }
        for row in &grouped.new {
            timing(&format!("new seed {} (emulated)", row.seed), &row.timing);
        }
    }

    println!("\n== traces (passes, objective) ==");
    println!("old: {} points", comparison.old.trace.len());
    for point in &comparison.old.trace {
        println!("old {} {:.15e}", point.passes, point.objective);
    }
    println!("new: {} points", comparison.new.trace.len());
    for point in &comparison.new.trace {
        println!("new {} {:.15e}", point.passes, point.objective);
    }
}

/// Prints one timing as median plus every sample.
fn timing(label: &str, timing: &Timing) {
    let samples = timing
        .samples
        .iter()
        .map(|sample| format!("{sample:.3}"))
        .collect::<Vec<_>>()
        .join(" ");
    println!(
        "{label}: median {:.3}s, samples [{samples}]",
        timing.median()
    );
}
