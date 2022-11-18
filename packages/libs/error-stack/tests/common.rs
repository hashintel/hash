#![allow(dead_code)]

pub fn create_report() -> Report<RootError> {
    Report::new(RootError)
}

extern crate alloc;

pub use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use core::{any::TypeId, panic::Location};
#[allow(unused_imports)]
use core::{
    fmt,
    future::Future,
    iter,
    sync::atomic::{AtomicI8, Ordering},
};
#[cfg(all(rust_1_65, feature = "std"))]
use std::backtrace::Backtrace;

use error_stack::{AttachmentKind, Context, Frame, FrameKind, Report, Result};
#[allow(unused_imports)]
use once_cell::sync::Lazy;
#[cfg(feature = "spantrace")]
use tracing_error::SpanTrace;

#[derive(Debug, PartialEq, Eq)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("root error")
    }
}

impl Context for RootError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextA(pub u32);

impl fmt::Display for ContextA {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("context A")
    }
}

impl Context for ContextA {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut core::any::Demand<'a>) {
        demand.provide_ref(&self.0);
        demand.provide_value(self.0 as u64);
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct ContextB(pub i32);

impl fmt::Display for ContextB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("context B")
    }
}

impl Context for ContextB {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut core::any::Demand<'a>) {
        demand.provide_ref(&self.0);
        demand.provide_value(self.0 as i64);
    }
}

#[derive(Debug)]
#[cfg(feature = "spantrace")]
pub struct ErrorA(pub u32, SpanTrace);

#[cfg(feature = "spantrace")]
impl ErrorA {
    pub fn new(value: u32) -> Self {
        Self(value, SpanTrace::capture())
    }
}

#[cfg(feature = "spantrace")]
impl fmt::Display for ErrorA {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("error A")
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
        Self(value, Backtrace::force_capture())
    }
}

#[cfg(all(rust_1_65, feature = "std"))]
impl fmt::Display for ErrorB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("error B")
    }
}

#[cfg(all(nightly, feature = "std"))]
impl std::error::Error for ErrorB {
    fn provide<'a>(&'a self, demand: &mut core::any::Demand<'a>) {
        demand.provide_ref(&self.1);
    }
}

#[cfg(all(rust_1_65, feature = "std"))]
impl ErrorB {
    pub fn backtrace(&self) -> Option<&Backtrace> {
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
        fmt.write_str("printable A")
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct PrintableB(pub u32);

impl fmt::Display for PrintableB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("printable B")
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct PrintableC(pub u32);

impl fmt::Display for PrintableC {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("printable C: ")?;
        fmt::Display::fmt(&self.0, fmt)
    }
}

pub fn create_error() -> Result<(), RootError> {
    Err(create_report())
}

pub fn create_future() -> impl Future<Output = Result<(), RootError>> {
    futures::future::err(create_report())
}

pub fn capture_ok<E>(closure: impl FnOnce() -> Result<(), E>) {
    closure().expect("expected an OK value, found an error")
}

pub fn capture_error<E>(closure: impl FnOnce() -> Result<(), E>) -> Report<E> {
    closure().expect_err("expected an error")
}

pub fn messages<E>(report: &Report<E>) -> Vec<String> {
    report
        .frames()
        .map(|frame| match frame.kind() {
            FrameKind::Context(context) => context.to_string(),
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => attachment.to_string(),
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                #[cfg(all(rust_1_65, feature = "std"))]
                if frame.type_id() == TypeId::of::<Backtrace>() {
                    return String::from("Backtrace");
                }
                #[cfg(feature = "spantrace")]
                if frame.type_id() == TypeId::of::<SpanTrace>() {
                    return String::from("SpanTrace");
                }
                if frame.type_id() == TypeId::of::<Location>() {
                    String::from("Location")
                } else {
                    String::from("opaque")
                }
            }
            FrameKind::Attachment(_) => panic!("attachment was not covered"),
        })
        .collect()
}

pub fn frame_kinds<E>(report: &Report<E>) -> Vec<FrameKind> {
    remove_builtin_frames(report).map(Frame::kind).collect()
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

pub fn remove_builtin_messages<S: AsRef<str>>(
    messages: impl IntoIterator<Item = S>,
) -> Vec<String> {
    messages
        .into_iter()
        .filter_map(|message| {
            let message = message.as_ref();
            if message != "Location" && message != "Backtrace" && message != "SpanTrace" {
                Some(message.to_string())
            } else {
                None
            }
        })
        .collect()
}

pub fn remove_builtin_frames<E>(report: &Report<E>) -> impl Iterator<Item = &Frame> {
    report.frames().filter(|frame| {
        #[cfg(all(rust_1_65, feature = "std"))]
        if frame.type_id() == TypeId::of::<Backtrace>() {
            return false;
        }
        #[cfg(feature = "spantrace")]
        if frame.type_id() == TypeId::of::<SpanTrace>() {
            return false;
        }

        frame.type_id() != TypeId::of::<Location>()
    })
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

    count + 1
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
    ($report:ident, [
        $($pattern:pat_param),*
    ]) => {
        let kinds = remove_builtin_frames($report).map(|frame| frame.kind()).collect::<Vec<_>>();
        assert!(matches!(kinds.as_slice(), [$($pattern),*]));
    };
}
