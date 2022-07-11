#![allow(dead_code)]

extern crate alloc;

pub use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use core::{
    fmt, iter,
    sync::atomic::{AtomicI8, Ordering},
};

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

#[cfg(all(nightly, feature = "std"))]
pub fn supports_backtrace() -> bool {
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
                true
            } else {
                STATE.store(0, Ordering::SeqCst);
                false
            }
        }
        0 => false,
        1 => true,
        _ => unreachable!(),
    }
}

#[cfg(feature = "spantrace")]
pub fn supports_spantrace() -> bool {
    static STATE: AtomicI8 = AtomicI8::new(-1);

    match STATE.load(Ordering::SeqCst) {
        -1 => {
            let st = tracing_error::SpanTrace::capture();
            if st.status() == tracing_error::SpanTraceStatus::CAPTURED {
                STATE.store(1, Ordering::SeqCst);
                true
            } else {
                STATE.store(0, Ordering::SeqCst);
                false
            }
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
#[allow(clippy::missing_const_for_fn)]
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

#[allow(unused_macros)]
macro_rules! assert_kinds {
    (#count,) => {0usize};
    (#count, $x:tt $($xs:tt)*) => {1usize + assert_kinds!(#count, $($xs)*)};

    ($report:ident, [
        $($prefix:pat_param),*
        => (trace)
        $($suffix:pat_param),*
    ]) => {
        let split_at = assert_kinds!(#count, $(($prefix))*);

        let kinds = frame_kinds($report);
        let (lhs, rhs) = kinds.split_at(split_at);

        assert!(matches!(lhs, [$($prefix),*]));

        let mut rhs = rhs.iter();

        #[cfg(all(nightly, feature = "std"))]
        if supports_backtrace() {
            assert!(matches!(
                rhs.next(),
                Some(FrameKind::Attachment(AttachmentKind::Opaque(_)))
            ));
        }

        #[cfg(feature = "spantrace")]
        if supports_spantrace() {
            assert!(matches!(
                rhs.next(),
                Some(FrameKind::Attachment(AttachmentKind::Opaque(_)))
            ));
        }

        $(
            assert!(matches!(rhs.next(), Some($suffix)));
        )*

        assert!(matches!(rhs.next(), None));
    };
}
