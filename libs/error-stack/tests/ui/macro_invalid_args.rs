use core::{error::Error, fmt};

use error_stack::{Report, bail, ensure};

#[derive(Debug)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("root error")
    }
}

impl Error for RootError {}

fn invalid_bail_arg() -> Result<(), Report<RootError>> {
    bail!("Error")
}

fn invalid_ensure_error_arg() -> Result<(), Report<RootError>> {
    let _ = ensure!(true, "Error");

    Ok(())
}

fn invalid_ensure_condition_arg() -> Result<(), Report<RootError>> {
    let _ = ensure!("No boolean", RootError);

    Ok(())
}

fn main() {}
