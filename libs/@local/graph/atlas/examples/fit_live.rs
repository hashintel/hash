//! One measured fit over the live development store.
//!
//! Every pipeline stage prints its wall clock as its span closes; peak
//! residency comes from the operating system:
//!
//! ```text
//! cargo build -p hash-graph-atlas --features bench --release --example fit_live
//! /usr/bin/time -l ./target/release/examples/fit_live
//! ```
//!
//! Add `--features bench,gpu` to train the projector placement on the
//! Metal backend; the CPU backend trains identically, around twenty
//! times slower.
//!
//! Environment:
//!
//! - `ATLAS_FIT_DSN` - connection string; defaults to the development store (`host=localhost
//!   port=5432 user=graph password=graph dbname=graph`).
//! - `ATLAS_FIT_ROOT` - generation root directory; defaults to `atlas-generations` under the system
//!   temp directory. Size the filesystem for generations: one million rows write a ~2 GiB
//!   representation matrix alone.
//! - `ATLAS_FIT_SEED` - fit seed; overrides the seam default.
//! - `ATLAS_FIT_LANDMARKS` - landmark capacity; overrides the seam default.
//! - `ATLAS_FIT_PRIOR=current` - reuse the root's active generation as the prior. Every run
//!   activates what it publishes, so two plain runs back to back measure the reuse path.
//! - `ATLAS_FIT_VERDICTS` - path of a reviewed-verdicts document to supply; the fit stages it
//!   verbatim as the generation's `reviewed-verdicts.json` role.
//! - `ATLAS_FIT_PROJECTOR_STEPS` - override the trained placement's step count (reference options,
//!   boundary at the midpoint); absent, the configuration default trains 2000 steps. The trainer's
//!   phase boundary needs reviewed-Proximal coverage, so pair a trained run with
//!   `ATLAS_FIT_VERDICTS` on a corpus whose relations carry Proximal force.
//! - `ATLAS_FIT_BASELINE=1` - place at the landmark baseline instead of training: the fallback
//!   placer, for measuring the pipeline without the training stage.
#![feature(default_field_values)]
#![expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the harness reports its measurements on stdout; `Duration` formats through `Debug`"
)]

use core::num::NonZero;
use std::time::Instant;

use hash_graph_atlas::bench::fit::{RunOptions, connect, run};
use tracing_subscriber::{EnvFilter, fmt::format::FmtSpan};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_span_events(FmtSpan::CLOSE)
        .init();

    let dsn = std::env::var("ATLAS_FIT_DSN").unwrap_or_else(|_| {
        "host=localhost port=5432 user=graph password=graph dbname=graph".to_owned()
    });
    let root = std::env::var("ATLAS_FIT_ROOT").unwrap_or_else(|_| {
        std::env::temp_dir()
            .join("atlas-generations")
            .to_str()
            .expect("the temp directory is UTF-8")
            .to_owned()
    });

    let mut options = RunOptions { .. };
    if let Ok(value) = std::env::var("ATLAS_FIT_SEED") {
        options.seed = value.parse().expect("ATLAS_FIT_SEED should be an integer");
    }
    if let Ok(value) = std::env::var("ATLAS_FIT_LANDMARKS") {
        options.landmarks = value
            .parse()
            .expect("ATLAS_FIT_LANDMARKS should be a positive integer");
    }
    options.reuse_current = std::env::var("ATLAS_FIT_PRIOR").is_ok_and(|value| value == "current");
    options.verdicts = std::env::var("ATLAS_FIT_VERDICTS").ok();
    if let Ok(value) = std::env::var("ATLAS_FIT_PROJECTOR_STEPS") {
        options.projector_steps = Some(
            value
                .parse()
                .expect("ATLAS_FIT_PROJECTOR_STEPS should be a positive integer"),
        );
    }
    options.baseline = std::env::var("ATLAS_FIT_BASELINE").is_ok_and(|value| value == "1");

    tracing::info!(
        root,
        seed = options.seed,
        landmarks = options.landmarks.get(),
        reuse_current = options.reuse_current,
        verdicts = options.verdicts.as_deref().unwrap_or("<none>"),
        projector_steps = options.projector_steps.map_or(0, NonZero::get),
        baseline = options.baseline,
        "starting the measured fit"
    );

    let mut client = connect(&dsn).await;
    let started = Instant::now();
    let summary = run(&mut client, &root, options).await;
    let elapsed = started.elapsed();

    println!();
    println!("generation  {}", summary.generation);
    println!("nodes       {}", summary.nodes);
    println!("edges       {}", summary.edges);
    println!("types       {}", summary.ontology_types);
    println!("recall      {:.4}", summary.recall);
    println!(
        "cards       {} reused, {} embedded",
        summary.reused, summary.embedded
    );
    println!(
        "landmarks   {} selected, {} retained",
        summary.selected, summary.retained
    );
    println!("wall        {elapsed:.1?}");
}
