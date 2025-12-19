//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    coverage_attribute,
    decl_macro,
    if_let_guard,

    // Library Features
    assert_matches,
    file_buffered,
    formatting_options,
    lock_value_accessors,
    pattern,
    string_from_utf8_lossy_owned,
)]

extern crate alloc;

use core::sync::atomic::{AtomicBool, Ordering};
use std::{
    backtrace::Backtrace,
    env,
    io::{Write as _, stdout},
    panic::{self, PanicHookInfo},
    path::PathBuf,
    process::exit,
    time::Instant,
};

use guppy::{
    MetadataCommand,
    graph::{PackageGraph, PackageMetadata},
};

use self::{
    annotation::file::FileAnnotations,
    executor::{TrialContext, TrialSet},
    reporter::{Reporter, Statistics, Summary, setup_progress_header},
    suite::Suite,
};
use crate::styles::{CYAN, GRAY};

mod annotation;
mod executor;
mod find;
mod output;
mod reporter;
mod styles;
mod suite;

pub use self::output::OutputFormat;

static PANICKED: AtomicBool = AtomicBool::new(false);

fn panic_hook(panic_info: &PanicHookInfo) {
    let message = panic_info
        .payload_as_str()
        .map_or_else(|| "Box<dyn Any>".to_owned(), ToOwned::to_owned);

    let location = panic_info.location().map(ToString::to_string);

    let backtrace = Backtrace::force_capture();

    tracing::error!(message, location, %backtrace, "encountered panic");
    PANICKED.store(true, Ordering::SeqCst);
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
struct Spec {
    suite: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TestCase {
    pub spec: Spec,
    pub path: PathBuf,
    pub namespace: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TestGroup<'graph> {
    pub entry: EntryPoint<'graph>,
    pub cases: Vec<TestCase>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EntryPoint<'graph> {
    pub path: PathBuf,
    pub metadata: PackageMetadata<'graph>,
}

pub enum Command {
    Run { bless: bool },
    List { format: OutputFormat },
    Suites { format: OutputFormat },
}

pub struct Options {
    pub filter: Option<String>,
    pub quick_filter: bool,

    pub command: Command,
}

impl Options {
    /// Runs the specified command with the given options.
    ///
    /// # Panics
    ///
    /// - Failed to load package graph
    /// - Unable to write to stdout or stderr
    /// - Unable to report errors
    pub fn run(self) {
        if let Command::Suites { format } = self.command {
            Self::list_suites(format);
            return;
        }

        let reporter = Reporter::install();

        let mut command = MetadataCommand::new();
        if self.quick_filter {
            // speeds up tests from >600ms to ~40ms
            command.no_deps();
        }

        let graph = PackageGraph::from_command(&mut command).expect("failed to load package graph");

        let now = Instant::now();
        let tests = find::find_tests(&graph);
        tracing::info!(
            "found {} test groups with {} test cases, in {:?}",
            tests.len(),
            tests.iter().map(|group| group.cases.len()).sum::<usize>(),
            now.elapsed()
        );

        let mut statistics = Statistics::new();

        let now = Instant::now();
        let mut trials = TrialSet::from_test(tests, &statistics);
        tracing::info!("created trial set in {:?}", now.elapsed());

        if let Some(filter) = self.filter {
            trials.filter(filter, &graph);
        }

        match self.command {
            Command::Run { bless } => {
                let total = trials.len();
                let ignored = trials.ignored();

                setup_progress_header!(reporter, Summary { total, ignored }, &statistics);
                panic::set_hook(Box::new(panic_hook));

                let reports = trials.run(&TrialContext { bless });
                let failures = reports.len();

                let timings = statistics.timings();

                tracing::info!(
                    success = total - ignored - failures,
                    failures = failures,
                    ?timings,
                    "finished trial execution"
                );

                Reporter::report_errors(reports).expect("should be able to report errors");

                let panicked = PANICKED.load(Ordering::SeqCst);
                if failures > 0 || panicked {
                    exit(1);
                }
            }
            Command::List { format } => {
                trials
                    .list(&stdout(), format)
                    .expect("should be able to write to stdout");
            }
            Command::Suites { .. } => unreachable!(),
        }
    }

    fn list_suites(format: OutputFormat) {
        use output::escape_json;

        let mut stdout = stdout();
        let suites = suite::iter();

        match format {
            OutputFormat::Json => {
                for suite in suites {
                    write!(stdout, r#"{{"name":""#).expect("should be able to write to stdout");
                    escape_json(&mut stdout, suite.name())
                        .expect("should be able to write to stdout");
                    write!(stdout, r#"","description":""#)
                        .expect("should be able to write to stdout");
                    escape_json(&mut stdout, suite.description())
                        .expect("should be able to write to stdout");
                    writeln!(stdout, r#""}}"#).expect("should be able to write to stdout");
                }
            }
            OutputFormat::Human => {
                for suite in suites {
                    writeln!(stdout, "  {CYAN}{}{CYAN:#}", suite.name())
                        .expect("should be able to write to stdout");
                    writeln!(stdout, "      {GRAY}{}{GRAY:#}", suite.description())
                        .expect("should be able to write to stdout");
                }
            }
        }
    }
}

/// Provides a minimal compatibility layer for use with `nextest`.
pub fn nextest_bridge(package: &str) {
    let args: Vec<_> = env::args().collect();

    let mut stdout = stdout();

    if args[1..] == ["--list", "--format", "terse"] {
        write!(stdout, "compiletest: test").expect("should be able to write to stdout");
        return;
    }

    if args[1..] == ["--list", "--format", "terse", "--ignored"] {
        return;
    }

    let options = Options {
        filter: Some(format!("package({package})")),
        quick_filter: true,
        command: Command::Run { bless: false },
    };

    options.run();
}

/// Generates a standard entry point for the compiletest test harness.
///
/// This macro creates a `main` function that sets up a bridge between the compiletest harness and
/// any libtest-mimic compatible test runner (notably nextest).
///
/// # Usage
///
/// Add this macro to a test file (typically named `compiletest.rs` or similar):
///
/// ```no_run
/// use hashql_compiletest::compiletest_main;
///
/// compiletest_main!();
/// ```
///
/// This will enable the test file to be discovered and run by both the standard
/// Rust test harness and nextest.
///
/// # Integration with cargo and nextest
///
/// When using this macro, the test can be:
///
/// - Run directly with `cargo test`
/// - Run through nextest with `cargo nextest run`
///
/// Only tests that are applicable to the current package are run.
#[macro_export]
macro_rules! compiletest_main {
    () => {
        fn main() {
            let crate_name = env!("CARGO_PKG_NAME");

            $crate::nextest_bridge(crate_name);
        }
    };
}
