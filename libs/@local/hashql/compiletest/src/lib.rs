//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    coverage_attribute,
    if_let_guard,

    // Library Features
    duration_millis_float,
    exitcode_exit_method,
    file_buffered,
    formatting_options,
    pattern,
    string_from_utf8_lossy_owned,
    try_trait_v2,
    vec_from_fn,
)]

extern crate alloc;

use std::{
    env,
    io::{Write as _, stdout},
};

use self::{
    annotation::file::FileAnnotations,
    runner::{Command, Run, Runner, output::OutputFormat},
};

mod annotation;
mod harness;
pub mod runner;
mod suite;
mod ui;

/// Provides a minimal compatibility layer for use with `nextest`.
///
/// # Panics
///
/// If unable to write to stdout.
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

    let runner = Runner {
        filter: Some(format!("package({package})")),
        quick_filter: true,
    };

    runner
        .execute(Command::Run(Run {
            format: OutputFormat::Human,
            bless: false,
        }))
        .expect("should be able to run");
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
