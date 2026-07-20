//! Backfills the postings artifact into an existing published
//! generation, so generations fitted before the postings role existed
//! open under the current serving contract without re-running the fit
//! (a re-fit would move every coordinate; the backfill moves none).
//!
//! The source generation stays untouched: the result publishes beside
//! it under its own identity, and the root's pointer moves exactly
//! when the source was the current generation.
//!
//! ```text
//! cargo run -p hash-graph-atlas --features bench --release --example backfill_postings
//! ```
//!
//! Environment:
//!
//! - `ATLAS_RUN_DSN` - connection string; defaults to the development store (`host=localhost
//!   port=5432 user=graph password=graph dbname=graph`).
//! - `ATLAS_RUN_ROOT` - generation root directory; defaults to `atlas-generations` under the system
//!   temp directory.
//! - `ATLAS_BACKFILL_GENERATION` - the source generation id (64-hex); defaults to the root's
//!   current generation.
#![expect(
    clippy::print_stdout,
    reason = "the harness reports its result on stdout"
)]

use hash_graph_atlas::bench::fit::{backfill, connect};
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
    let generation = std::env::var("ATLAS_BACKFILL_GENERATION").ok();

    tracing::info!(root, ?generation, "starting the postings backfill");

    let mut client = connect(&dsn).await;
    let summary = backfill(&mut client, &root, generation.as_deref()).await;

    println!("source:    {}", summary.source);
    println!("published: {}", summary.published);
    println!("activated: {}", summary.activated);
    println!(
        "drift:     unmatched_nodes={} unfilled_rows={} unmatched_types={} unfilled_types={} \
         dropped_type_references={} dropped_parent_references={}",
        summary.unmatched_nodes,
        summary.unfilled_rows,
        summary.unmatched_types,
        summary.unfilled_types,
        summary.dropped_type_references,
        summary.dropped_parent_references,
    );
}
