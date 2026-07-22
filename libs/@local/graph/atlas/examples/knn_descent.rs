//! The NN-Descent construction audit over the active generation.
//!
//! Constructs the production-width neighbour lists per (seed, candidate cap) grid cell, replaying
//! the production fit's random streams, and reads recall@50 against one exact reference:
//!
//! ```text
//! cargo run -p hash-graph-atlas --features bench --release --example knn_descent
//! ```
//!
//! Environment:
//!
//! - `ATLAS_SWEEP_ROOT` - generation root directory; defaults to `atlas-generations` under the
//!   system temp directory.
//! - `ATLAS_SWEEP_SEEDS` - comma-separated fit seeds; defaults to `0,0,1` (the repeated seed
//!   measures construction nondeterminism).
//! - `ATLAS_SWEEP_CANDIDATES` - comma-separated candidate caps; defaults to `50`.
#![expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the harness reports its measurements on stdout; `Duration` formats through `Debug`"
)]

use hash_graph_atlas::bench::knn::descent;
use tracing_subscriber::EnvFilter;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let root = std::env::var("ATLAS_SWEEP_ROOT").unwrap_or_else(|_| {
        std::env::temp_dir()
            .join("atlas-generations")
            .to_str()
            .expect("the temp directory is UTF-8")
            .to_owned()
    });
    let seeds: Vec<u64> = std::env::var("ATLAS_SWEEP_SEEDS").map_or_else(
        |_| vec![0, 0, 1],
        |value| {
            value
                .split(',')
                .map(|entry| {
                    entry
                        .trim()
                        .parse()
                        .expect("ATLAS_SWEEP_SEEDS entries should be integers")
                })
                .collect()
        },
    );
    let candidates: Vec<usize> = std::env::var("ATLAS_SWEEP_CANDIDATES").map_or_else(
        |_| vec![50],
        |value| {
            value
                .split(',')
                .map(|entry| {
                    entry
                        .trim()
                        .parse()
                        .expect("ATLAS_SWEEP_CANDIDATES entries should be integers")
                })
                .collect()
        },
    );

    let audit = descent(&root, &seeds, &candidates);

    println!();
    println!(
        "generation  {}  rows {}  recall@{} over {} sampled queries",
        audit.generation, audit.rows, audit.neighbours, audit.sampled_rows
    );
    println!("reference   {:.1?} brute force", audit.reference_wall);
    println!();
    println!("seed  candidates  construct wall   recall");
    for reading in &audit.readings {
        println!(
            "{:<5} {:<11} {:>13.1?}   {:.4}",
            reading.seed, reading.maximum_candidates, reading.construct_wall, reading.recall
        );
    }
}
