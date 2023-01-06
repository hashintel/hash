use core::fmt;

use error_stack::{Context, IntoReport, Report};

#[derive(Debug)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("root error")
    }
}

impl Context for RootError {}

fn main() {
    let result = Err::<(), _>(RootError);
    let _: Result<(), Report<RootError>> = result.into_report();

    let result = Err::<(), _>(Report::new(RootError));
    // Not allowed
    let _ = result.into_report();
}
