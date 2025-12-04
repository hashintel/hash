#![allow(dead_code, unreachable_pub, unused_attributes)]
#![cfg_attr(
    nightly,
    feature(error_generic_member_access),
    allow(clippy::incompatible_msrv)
)]

pub fn create_report() -> Report<RootError> {
    Report::new(RootError)
}

extern crate alloc;

use core::{any::TypeId, panic::Location};
#[expect(unused_imports)]
use core::{
    error::Error,
    fmt,
    future::Future,
    iter,
    sync::atomic::{AtomicI8, Ordering},
};
#[cfg(feature = "backtrace")]
use std::backtrace::Backtrace;
#[cfg(all(feature = "std", any(feature = "backtrace", feature = "spantrace")))]
use std::sync::LazyLock;

use error_stack::{AttachmentKind, Frame, FrameKind, Report};
#[cfg(all(
    not(feature = "std"),
    any(feature = "backtrace", feature = "spantrace")
))]
use once_cell::sync::Lazy as LazyLock;
#[cfg(feature = "spantrace")]
use tracing_error::SpanTrace;

#[derive(Debug, PartialEq, Eq)]
pub struct RootError;

impl fmt::Display for RootError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("root error")
    }
}

impl Error for RootError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextA(pub u32);

impl fmt::Display for ContextA {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("context A")
    }
}

impl Error for ContextA {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_ref(&self.0);
        request.provide_value(u64::from(self.0));
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct ContextB(pub i32);

impl fmt::Display for ContextB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("context B")
    }
}

impl Error for ContextB {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_ref(&self.0);
        request.provide_value(i64::from(self.0));
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
impl Error for ErrorA {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_ref(&self.1);
    }
}

#[derive(Debug)]
#[cfg(feature = "backtrace")]
pub struct ErrorB(pub u32, std::backtrace::Backtrace);

#[cfg(feature = "backtrace")]
impl ErrorB {
    pub fn new(value: u32) -> Self {
        Self(value, Backtrace::force_capture())
    }
}

#[cfg(feature = "backtrace")]
impl fmt::Display for ErrorB {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("error B")
    }
}

#[cfg(feature = "backtrace")]
impl Error for ErrorB {
    fn provide<'a>(&'a self, request: &mut core::error::Request<'a>) {
        request.provide_ref(&self.1);
    }
}

#[cfg(feature = "backtrace")]
impl ErrorB {
    pub const fn backtrace(&self) -> &Backtrace {
        &self.1
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

pub fn create_error() -> Result<(), Report<RootError>> {
    Err(create_report())
}

pub fn create_future() -> impl Future<Output = Result<(), Report<RootError>>> {
    futures::future::err(create_report())
}

pub fn capture_ok<E>(closure: impl FnOnce() -> Result<(), Report<E>>) {
    closure().expect("expected an OK value, found an error");
}

pub fn capture_error<E>(closure: impl FnOnce() -> Result<(), Report<E>>) -> Report<E> {
    closure().expect_err("expected an error")
}

pub fn messages<E>(report: &Report<E>) -> Vec<String> {
    report
        .frames()
        .map(|frame| match frame.kind() {
            FrameKind::Context(context) => context.to_string(),
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => attachment.to_string(),
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                #[cfg(feature = "backtrace")]
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

pub fn frame_kinds<E>(report: &Report<E>) -> Vec<FrameKind<'_>> {
    remove_builtin_frames(report).map(Frame::kind).collect()
}

#[cfg(feature = "backtrace")]
pub fn supports_backtrace() -> bool {
    static STATE: LazyLock<bool> = LazyLock::new(|| {
        let bt = std::backtrace::Backtrace::capture();
        bt.status() == std::backtrace::BacktraceStatus::Captured
    });

    *STATE
}

#[cfg(feature = "spantrace")]
pub fn supports_spantrace() -> bool {
    static STATE: LazyLock<bool> = LazyLock::new(|| {
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
            #[expect(clippy::if_then_some_else_none, reason = "complexity + readability")]
            if message != "Location" && message != "Backtrace" && message != "SpanTrace" {
                Some(message.to_owned())
            } else {
                None
            }
        })
        .collect()
}

pub fn remove_builtin_frames<E>(report: &Report<E>) -> impl Iterator<Item = &Frame> {
    report.frames().filter(|frame| {
        #[cfg(feature = "backtrace")]
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
#[cfg_attr(
    not(any(feature = "backtrace", feature = "spantrace")),
    expect(clippy::missing_const_for_fn, unused_mut)
)]
pub fn expect_count(mut count: usize) -> usize {
    #[cfg(feature = "backtrace")]
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
/// The input is:
///
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
#[expect(
    clippy::allow_attributes,
    reason = "It's not possible to avoid this warning"
)]
#[allow(unused_macros, reason = "Only used in some tests")]
macro_rules! assert_kinds {
    ($report:ident, [
        $($pattern:pat_param),*
    ]) => {
        let kinds = remove_builtin_frames($report).map(|frame| frame.kind()).collect::<Vec<_>>();
        assert!(matches!(kinds.as_slice(), [$($pattern),*]));
    };
}
