use core::{error::Error, fmt};

use error_stack::Report;

#[derive(Debug)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("root error")
    }
}

impl Error for RootError {}

#[derive(Debug)]
struct NotDisplay;

fn main() {
    let _ = Report::new(RootError).attach(NotDisplay);
}
