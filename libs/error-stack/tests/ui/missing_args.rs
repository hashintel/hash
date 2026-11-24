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

fn empty_bail_arg() -> Result<(), Report<RootError>> {
    bail!() //~ ERROR: unexpected end of macro invocation
}

fn empty_ensure_arg() -> Result<(), Report<RootError>> {
    let _ = ensure!(); //~ ERROR: unexpected end of macro invocation

    Ok(())
}

fn missing_ensure_arg() -> Result<(), Report<RootError>> {
    let _ = ensure!(true); //~ ERROR: unexpected end of macro invocation

    Ok(())
}

fn main() {}
