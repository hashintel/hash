#![deny(unused_must_use)]

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

fn main() {
    Report::new(RootError);
}
