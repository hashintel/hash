//! Migrates an existing published generation to the current adjacency
//! format, so generations fitted before the structure-only sparse
//! matrix landed open under the current serving contract without
//! re-running the fit (a re-fit would move every coordinate; the
//! migration moves none).
//!
//! The source generation stays untouched: the result publishes beside
//! it under its own identity, and the root's pointer moves exactly
//! when the source was the current generation. No store connection is
//! needed - the retired file's bytes hold the full lists, verified
//! against the generation document before conversion.
//!
//! ```text
//! cargo run -p hash-graph-atlas --features bench --release --example migrate_adjacency
//! ```
//!
//! Environment:
//!
//! - `ATLAS_RUN_ROOT` - generation root directory; defaults to `atlas-generations` under the system
//!   temp directory.
//! - `ATLAS_MIGRATE_GENERATION` - the source generation id (64-hex); defaults to the root's current
//!   generation.
#![expect(
    clippy::print_stdout,
    reason = "the harness reports its result on stdout"
)]

use hash_graph_atlas::bench::fit::migrate_adjacency;
use tracing_subscriber::EnvFilter;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let root = std::env::var("ATLAS_RUN_ROOT").unwrap_or_else(|_| {
        std::env::temp_dir()
            .join("atlas-generations")
            .to_str()
            .expect("the temp directory is UTF-8")
            .to_owned()
    });
    let generation = std::env::var("ATLAS_MIGRATE_GENERATION").ok();

    tracing::info!(root, ?generation, "starting the adjacency migration");

    let summary = migrate_adjacency(&root, generation.as_deref());

    println!("source:    {}", summary.source);
    println!("published: {}", summary.published);
    println!("activated: {}", summary.activated);
}
