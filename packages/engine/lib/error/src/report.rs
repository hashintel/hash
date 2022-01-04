pub(super) use alloc::boxed::Box;
use core::{fmt, fmt::Formatter, marker::PhantomData, panic::Location};
#[cfg(feature = "backtrace")]
use std::backtrace::{Backtrace, BacktraceStatus};
#[cfg(feature = "std")]
use std::error::Error as StdError;

use provider::{
    tags::{Ref, Value},
    TypeTag,
};
#[cfg(feature = "spantrace")]
use tracing_error::{SpanTrace, SpanTraceStatus};

use super::{Error, Frame};
use crate::{tags, Context, ErrorKind, FrameStack, Report, RequestStack};

pub(super) struct ReportImpl {
    pub(super) frame: Frame,
    #[cfg(feature = "backtrace")]
    backtrace: Option<Backtrace>,
    #[cfg(feature = "spantrace")]
    span_trace: Option<SpanTrace>,
}

impl Report {
    /// Creates a new `Report` from the provided message.
    // TODO: Specialize on trait `Provider` to remove `fn from_provider`
    #[track_caller]
    pub fn new<C>(context: C) -> Self
    where
        C: Context,
    {
        Self::from_error(
            Location::caller(),
            #[cfg(feature = "backtrace")]
            Some(Backtrace::capture()),
            #[cfg(feature = "spantrace")]
            Some(SpanTrace::capture()),
            Error::Context(Box::new(context)),
        )
    }
}

impl<S> Report<S> {
    fn from_error(
        location: &'static Location<'static>,
        #[cfg(feature = "backtrace")] backtrace: Option<Backtrace>,
        #[cfg(feature = "spantrace")] span_trace: Option<SpanTrace>,
        error: Error,
    ) -> Self {
        Self {
            inner: Box::new(ReportImpl {
                #[cfg(feature = "backtrace")]
                backtrace,
                #[cfg(feature = "spantrace")]
                span_trace,
                frame: Frame {
                    error,
                    location,
                    source: None,
                },
            }),
            _scope: PhantomData,
        }
    }

    /// Creates a new `Report<S>` from a provided scope.
    #[track_caller]
    pub fn with_error_kind<E>(error_kind: E) -> Self
    where
        E: ErrorKind,
    {
        let error = Error::Kind(Box::new(error_kind));
        #[allow(clippy::option_if_let_else)] // #[track_caller] on closures are unstable
        let location = if let Some(location) =
            provider::request_by_type_tag::<'_, tags::FrameLocation, _>(&error)
        {
            location
        } else {
            Location::caller()
        };
        #[cfg(feature = "backtrace")]
        let backtrace =
            if provider::request_by_type_tag::<'_, tags::ReportBackTrace, _>(&error).is_some() {
                None
            } else {
                Some(Backtrace::capture())
            };
        #[cfg(feature = "spantrace")]
        let span_trace =
            if provider::request_by_type_tag::<'_, tags::ReportSpanTrace, _>(&error).is_some() {
                None
            } else {
                Some(SpanTrace::capture())
            };
        Self::from_error(
            location,
            #[cfg(feature = "backtrace")]
            backtrace,
            #[cfg(feature = "spantrace")]
            span_trace,
            error,
        )
    }

    #[track_caller]
    fn wrap<P>(self, error: Error) -> Report<P> {
        Report {
            inner: Box::new(ReportImpl {
                #[cfg(feature = "backtrace")]
                backtrace: self.inner.backtrace,
                #[cfg(feature = "spantrace")]
                span_trace: self.inner.span_trace,
                frame: Frame {
                    error,
                    location: Location::caller(),
                    source: Some(Box::new(self.inner.frame)),
                },
            }),
            _scope: PhantomData,
        }
    }

    /// Adds `context` information to the [`Frame`] stack.
    // TODO: Specialize on trait `Provider` to remove `fn provide`
    #[track_caller]
    pub fn context<C>(self, context: C) -> Self
    where
        C: Context,
    {
        self.wrap(Error::Context(Box::new(context)))
    }

    /// Adds `provider` to the [`Frame`] stack and changes the scope to `P`.
    #[track_caller]
    pub fn error_kind<E>(self, error_kind: E) -> Report<E>
    where
        E: ErrorKind,
    {
        self.wrap(Error::Kind(Box::new(error_kind)))
    }

    /// Converts the `Report<S>` to `Report` without modifying the frame stack.
    #[allow(clippy::missing_const_for_fn)] // False positive
    pub fn compat(self) -> Report {
        Report {
            inner: self.inner,
            _scope: PhantomData,
        }
    }

    /// Returns the backtrace of the error, if captured.
    ///
    /// Note, that `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` has to be set to enable backtraces.
    ///
    /// [`ReportBackTrace`]: crate::tags::ReportBackTrace
    #[cfg(feature = "backtrace")]
    pub fn backtrace(&self) -> Option<&Backtrace> {
        let backtrace = self.inner.backtrace.as_ref().unwrap_or_else(|| {
            // Should never panic as it's either stored inside of `Report` or is provided by a frame
            self.request::<tags::ReportBackTrace>()
                .next()
                .expect("Backtrace is not available")
        });
        if backtrace.status() == BacktraceStatus::Captured {
            Some(backtrace)
        } else {
            None
        }
    }

    /// Returns the span trace of the error, if captured.
    ///
    /// Note, that [`ErrorLayer`] has to be enabled to enable span traces.
    ///
    /// [`ReportSpanTrace`]: crate::tags::ReportSpanTrace
    /// [`ErrorLayer`]: tracing_error::ErrorLayer
    #[cfg(feature = "spantrace")]
    pub fn span_trace(&self) -> Option<&SpanTrace> {
        let span_trace = self.inner.span_trace.as_ref().unwrap_or_else(|| {
            // Should never panic as it's either stored inside of `Report` or is provided by a frame
            self.request::<tags::ReportSpanTrace>()
                .next()
                .expect("SpanTrace is not available")
        });
        if span_trace.status() == SpanTraceStatus::CAPTURED {
            Some(span_trace)
        } else {
            None
        }
    }

    /// Returns an iterator over the [`Frame`] stack of the report.
    pub const fn frames(&self) -> FrameStack<'_> {
        FrameStack::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting the type specified by [`I::Type`].
    ///
    /// [`I::Type`]: provider::TypeTag::Type
    pub fn request<'p, I: 'static>(&'p self) -> RequestStack<'p, I>
    where
        I: TypeTag<'p>,
    {
        RequestStack::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting a reference of type `T`.
    pub const fn request_ref<T: ?Sized + 'static>(&self) -> RequestStack<'_, Ref<T>> {
        RequestStack::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting a value of type `T`.
    pub const fn request_value<T: 'static>(&self) -> RequestStack<'_, Value<T>> {
        RequestStack::new(self)
    }
}

impl<S> fmt::Display for Report<S> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        let mut chain = self.frames();
        let error = chain.next().expect("No error occurred");
        fmt::Display::fmt(&error, fmt)?;
        if let Some(cause) = chain.next() {
            if fmt.alternate() {
                write!(fmt, ": {cause}")?;
            }
        }
        Ok(())
    }
}

impl<S> fmt::Debug for Report<S> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        if fmt.alternate() {
            let mut debug = fmt.debug_struct("Report");
            debug.field("frames", &self.frames());
            #[cfg(feature = "backtrace")]
            debug.field("backtrace", &self.backtrace());
            debug.finish()
        } else {
            let mut chain = self.frames();
            let error = chain.next().expect("No error occurred");
            write!(fmt, "{error}")?;
            write!(fmt, "\n             at {}", error.location())?;

            for (idx, frame) in chain.enumerate() {
                if idx == 0 {
                    fmt.write_str("\n\nCaused by:")?;
                }
                write!(fmt, "\n   {idx}: {frame}")?;
                write!(fmt, "\n             at {}", frame.location())?;
            }

            #[cfg(feature = "backtrace")]
            if let Some(backtrace) = self.backtrace() {
                write!(fmt, "\n\nStack backtrace:\n{backtrace}")?;
            }

            #[cfg(feature = "spantrace")]
            if let Some(span_trace) = self.span_trace() {
                write!(fmt, "\n\nSpan trace:\n{span_trace}")?;
            }

            Ok(())
        }
    }
}

#[cfg(feature = "std")]
impl<E> From<E> for Report
where
    E: StdError + Send + Sync + 'static,
{
    #[track_caller]
    fn from(error: E) -> Self {
        #[cfg(feature = "backtrace")]
        let backtrace = if error.backtrace().is_some() {
            None
        } else {
            Some(Backtrace::capture())
        };
        Self::from_error(
            Location::caller(),
            #[cfg(feature = "backtrace")]
            backtrace,
            #[cfg(feature = "spantrace")]
            Some(SpanTrace::capture()),
            Error::Std(Box::new(error)),
        )
    }
}
