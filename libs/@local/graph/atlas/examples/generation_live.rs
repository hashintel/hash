//! One production generation run over the live development store.
//!
//! Drives the runner end to end - prior resolution, fit, admission
//! probe, activation decision - with per-stage wall clock from the
//! pipeline's span closes:
//!
//! ```text
//! cargo run -p hash-graph-atlas --features bench --release --example generation_live
//! ```
//!
//! Environment:
//!
//! - `ATLAS_RUN_DSN` - connection string; defaults to the development store (`host=localhost
//!   port=5432 user=graph password=graph dbname=graph`).
//! - `ATLAS_RUN_ROOT` - generation root directory; defaults to `atlas-generations` under the system
//!   temp directory. Size the filesystem for generations: one million rows write a ~2 GiB
//!   representation matrix alone.
//! - `ATLAS_RUN_SEED` - the run seed; overrides the seam default.
//! - `ATLAS_RUN_LANDMARKS` - landmark capacity; overrides the seam default.
//! - `ATLAS_RUN_FRESH=1` - ignore the root's active generation instead of reusing it as the prior.
//! - `ATLAS_RUN_ANCHORS` / `ATLAS_RUN_COMPARISONS` - admission probe sizing; default to 1024 /
//!   4096.
//! - `ATLAS_RUN_REPORT` - where the admission report JSON lands; defaults to
//!   `admission-report.json`.
#![feature(default_field_values)]
#![expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the harness reports its measurements on stdout; `Duration` formats through `Debug`"
)]

use std::time::Instant;

use hash_graph_atlas::bench::{
    fit::connect,
    runner::{LiveOptions, run_live},
};
use tracing_subscriber::{EnvFilter, fmt::format::FmtSpan};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_span_events(FmtSpan::CLOSE)
        .init();

    let dsn = std::env::var("ATLAS_RUN_DSN").unwrap_or_else(|_| {
        "host=localhost port=5432 user=graph password=graph dbname=graph".to_owned()
    });
    let root = std::env::var("ATLAS_RUN_ROOT").unwrap_or_else(|_| {
        std::env::temp_dir()
            .join("atlas-generations")
            .to_str()
            .expect("the temp directory is UTF-8")
            .to_owned()
    });
    let destination =
        std::env::var("ATLAS_RUN_REPORT").unwrap_or_else(|_| "admission-report.json".to_owned());

    let mut options = LiveOptions { .. };
    if let Ok(value) = std::env::var("ATLAS_RUN_SEED") {
        options.seed = value.parse().expect("ATLAS_RUN_SEED should be an integer");
    }
    if let Ok(value) = std::env::var("ATLAS_RUN_LANDMARKS") {
        options.landmarks = value
            .parse()
            .expect("ATLAS_RUN_LANDMARKS should be a positive integer");
    }
    options.fresh = std::env::var("ATLAS_RUN_FRESH").is_ok_and(|value| value == "1");
    if let Ok(value) = std::env::var("ATLAS_RUN_ANCHORS") {
        options.anchors = value
            .parse()
            .expect("ATLAS_RUN_ANCHORS should be a positive integer");
    }
    if let Ok(value) = std::env::var("ATLAS_RUN_COMPARISONS") {
        options.comparisons = value
            .parse()
            .expect("ATLAS_RUN_COMPARISONS should be a positive integer");
    }

    tracing::info!(
        root,
        seed = options.seed,
        landmarks = options.landmarks.get(),
        fresh = options.fresh,
        anchors = options.anchors.get(),
        comparisons = options.comparisons.get(),
        "starting the production run"
    );

    let mut client = connect(&dsn).await;
    let started = Instant::now();
    let summary = run_live(&mut client, &root, options).await;
    let elapsed = started.elapsed();

    std::fs::write(&destination, &summary.report).expect("the report should write");

    println!();
    println!("generation  {}", summary.generation);
    println!("nodes       {}", summary.nodes);
    println!("edges       {}", summary.edges);
    println!("recall      {:.4}", summary.recall);
    println!(
        "cards       {} reused, {} embedded",
        summary.reused, summary.embedded
    );
    println!("passes      {}", summary.passes);
    println!("activated   {}", summary.activated);
    println!("report      {destination}");
    println!("wall        {elapsed:.1?}");
}
