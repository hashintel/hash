#![feature(
    // Language Features
    custom_test_frameworks,
    never_type,
)]
#![test_runner(criterion::runner)]
#![expect(
    unreachable_pub,
    reason = "This is a benchmark but as we want to document this crate as well this should be a \
              warning instead"
)]

//! Benchmarks to test the performance of policy resolution operations.

extern crate alloc;

mod config;
mod scenario;

#[path = "../util.rs"]
mod util;

use criterion::Criterion;
use criterion_macro::criterion;

#[criterion]
fn bench_resolve_policies(_crit: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().expect("runtime");
    // Run JSON scenario (users -> web-catalog -> data-types -> property-types)
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("config")
        .join("scenarios")
        .join("full_ontology_seeding.json");

    #[expect(
        clippy::print_stderr,
        clippy::use_debug,
        reason = "Bench output is printed to console intentionally"
    )]
    match rt.block_on(async move { scenario::run_scenario_file(&path).await }) {
        Ok(result) => eprintln!("Scenario passed: {:#}", serde_json::json!(result)),
        Err(err) => eprintln!("Scenario failed: {err:?}"),
    }
}
