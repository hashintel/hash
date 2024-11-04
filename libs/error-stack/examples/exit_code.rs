//! Example of using `attach` to set a custom exit code. Requires nightly and std feature.

use core::error::Error;
use std::process::{ExitCode, Termination as _};

use error_stack::Report;

#[derive(Debug)]
struct CustomError;

impl Error for CustomError {}

impl core::fmt::Display for CustomError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str("Custom Error")
    }
}

fn main() -> ExitCode {
    let report = Report::new(CustomError)
        .attach(ExitCode::from(100))
        .attach_printable("this error has an exit code of 100!");

    report.report()
}
