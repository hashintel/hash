//! One receipt-dumping solve of a fold subset from a published generation's frozen corpus.
//!
//! Reconstructs the classifier training set of one published generation from its staged
//! annotation artifacts, re-runs the bounded solver over one fold subset under the generation's
//! echoed fit configuration, and dumps every receipt - the terminal is the observation:
//!
//! ```text
//! cargo build -p hash-graph-atlas --features bench --release --example classifier_probe
//! ./target/release/examples/classifier_probe
//! ```
//!
//! Environment:
//!
//! - `ATLAS_PROBE_ROOT` - generation root directory holding the published generation.
//! - `ATLAS_PROBE_GENERATION` - hex identity of the published generation.
//! - `ATLAS_PROBE_FOLD` - `seed:fold` naming the fold assignment and the held-out fold.

use hash_graph_atlas::bench::classifier::{ProbeOptions, probe_fold};

#[tokio::main]
async fn main() {
    let root = std::env::var("ATLAS_PROBE_ROOT")
        .expect("ATLAS_PROBE_ROOT names the generation root directory");
    let generation = std::env::var("ATLAS_PROBE_GENERATION")
        .expect("ATLAS_PROBE_GENERATION names the published generation");
    let probe = std::env::var("ATLAS_PROBE_FOLD").expect("ATLAS_PROBE_FOLD should be seed:fold");

    let (seed, fold) = probe
        .split_once(':')
        .expect("ATLAS_PROBE_FOLD should be seed:fold");

    probe_fold(
        &ProbeOptions {
            root: root.into(),
            generation,
        },
        seed.parse().expect("the probe seed should be an integer"),
        fold.parse().expect("the probe fold should be an integer"),
    )
    .await;
}
