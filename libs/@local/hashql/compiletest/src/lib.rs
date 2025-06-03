//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Library Features
    assert_matches,
    coverage_attribute,
    file_buffered,
    lock_value_accessors,
    pattern,
    // Language Features
    decl_macro,
    if_let_guard,
)]
extern crate alloc;

use std::{
    env,
    io::{Write as _, stdout},
    path::PathBuf,
    process::exit,
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

mod annotation;
mod executor;
mod find;
mod reporter;
mod styles;
mod suite;

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
    List,
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
        let reporter = Reporter::install();

        let mut command = MetadataCommand::new();
        if self.quick_filter {
            // speeds up tests from >600ms to ~40ms
            command.no_deps();
        }

        let graph = PackageGraph::from_command(&mut command).expect("failed to load package graph");

        let tests = find::find_tests(&graph);
        let statistics = Statistics::new();

        let mut trials = TrialSet::from_test(tests, &statistics);

        if let Some(filter) = self.filter {
            trials.filter(filter, &graph);
        }

        match self.command {
            Command::Run { bless } => {
                let total = trials.len();
                let ignored = trials.ignored();

                setup_progress_header!(reporter, Summary { total, ignored }, statistics);

                let reports = trials.run(&TrialContext { bless });
                let failures = reports.len();

                tracing::info!(
                    success = total - ignored - failures,
                    failures = failures,
                    "finished trial execution"
                );

                Reporter::report_errors(reports).expect("should be able to report errors");

                if failures > 0 {
                    exit(1);
                }
            }
            Command::List => {
                trials
                    .list(&stdout())
                    .expect("should be able to write to stdout");
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
