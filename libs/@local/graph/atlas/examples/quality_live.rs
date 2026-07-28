//! One quality assessment of the active generation over the live
//! development store.
//!
//! ```text
//! cargo run -p hash-graph-atlas --features bench --release --example quality_live
//! ```
//!
//! Environment:
//!
//! - `ATLAS_QUALITY_DSN` - connection string; defaults to the development store (`host=localhost
//!   port=5432 user=graph password=graph dbname=graph`).
//! - `ATLAS_QUALITY_ROOT` - generation root directory; defaults to `atlas-generations` under the
//!   system temp directory.
//! - `ATLAS_QUALITY_SEED` - probe seed; defaults to 0.
//! - `ATLAS_QUALITY_ANCHORS` / `ATLAS_QUALITY_COMPARISONS` - probe sizing; default to 1024 / 4096.
//! - `ATLAS_QUALITY_REPORT` - where the report JSON lands; defaults to `quality-report.json`.
#![feature(default_field_values)]
#![expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the harness reports its measurements on stdout; `Duration` formats through `Debug`"
)]

use std::time::Instant;

use hash_graph_atlas::{
    bench::quality::{AssessOptions, assess_current},
    cli::connect,
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

    let dsn = std::env::var("ATLAS_QUALITY_DSN").unwrap_or_else(|_| {
        "host=localhost port=5432 user=graph password=graph dbname=graph".to_owned()
    });
    let root = std::env::var("ATLAS_QUALITY_ROOT").unwrap_or_else(|_| {
        std::env::temp_dir()
            .join("atlas-generations")
            .to_str()
            .expect("the temp directory is UTF-8")
            .to_owned()
    });
    let destination =
        std::env::var("ATLAS_QUALITY_REPORT").unwrap_or_else(|_| "quality-report.json".to_owned());

    let mut options = AssessOptions { .. };
    if let Ok(value) = std::env::var("ATLAS_QUALITY_SEED") {
        options.seed = value
            .parse()
            .expect("ATLAS_QUALITY_SEED should be an integer");
    }
    if let Ok(value) = std::env::var("ATLAS_QUALITY_ANCHORS") {
        options.anchors = value
            .parse()
            .expect("ATLAS_QUALITY_ANCHORS should be a positive integer");
    }
    if let Ok(value) = std::env::var("ATLAS_QUALITY_COMPARISONS") {
        options.comparisons = value
            .parse()
            .expect("ATLAS_QUALITY_COMPARISONS should be a positive integer");
    }

    tracing::info!(
        root,
        seed = options.seed,
        anchors = options.anchors.get(),
        comparisons = options.comparisons.get(),
        "starting the quality assessment"
    );

    let mut client = connect(&dsn).await.expect("the store should connect");
    let started = Instant::now();
    let assessment = assess_current(&mut client, &root, options).await;
    let elapsed = started.elapsed();

    std::fs::write(&destination, &assessment.report).expect("the report should write");

    println!();
    println!("generation  {}", assessment.generation);
    println!("passes      {}", assessment.passes);
    println!("report      {destination}");
    println!("wall        {elapsed:.1?}");
}
