pub use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use core::{fmt, fmt::Formatter};

use crate::{AttachmentKind, Context, Frame, FrameKind, Report};

#[derive(Debug, PartialEq, Eq)]
pub struct ContextA;

impl fmt::Display for ContextA {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.write_str("Context A")
    }
}

impl Context for ContextA {}

#[derive(Debug, PartialEq, Eq)]
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
    report
        .frames()
        .map(|frame| match frame.kind() {
            FrameKind::Context(context) => context.to_string(),
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => attachment.to_string(),
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => String::from("Opaque"),
        })
        .collect()
}

/// Conditionally add two opaque layers to the end,
/// as these catch the backtrace and spantrace if recorded.
pub fn expect_messages<'a>(messages: &[&'a str]) -> Vec<&'a str> {
    #[allow(unused_mut)]
    let mut messages = alloc::vec::Vec::from(messages);

    #[cfg(all(nightly, feature = "std"))]
    {
        messages.push("Opaque");
    }
    #[cfg(feature = "spantrace")]
    {
        messages.push("Opaque");
    }

    messages
}

/// Conditionally add two new frames to the count, as these are backtrace and spantrace.
#[allow(unused_mut)]
pub fn expect_count(mut count: usize) -> usize {
    #[cfg(all(nightly, feature = "std"))]
    {
        count += 1;
    }

    #[cfg(feature = "spantrace")]
    {
        count += 1;
    }

    count
}

pub fn frame_kinds<E>(report: &Report<E>) -> Vec<FrameKind> {
    report.frames().map(Frame::kind).collect()
}
