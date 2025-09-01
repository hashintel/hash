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
    path::{Path, PathBuf},
};

use criterion::Criterion;
use criterion_macro::criterion;
use hash_telemetry::{
    OtlpConfig, TracingConfig,
    logging::{
        ColorOption, ConsoleConfig, ConsoleStream, FileConfig, FileRotation, LogFormat,
        LoggingConfig, RotationInterval,
    },
    traces::sentry::{SentryConfig, SentryEnvironment},
};
use tracing::Level;

use self::scenario::run_scenario_file;

fn init_tracing() -> impl Drop {
    hash_telemetry::init_tracing(
        TracingConfig {
            logging: LoggingConfig {
                console: ConsoleConfig {
                    enabled: true,
                    format: LogFormat::Pretty,
                    level: None,
                    color: ColorOption::Auto,
                    stream: ConsoleStream::Stderr,
                },
                file: FileConfig {
                    enabled: false,
                    format: LogFormat::Json,
                    level: None,
                    output: PathBuf::new(),
                    rotation: FileRotation {
                        rotation: RotationInterval::Never,
                        filename_prefix: None,
                        filename_suffix: None,
                        max_log_files: None,
                    },
                },
            },
            otlp: OtlpConfig {
                endpoint: Some("http://localhost:4317".to_owned()),
            },
            sentry: SentryConfig {
                dsn: None,
                environment: SentryEnvironment::Development,
                enable_span_attributes: true,
                span_filter: Level::INFO,
                event_filter: Level::INFO,
            },
        },
        "Graph Benches",
    )
    .expect("Failed to initialize tracing")
}

#[criterion]
fn scenarios(criterion: &mut Criterion) {
    let runtime = tokio::runtime::Runtime::new().expect("Should be able to create runtime");

    let _runtime_enter = runtime.enter();

    let _telemetry_guard = init_tracing();

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
