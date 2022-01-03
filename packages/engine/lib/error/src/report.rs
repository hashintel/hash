pub(super) use alloc::boxed::Box;
use core::{fmt, fmt::Formatter, marker::PhantomData, panic::Location};
#[cfg(feature = "backtrace")]
use std::backtrace::{Backtrace, BacktraceStatus};
#[cfg(feature = "std")]
use std::error::Error as StdError;

use provider::{
    tags::{Ref, Value},
    Provider, TypeTag,
};
#[cfg(feature = "spantrace")]
use tracing_error::{SpanTrace, SpanTraceStatus};

use super::{ErrorType, Frame};
use crate::{tags, Chain, Report, Request};

pub(super) struct ReportImpl {
    pub(super) error: Frame,
    #[cfg(feature = "backtrace")]
    backtrace: Option<Backtrace>,
    #[cfg(feature = "spantrace")]
    span_trace: Option<SpanTrace>,
}

impl Report {
    /// Creates a new `Report` from the provided message.
    // TODO: Specialize on trait `Provider` to remove `fn from_provider`
    #[track_caller]
    pub fn new(message: impl fmt::Display + fmt::Debug + Send + Sync + 'static) -> Self {
        Self::from_error_type(
            Location::caller(),
            #[cfg(feature = "backtrace")]
            Some(Backtrace::capture()),
            #[cfg(feature = "spantrace")]
            Some(SpanTrace::capture()),
            ErrorType::Message(Box::new(message)),
        )
    }
}

impl<S> Report<S> {
    fn from_error_type(
        location: &'static Location<'static>,
        #[cfg(feature = "backtrace")] backtrace: Option<Backtrace>,
        #[cfg(feature = "spantrace")] span_trace: Option<SpanTrace>,
        error: ErrorType,
    ) -> Self {
        Self {
            inner: Box::new(ReportImpl {
                #[cfg(feature = "backtrace")]
                backtrace,
                #[cfg(feature = "spantrace")]
                span_trace,
                error: Frame {
                    error,
                    location,
                    source: None,
                },
            }),
            _scope: PhantomData,
        }
    }

    /// Creates a new `Report<S>` from a provided scope.
    ///
    /// See the [`tags`] submodule for built-in [`TypeTag`]s used.
    #[track_caller]
    pub fn from_scope(provider: S) -> Self
    where
        S: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        let location = if let Some(location) =
            provider::request_by_type_tag::<'_, tags::FrameLocation, _>(&provider)
        {
            location
        } else {
            Location::caller()
        };
        #[cfg(feature = "backtrace")]
        let backtrace =
            if provider::request_by_type_tag::<'_, tags::ReportBackTrace, _>(&provider).is_some() {
                None
            } else {
                Some(Backtrace::capture())
            };
        #[cfg(feature = "spantrace")]
        let span_trace =
            if provider::request_by_type_tag::<'_, tags::ReportSpanTrace, _>(&provider).is_some() {
                None
            } else {
                Some(SpanTrace::capture())
            };
        Self::from_error_type(
            location,
            #[cfg(feature = "backtrace")]
            backtrace,
            #[cfg(feature = "spantrace")]
            span_trace,
            ErrorType::Provider(Box::new(provider)),
        )
    }

    #[track_caller]
    fn wrap_error_type<P>(self, error: ErrorType) -> Report<P> {
        Report {
            inner: Box::new(ReportImpl {
                #[cfg(feature = "backtrace")]
                backtrace: self.inner.backtrace,
                #[cfg(feature = "spantrace")]
                span_trace: self.inner.span_trace,
                error: Frame {
                    error,
                    location: Location::caller(),
                    source: Some(Box::new(self.inner.error)),
                },
            }),
            _scope: PhantomData,
        }
    }

    /// Adds `context` information to the [`Frame`] stack.
    // TODO: Specialize on trait `Provider` to remove `fn provide`
    #[track_caller]
    pub fn wrap<C>(self, context: C) -> Self
    where
        C: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        self.wrap_error_type(ErrorType::Message(Box::new(context)))
    }

    /// Adds `provider` to the [`Frame`] stack and changes the scope to `P`.
    #[track_caller]
    pub fn provide<P>(self, provider: P) -> Report<P>
    where
        P: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        self.wrap_error_type(ErrorType::Provider(Box::new(provider)))
    }

    /// Converts the `Report<S>` to `Report` without modifying the frame stack.
    pub fn leave_scope(self) -> Report {
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
    #[cfg_attr(doc, doc(cfg(feature = "backtrace")))]
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
    #[cfg_attr(doc, doc(cfg(feature = "spantrace")))]
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
    pub const fn chain(&self) -> Chain<'_> {
        Chain::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting the type specified by [`I::Type`].
    ///
    /// [`I::Type`]: provider::TypeTag::Type
    pub fn request<'p, I: 'static>(&'p self) -> Request<'p, I>
    where
        I: TypeTag<'p>,
    {
        Request::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting a reference of type `T`.
    pub const fn request_ref<T: ?Sized + 'static>(&self) -> Request<'_, Ref<T>> {
        Request::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting a value of type `T`.
    pub const fn request_value<T: 'static>(&self) -> Request<'_, Value<T>> {
        Request::new(self)
    }
}

impl<S> fmt::Display for Report<S> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        let mut chain = self.chain();
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
            debug.field("frames", &self.chain());
            #[cfg(feature = "backtrace")]
            debug.field("backtrace", &self.backtrace());
            debug.finish()
        } else {
            let mut chain = self.chain();
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
#[cfg_attr(doc, doc(cfg(feature = "std")))]
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
        Self::from_error_type(
            Location::caller(),
            #[cfg(feature = "backtrace")]
            backtrace,
            #[cfg(feature = "spantrace")]
            Some(SpanTrace::capture()),
            ErrorType::Error(Box::new(error)),
        )
    }
}
