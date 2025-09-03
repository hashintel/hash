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

use std::{
    fs::{self},
    path::Path,
};

use criterion::Criterion;
use criterion_macro::criterion;
use hash_repo_chores::benches::generate_path;
use hash_telemetry::{
    OtlpConfig, TelemetryRegistry,
    logging::{ColorOption, ConsoleConfig, ConsoleStream, LogFormat},
};

use self::scenario::run_scenario_file;

fn init_tracing(suite: &'static str, scenario: &str, bench: &str) -> impl Drop {
    TelemetryRegistry::default()
        .with_error_layer()
        .with_console_logging(ConsoleConfig {
            enabled: true,
            format: LogFormat::Pretty,
            level: None,
            color: ColorOption::Auto,
            stream: ConsoleStream::Stderr,
        })
        .with_otlp(
            OtlpConfig {
                endpoint: Some("http://localhost:4317".to_owned()),
            },
            "Graph Benches",
        )
        .with_flamegraph(Path::new("out").join(generate_path(suite, Some(scenario), Some(bench))))
        .init()
        .expect("Failed to initialize tracing")
}

#[criterion]
fn scenarios(criterion: &mut Criterion) {
    let runtime = tokio::runtime::Runtime::new().expect("Should be able to create runtime");

    let _runtime_enter = runtime.enter();
    // TODO: Add resource usage monitoring (memory, CPU, database metrics) during benchmarks
    //   see https://linear.app/hashintel/issue/BE-32

    let dir_entries = fs::read_dir(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("config")
            .join("scenarios"),
    )
    .expect("Should be able to read scenarios");

    for entry in dir_entries {
        let entry = entry.expect("Should be able to read scenario path");
        if entry
            .file_type()
            .expect("Should be able to read file type")
            .is_dir()
        {
            continue;
        }

        let path = entry.path();
        let scenario = path
            .file_stem()
            .expect("Should be able to read scenario name")
            .to_string_lossy();

        run_scenario_file(&path, &runtime, criterion.benchmark_group(scenario));
    }
}
