//! A `&mut Frame` must not be able to escape the `frames_mut` visitor. Two escaped references
//! could alias the same frame (directly and through `Frame::sources_mut`), which is the
//! soundness hole the visitor API exists to close.

use core::{error::Error, fmt, ops::ControlFlow};

use error_stack::{Frame, Report};

#[derive(Debug)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("root error")
    }
}

impl Error for RootError {}

fn main() {
    let mut report = Report::new(RootError).attach("attachment");

    let mut escaped: Vec<&mut Frame> = Vec::new();
    let _ = report.frames_mut(|frame| {
        escaped.push(frame);
        ControlFlow::Continue(())
    });
}
