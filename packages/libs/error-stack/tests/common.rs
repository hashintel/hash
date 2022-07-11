#![allow(dead_code)]

extern crate alloc;

pub use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use core::{fmt, iter};

use error_stack::{AttachmentKind, Context, Frame, FrameKind, Report, Result};
#[cfg(feature = "futures")]
use futures_core::{Future, Stream};

#[derive(Debug, PartialEq, Eq)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Root error")
    }
}

impl Context for RootError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextA(pub u32);

impl fmt::Display for ContextA {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Context A")
    }
}

impl Context for ContextA {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut core::any::Demand<'a>) {
        demand.provide_ref(&self.0);
        demand.provide_value(|| self.0 as u64);
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct ContextB(pub i32);

impl fmt::Display for ContextB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Context B")
    }
}

impl Context for ContextB {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut core::any::Demand<'a>) {
        demand.provide_ref(&self.0);
        demand.provide_value(|| self.0 as i64);
    }
}

#[derive(Debug)]
#[cfg(feature = "spantrace")]
pub struct ErrorA(pub u32, tracing_error::SpanTrace);

#[cfg(feature = "spantrace")]
impl ErrorA {
    pub fn new(value: u32) -> Self {
        Self(value, tracing_error::SpanTrace::capture())
    }
}

#[cfg(feature = "spantrace")]
impl fmt::Display for ErrorA {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Error A")
    }
}

#[cfg(feature = "spantrace")]
impl Context for ErrorA {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut core::any::Demand<'a>) {
        demand.provide_ref(&self.1);
    }
}

#[derive(Debug)]
#[cfg(all(nightly, feature = "std"))]
pub struct ErrorB(pub u32, std::backtrace::Backtrace);

#[cfg(all(nightly, feature = "std"))]
impl ErrorB {
    pub fn new(value: u32) -> Self {
        Self(value, std::backtrace::Backtrace::force_capture())
    }
}

#[cfg(all(nightly, feature = "std"))]
impl fmt::Display for ErrorB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Error B")
    }
}

#[cfg(all(nightly, feature = "std"))]
impl std::error::Error for ErrorB {
    fn backtrace(&self) -> Option<&std::backtrace::Backtrace> {
        Some(&self.1)
    }
}

#[derive(Clone)]
pub struct AttachmentA(pub u32);
pub struct AttachmentB(pub i32);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrintableA(pub u32);

impl fmt::Display for PrintableA {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Printable A")
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct PrintableB(pub u32);

impl fmt::Display for PrintableB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Printable B")
    }
}

pub fn create_report() -> Report<RootError> {
    Report::new(RootError)
}

pub fn create_error() -> Result<(), RootError> {
    Err(create_report())
}

pub fn create_iterator(num_elements: usize) -> impl Iterator<Item = Result<(), RootError>> {
    iter::repeat_with(create_error).take(num_elements)
}

#[cfg(feature = "futures")]
pub fn create_future() -> impl Future<Output = Result<(), RootError>> {
    futures::future::err(create_report())
}

#[cfg(feature = "futures")]
pub fn create_stream(num_elements: usize) -> impl Stream<Item = Result<(), RootError>> {
    futures::stream::iter(create_iterator(num_elements))
}

pub fn capture_ok<E>(closure: impl FnOnce() -> Result<(), E>) {
    closure().expect("Expected an OK value, found an error")
}

pub fn capture_error<E>(closure: impl FnOnce() -> Result<(), E>) -> Report<E> {
    closure().expect_err("Expected an error")
}

pub fn messages<E>(report: &Report<E>) -> Vec<String> {
    report
        .frames()
        .map(|frame| match frame.kind() {
            FrameKind::Context(context) => context.to_string(),
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => attachment.to_string(),
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => String::from("Opaque"),
            FrameKind::Attachment(_) => panic!("Attachment was not covered"),
        })
        .collect()
}

pub fn frame_kinds<E>(report: &Report<E>) -> Vec<FrameKind> {
    report.frames().map(Frame::kind).collect()
}
