pub use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use core::{fmt, fmt::Formatter};

use crate::{Context, Frame, FrameKind, Report};

#[derive(Debug, PartialEq)]
pub struct ContextA;

impl fmt::Display for ContextA {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("Context A")
    }
}

impl Context for ContextA {}

#[derive(Debug, PartialEq)]
pub struct ContextB;

impl fmt::Display for ContextB {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("Context B")
    }
}

#[cfg(feature = "std")]
impl std::error::Error for ContextB {}

#[cfg(not(feature = "std"))]
impl Context for ContextB {}

pub fn capture_error<E>(closure: impl FnOnce() -> Result<(), Report<E>>) -> Report<E> {
    match closure() {
        Ok(_) => panic!("Expected an error"),
        Err(report) => report,
    }
}

pub fn messages<E>(report: &Report<E>) -> Vec<String> {
    report.frames().map(ToString::to_string).collect()
}

pub fn frame_kinds<E>(report: &Report<E>) -> Vec<FrameKind> {
    report.frames().map(Frame::kind).collect()
}
