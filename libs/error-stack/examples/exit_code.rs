#![allow(
    clippy::print_stdout,
    clippy::print_stderr,
    unreachable_pub,
    clippy::use_debug,
    clippy::alloc_instead_of_core,
    clippy::std_instead_of_alloc,
    clippy::std_instead_of_core
)]
//! Example of using `attach` to set a custom exit code. Requires nightly and std feature.

use std::process::{ExitCode, Termination};

use error_stack::{Context, Report};

#[derive(Debug)]
struct CustomError;

impl Context for CustomError {}

impl std::fmt::Display for CustomError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Custom Error")
    }
}

fn main() -> ExitCode {
    let report = Report::new(CustomError)
        .attach(ExitCode::from(100))
        .attach_printable("this error has an exit code of 100!");

    report.report()
}
