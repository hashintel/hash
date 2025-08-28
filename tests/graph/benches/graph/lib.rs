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
    env::Args,
    path::{Path, PathBuf},
    process::ExitCode,
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
use libtest_mimic::{Arguments, Failed, Measurement, Trial};
use tracing::Level;

fn run_scenario(test_mode: bool, path: impl AsRef<Path>) -> Result<Option<Measurement>, Failed> {
    let runtime = tokio::runtime::Runtime::new().expect("Should be able to create runtime");
    runtime.block_on(async {
        let _telemetry_guard = hash_telemetry::init_tracing(
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
        .expect("Failed to initialize tracing");

        // Run JSON scenario (users -> web-catalog -> data-types -> property-types)
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("config")
            .join("scenarios")
            .join(path);

        Ok(scenario::run_scenario_file(&path, test_mode).await?)
    })
}

fn main() -> ExitCode {
    libtest_mimic::run(
        &Arguments::from_args(),
        vec![Trial::bench("full_test", |test_mode| {
            run_scenario(test_mode, "full_test.json")
        })],
    )
    .exit_code()
}
