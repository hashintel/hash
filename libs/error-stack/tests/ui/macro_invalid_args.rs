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
    //~^ E0277
    //~| E0277
}

fn invalid_ensure_error_arg() -> Result<(), Report<RootError>> {
    let _ = ensure!(true, "Error");
    //~^ E0277
    //~| E0277

    Ok(())
}

fn invalid_ensure_condition_arg() -> Result<(), Report<RootError>> {
    let _ = ensure!("No boolean", RootError); //~ E0308

    Ok(())
}

fn main() {}
