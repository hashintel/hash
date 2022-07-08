pub use alloc::{
    string::{String, ToString},
    vec::Vec,
};
#[allow(unused_imports)]
use core::{
    fmt,
    fmt::Formatter,
    sync::atomic::{AtomicBool, AtomicI8, AtomicU8, Ordering},
};

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

#[cfg(all(nightly, feature = "std"))]
fn supports_backtrace() -> bool {
    // we need to track 3 states:
    //  1) -1 (not checked)
    //  2) 0 (disabled)
    //  3) 1 (enabled)
    static STATE: AtomicI8 = AtomicI8::new(-1);

    match STATE.load(Ordering::SeqCst) {
        -1 => {
            let bt = std::backtrace::Backtrace::capture();
            if bt.status() == std::backtrace::BacktraceStatus::Captured {
                STATE.store(1, Ordering::SeqCst);
            } else {
                STATE.store(0, Ordering::SeqCst);
            }

            supports_backtrace()
        }
        0 => false,
        1 => true,
        _ => unreachable!(),
    }
}

#[cfg(feature = "spantrace")]
fn supports_spantrace() -> bool {
    static STATE: AtomicI8 = AtomicI8::new(-1);

    match STATE.load(Ordering::SeqCst) {
        -1 => {
            let st = tracing_error::SpanTrace::capture();
            if st.status() == tracing_error::SpanTraceStatus::CAPTURED {
                STATE.store(1, Ordering::SeqCst);
            } else {
                STATE.store(0, Ordering::SeqCst);
            }

            supports_spantrace()
        }
        0 => false,
        1 => true,
        _ => unreachable!(),
    }
}

/// Conditionally add two opaque layers to the end,
/// as these catch the backtrace and spantrace if recorded.
pub fn expect_messages<'a>(messages: &[&'a str]) -> Vec<&'a str> {
    #[allow(unused_mut)]
    let mut messages = alloc::vec::Vec::from(messages);
    // the last entry should always be `Context`, `Backtrace` and `Spantrace`
    // are both added after the `Context` therefore we need to push those layers, then `Context`
    let last = messages.pop().unwrap();

    #[cfg(all(nightly, feature = "std"))]
    if supports_backtrace() {
        messages.push("Opaque");
    }

    #[cfg(feature = "spantrace")]
    if supports_spantrace() {
        messages.push("Opaque");
    }

    messages.push(last);
    messages
}

/// Conditionally add two new frames to the count, as these are backtrace and spantrace.
#[allow(unused_mut)]
pub fn expect_count(mut count: usize) -> usize {
    #[cfg(all(nightly, feature = "std"))]
    if supports_backtrace() {
        count += 1;
    }

    #[cfg(feature = "spantrace")]
    if supports_spantrace() {
        count += 1;
    }

    count
}

pub fn frame_kinds<E>(report: &Report<E>) -> Vec<FrameKind> {
    report.frames().map(Frame::kind).collect()
}
