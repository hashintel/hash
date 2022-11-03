use core::fmt;

use error_stack::{bail, ensure, report, Context, Result};

#[derive(Debug)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("root error")
    }
}

impl Context for RootError {}

fn invalid_report_arg() -> Result<(), RootError> {
    let _ = report!("Error");

    Ok(())
}

fn empty_report_arg() -> Result<(), RootError> {
    let _ = report!();

    Ok(())
}

fn invalid_bail_arg() -> Result<(), RootError> {
    bail!("Error")
}

fn empty_bail_arg() -> Result<(), RootError> {
    bail!()
}

fn invalid_ensure_error_arg() -> Result<(), RootError> {
    let _ = ensure!(true, "Error");

    Ok(())
}

fn invalid_ensure_condition_arg() -> Result<(), RootError> {
    let _ = ensure!("No boolean", RootError);

    Ok(())
}

fn missing_ensure_arg() -> Result<(), RootError> {
    let _ = ensure!(true);

    Ok(())
}

fn empty_ensure_arg() -> Result<(), RootError> {
    let _ = ensure!();

    Ok(())
}

fn main() {}
