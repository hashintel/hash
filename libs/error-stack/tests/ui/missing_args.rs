use core::{error::Error, fmt};

use error_stack::{Report, bail, ensure, report};

#[derive(Debug)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("root error")
    }
}

impl Error for RootError {}

fn empty_report_arg() -> Result<(), Report<RootError>> {
    let _ = report!();

    Ok(())
}

fn empty_bail_arg() -> Result<(), Report<RootError>> {
    bail!()
}

fn empty_ensure_arg() -> Result<(), Report<RootError>> {
    let _ = ensure!();

    Ok(())
}

fn missing_ensure_arg() -> Result<(), Report<RootError>> {
    let _ = ensure!(true);

    Ok(())
}

fn main() {}
