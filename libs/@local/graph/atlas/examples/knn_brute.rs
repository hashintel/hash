//! The exact brute-force construction audit over the active generation.
//!
//! Constructs the production-width neighbour lists by tiled tensor products and reads recall@50
//! against one exact CPU reference:
//!
//! ```text
//! cargo run -p hash-graph-atlas --features bench-gpu --release --example knn_brute
//! ```
//!
//! Under `bench-gpu` the products run on the Metal-backed CubeCL runtime; without it the CPU
//! tensor backend runs the same arithmetic, at a wall time only fixture-sized corpora enjoy.
//!
//! Environment:
//!
//! - `ATLAS_SWEEP_ROOT` - generation root directory; defaults to `atlas-generations` under the
//!   system temp directory.
//! - `ATLAS_BRUTE_ROWS` - audit only the corpus prefix of this many rows; full-corpus wall
//!   extrapolates quadratically from the bounded reading.
#![expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the harness reports its measurements on stdout; `Duration` formats through `Debug`"
)]

use hash_graph_atlas::bench::knn::brute;
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

    let rows_limit = std::env::var("ATLAS_BRUTE_ROWS").ok().map(|value| {
        value
            .parse()
            .expect("ATLAS_BRUTE_ROWS should be an integer")
    });
    let audit = brute(&root, rows_limit);

    println!();
    println!(
        "generation  {}  rows {}  recall@{} over {} sampled queries",
        audit.generation, audit.rows, audit.neighbours, audit.sampled_rows
    );
    println!(
        "reference   {:.1?} brute force (CPU, sampled)",
        audit.reference_wall
    );
    println!();
    println!(
        "construct   {:.1?}   recall {:.4}",
        audit.construct_wall, audit.recall
    );
}
