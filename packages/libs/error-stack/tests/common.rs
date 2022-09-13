#![allow(dead_code)]

extern crate alloc;

pub use alloc::{
    string::{String, ToString},
    vec::Vec,
};
#[allow(unused_imports)]
use core::{
    fmt,
    future::Future,
    iter,
    sync::atomic::{AtomicI8, Ordering},
};

use error_stack::{AttachmentKind, Context, Frame, FrameKind, Report, Result};
#[cfg(feature = "futures")]
use futures_core::Stream;
#[allow(unused_imports)]
use once_cell::sync::Lazy;

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
#[cfg(all(rust_1_65, feature = "std"))]
pub struct ErrorB(pub u32, std::backtrace::Backtrace);

#[cfg(all(rust_1_65, feature = "std"))]
impl ErrorB {
    pub fn new(value: u32) -> Self {
        Self(value, std::backtrace::Backtrace::force_capture())
    }
}

#[cfg(all(rust_1_65, feature = "std"))]
impl fmt::Display for ErrorB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Error B")
    }
}

#[cfg(all(rust_1_65, feature = "std"))]
impl std::error::Error for ErrorB {
    fn provide<'a>(&'a self, demand: &mut core::any::Demand<'a>) {
        demand.provide_ref(&self.1);
    }
}

#[cfg(all(rust_1_65, feature = "std"))]
impl ErrorB {
    pub fn backtrace(&self) -> Option<&std::backtrace::Backtrace> {
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

#[cfg(all(rust_1_65, feature = "std"))]
pub fn supports_backtrace() -> bool {
    static STATE: Lazy<bool> = Lazy::new(|| {
        let bt = std::backtrace::Backtrace::capture();
        bt.status() == std::backtrace::BacktraceStatus::Captured
    });

    *STATE
}

#[cfg(feature = "spantrace")]
pub fn supports_spantrace() -> bool {
    static STATE: Lazy<bool> = Lazy::new(|| {
        let st = tracing_error::SpanTrace::capture();
        st.status() == tracing_error::SpanTraceStatus::CAPTURED
    });

    *STATE
}

/// Conditionally add two opaque layers to the end,
/// as these catch the backtrace and spantrace if recorded.
pub fn expect_messages<'a>(messages: &[&'a str]) -> Vec<&'a str> {
    #[allow(unused_mut)]
    let mut messages = alloc::vec::Vec::from(messages);
    // the last entry should always be `Context`, `Backtrace` and `Spantrace`
    // are both added after the `Context` therefore we need to push those layers, then `Context`
    let last = messages.pop().unwrap();

    #[cfg(all(rust_1_65, feature = "std"))]
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
    #[cfg(all(rust_1_65, feature = "std"))]
    if supports_backtrace() {
        count += 1;
    }

    #[cfg(feature = "spantrace")]
    if supports_spantrace() {
        count += 1;
    }

    count
}

/// Helper macro used to match against the kinds.
///
/// Normally `assert(matches!(frames, [...]))` would be enough, but due to our architecture (we
/// conditionally create a `Backtrace` and `SpanTrace` layer).
/// We also need to check if those layers are present.
///
/// This isn't something can easily be done with a match statement,
/// due to the possible permutations, depending on the platform support and features enabled.
///
/// Therefore this macro generates logic to accommodate for that problem.
///
/// The input is
/// ```no_run
/// assert_kinds!(report, [
///     prefix_patterns
///     => (trace)
///     suffix_patterns
/// ])
/// ```
///
/// where `patterns` are normal match patterns, equivalent with the ones used as input in
/// `assert!(matches!(frames, [patterns]))`.
///
/// The place where `=> (trace)` is used is where this macro inserts additional conditional code
/// to test for backtrace and spantrace opaque layers.
///
/// This roughly compiles down to:
///
/// ```ignore
/// let kinds = frame_kinds(report);
/// let (lhs, rhs) = kinds.split_at(prefix_patterns.len());
///
/// assert!(matches!(kinds, prefix_patterns));
///
/// let rhs = rhs.into_iter();
///
/// if backtrace enabled and supported {
///     assert!(matches!(rhs.next()), Some(Opaque Layer))
/// }
///
/// if spantrace enabled and supported {
///     assert!(matches!(rhs.next()), Some(Opaque Layer))
/// }
///
/// for pattern in suffix_patterns {
///     assert!(matches!(rhs.next()), Some(pattern))
/// }
///
/// assert!(matches!(rhs.next()), None);
/// ```
///
/// This is simplified pseudo-code to illustrate how the macro works.
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

        #[cfg(all(rust_1_65, feature = "std"))]
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
