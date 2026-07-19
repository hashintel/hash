//! The search-backend parameter sweep over the active generation.
//!
//! Builds one hannoy index per (seed, `ef_construction`) grid cell,
//! replaying the production fit's random streams, and reads recall@50
//! at every `ef_search` value against one exact reference per seed:
//!
//! ```text
//! cargo run -p hash-graph-atlas --features bench --release --example knn_sweep
//! ```
//!
//! Environment:
//!
//! - `ATLAS_SWEEP_ROOT` - generation root directory; defaults to `atlas-generations` under the
//!   system temp directory.
//! - `ATLAS_SWEEP_SEEDS` - comma-separated fit seeds; defaults to `0,0,1,2` (the repeated seed
//!   measures build nondeterminism).
//! - `ATLAS_SWEEP_EFC` - comma-separated `ef_construction` values; defaults to `128,256`.
//! - `ATLAS_SWEEP_EF` - comma-separated `ef_search` values; defaults to `64,128,192,256`.
#![feature(default_field_values)]
#![expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the harness reports its measurements on stdout; `Duration` formats through `Debug`"
)]

use std::time::Instant;

use hash_graph_atlas::bench::knn::{SweepOptions, sweep};
use tracing_subscriber::EnvFilter;

fn list(name: &str) -> Option<Vec<usize>> {
    std::env::var(name).ok().map(|value| {
        value
            .split(',')
            .map(|entry| {
                entry
                    .trim()
                    .parse()
                    .unwrap_or_else(|_| panic!("{name} entries should be integers"))
            })
            .collect()
    })
}

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

    let mut options = SweepOptions { .. };
    if let Ok(value) = std::env::var("ATLAS_SWEEP_SEEDS") {
        options.seeds = value
            .split(',')
            .map(|entry| {
                entry
                    .trim()
                    .parse()
                    .expect("ATLAS_SWEEP_SEEDS entries should be integers")
            })
            .collect::<Vec<u64>>()
            .into();
    }
    if let Some(values) = list("ATLAS_SWEEP_EFC") {
        options.constructions = values.into();
    }
    if let Some(values) = list("ATLAS_SWEEP_EF") {
        options.searches = values.into();
    }

    tracing::info!(
        root,
        seeds = ?options.seeds,
        constructions = ?options.constructions,
        searches = ?options.searches,
        "starting the backend sweep"
    );

    let started = Instant::now();
    let results = sweep(&root, &options);
    let elapsed = started.elapsed();

    println!();
    println!(
        "generation  {}  rows {}  recall@{} over {} sampled queries",
        results.generation, results.rows, results.neighbours, results.sampled_rows
    );
    for cost in &results.references {
        println!(
            "reference   seed {}  {:.1?} brute force",
            cost.seed, cost.wall
        );
    }
    println!();

    println!("build seed  efc   build wall   readings (ef@sample: recall)");
    for build in &results.builds {
        print!(
            "{:<11} {:<5} {:>9.1?}   ",
            build.seed, build.ef_construction, build.build_wall
        );
        for point in &build.points {
            print!(
                "{}@{}: {:.4}   ",
                point.ef_search, point.sample_seed, point.recall
            );
        }
        println!();
    }
    println!();

    // The decision surface: the worst recall each setting produced
    // across every build and sample that measured it.
    println!("minimum recall across builds and samples");
    println!("efc   ef     recall");
    for &ef_construction in &*options.constructions {
        for &ef_search in &*options.searches {
            let minimum = results
                .builds
                .iter()
                .filter(|build| build.ef_construction == ef_construction)
                .flat_map(|build| &build.points)
                .filter(|point| point.ef_search == ef_search)
                .map(|point| point.recall)
                .fold(f64::INFINITY, f64::min);
            println!("{ef_construction:<5} {ef_search:<6} {minimum:.4}");
        }
    }
    println!();
    println!("wall        {elapsed:.1?}");
}
