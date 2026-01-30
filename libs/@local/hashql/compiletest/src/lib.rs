//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    coverage_attribute,
    if_let_guard,

    // Library Features
    assert_matches,
    file_buffered,
    formatting_options,
    lock_value_accessors,
    pattern,
    string_from_utf8_lossy_owned,
    try_trait_v2,
    vec_from_fn,
    duration_millis_float
)]

extern crate alloc;

use core::sync::atomic::{AtomicBool, Ordering};
use std::{
    backtrace::Backtrace,
    env,
    io::{Write as _, stdout},
    panic::{self, PanicHookInfo},
    process::exit,
    time::Instant,
};

use guppy::{MetadataCommand, graph::PackageGraph};

use self::{
    annotation::file::FileAnnotations,
    harness::{
        test::TestCorpus,
        trial::{ListTrials, TrialContext, TrialCorpus},
    },
};
use crate::styles::{CYAN, GRAY};

mod annotation;
mod harness;
mod output;
// mod reporter;
mod runner;
mod styles;
mod suite;
mod ui;

pub use self::output::OutputFormat;

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

        let mut command = MetadataCommand::new();
        if self.quick_filter {
            // speeds up tests from >600ms to ~40ms
            command.no_deps();
        }

        let graph = PackageGraph::from_command(&mut command).expect("failed to load package graph");

        let now = Instant::now();
        let corpus = TestCorpus::discover(&graph);
        tracing::info!(
            "found {} test groups with {} test cases, in {:?}",
            corpus.len(),
            corpus.cases(),
            now.elapsed()
        );

        if let Some(filter) = self.filter {
            corpus.filter(filter, &graph);
        }

        match self.command {
            Command::Run { bless } => {
                // let total = corpus.len();
                // let ignored = corpus.ignored();

                panic::set_hook(Box::new(panic_hook));

                let trials = corpus.to_set();
                runner::ui::tui::run(&trials, &TrialContext { bless });

                let panicked = PANICKED.load(Ordering::SeqCst);
                // todo: failures > 0
                if panicked {
                    exit(1);
                }
            }
            Command::List { format } => {
                ListTrials::new(&stdout(), format)
                    .render(&corpus)
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
