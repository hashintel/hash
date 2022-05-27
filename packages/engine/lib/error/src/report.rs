use alloc::boxed::Box;
use core::{any::Any, fmt, fmt::Formatter, marker::PhantomData, panic::Location};
#[cfg(all(nightly, feature = "std"))]
use std::backtrace::{Backtrace, BacktraceStatus};

#[cfg(feature = "spantrace")]
use tracing_error::{SpanTrace, SpanTraceStatus};

use super::Frame;
use crate::{
    iter::{Frames, RequestRef, RequestValue},
    Context, Message, Report,
};

pub struct ReportImpl {
    pub(super) frame: Frame,
    #[cfg(all(nightly, feature = "std"))]
    backtrace: Option<Backtrace>,
    #[cfg(feature = "spantrace")]
    span_trace: Option<SpanTrace>,
}

impl Report<()> {
    /// Creates a new `Report` from the provided message.
    #[track_caller]
    pub fn new<M>(message: M) -> Self
    where
        M: Message,
    {
        // SAFETY: `FrameRepr` is wrapped in `ManuallyDrop`
        Self::from_frame(
            Frame::from_message(message, Location::caller(), None),
            #[cfg(all(nightly, feature = "std"))]
            Some(Backtrace::capture()),
            #[cfg(feature = "spantrace")]
            Some(SpanTrace::capture()),
        )
    }
}

impl<T> Report<T> {
    pub(crate) fn from_frame(
        frame: Frame,
        #[cfg(all(nightly, feature = "std"))] backtrace: Option<Backtrace>,
        #[cfg(feature = "spantrace")] span_trace: Option<SpanTrace>,
    ) -> Self {
        Self {
            inner: Box::new(ReportImpl {
                frame,
                #[cfg(all(nightly, feature = "std"))]
                backtrace,
                #[cfg(feature = "spantrace")]
                span_trace,
            }),
            _context: PhantomData,
        }
    }

    /// Creates a new `Report<Context>` from a provided scope.
    #[track_caller]
    pub fn from_context(context: T) -> Self
    where
        T: Context,
    {
        #[allow(clippy::option_if_let_else)] // #[track_caller] on closures are unstable
        let location = if let Some(location) =
            provider::request_value::<&'static Location<'static>, _>(&context)
        {
            location
        } else {
            Location::caller()
        };

        #[cfg(all(nightly, feature = "std"))]
        let backtrace = if provider::request_ref::<Backtrace, _>(&context).is_some() {
            None
        } else {
            Some(Backtrace::capture())
        };

        #[cfg(feature = "spantrace")]
        let span_trace = if provider::request_ref::<SpanTrace, _>(&context).is_some() {
            None
        } else {
            Some(SpanTrace::capture())
        };

        Self::from_frame(
            Frame::from_context(context, location, None),
            #[cfg(all(nightly, feature = "std"))]
            backtrace,
            #[cfg(feature = "spantrace")]
            span_trace,
        )
    }

    /// Creates a new `Report<T>` from the provided [`Error`].
    ///
    /// [`Error`]: std::error::Error
    #[track_caller]
    #[cfg(feature = "std")]
    pub fn from_error(error: T) -> Self
    where
        T: std::error::Error + Send + Sync + 'static,
    {
        Self::from(error)
    }

    /// Adds a contextual message to the [`Frame`] stack.
    #[track_caller]
    pub fn wrap<M>(self, message: M) -> Self
    where
        M: Message,
    {
        Self::from_frame(
            Frame::from_message(
                message,
                Location::caller(),
                Some(Box::new(self.inner.frame)),
            ),
            #[cfg(all(nightly, feature = "std"))]
            self.inner.backtrace,
            #[cfg(feature = "spantrace")]
            self.inner.span_trace,
        )
    }

    /// Adds context information to the [`Frame`] stack enforcing a typed `Report`.
    #[track_caller]
    pub fn provide_context<C2>(self, context: C2) -> Report<C2>
    where
        C2: Context,
    {
        Report::from_frame(
            Frame::from_context(
                context,
                Location::caller(),
                Some(Box::new(self.inner.frame)),
            ),
            #[cfg(all(nightly, feature = "std"))]
            self.inner.backtrace,
            #[cfg(feature = "spantrace")]
            self.inner.span_trace,
        )
    }

    /// Converts the `Report<T>` to `Report<()>` without modifying the frame stack.
    #[doc(hidden)]
    #[allow(clippy::missing_const_for_fn)] // False positive
    pub fn generalize(self) -> Report {
        Report {
            inner: self.inner,
            _context: PhantomData,
        }
    }

    /// Returns the backtrace of the error, if captured.
    ///
    /// Note, that `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` has to be set to enable backtraces.
    ///
    /// [`ReportBackTrace`]: crate::tags::ReportBackTrace
    #[must_use]
    #[cfg(all(nightly, feature = "std"))]
    pub fn backtrace(&self) -> Option<&Backtrace> {
        let backtrace = self.inner.backtrace.as_ref().unwrap_or_else(|| {
            // Should never panic as it's either stored inside of `Report` or is provided by a frame
            self.request_ref::<Backtrace>()
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
    #[must_use]
    #[cfg(feature = "spantrace")]
    pub fn span_trace(&self) -> Option<&SpanTrace> {
        let span_trace = self.inner.span_trace.as_ref().unwrap_or_else(|| {
            // Should never panic as it's either stored inside of `Report` or is provided by a frame
            self.request_ref::<SpanTrace>()
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
    pub const fn frames(&self) -> Frames<'_> {
        Frames::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting references of type `R`.
    pub const fn request_ref<R: ?Sized + 'static>(&self) -> RequestRef<'_, R> {
        RequestRef::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting values of type `R`.
    pub const fn request_value<R: 'static>(&self) -> RequestValue<'_, R> {
        RequestValue::new(self)
    }

    /// Returns if `T` is the type held by any frame inside of the report.
    // TODO: Provide example
    #[must_use]
    pub fn contains<C: Any>(&self) -> bool {
        self.frames().any(Frame::is::<C>)
    }

    /// Searches the frame stack for a context provider `T` and returns the most recent context
    /// found.
    // TODO: Provide example
    #[must_use]
    pub fn downcast_ref<C: Any>(&self) -> Option<&C> {
        self.frames().find_map(Frame::downcast_ref::<C>)
    }
}

impl<Context> fmt::Display for Report<Context> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "hooks")]
        if let Some(debug_hook) = Report::display_hook() {
            return debug_hook(self.generalized(), fmt);
        }

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

impl<Context> fmt::Debug for Report<Context> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "hooks")]
        if let Some(debug_hook) = Report::debug_hook() {
            return debug_hook(self.generalized(), fmt);
        }

        if fmt.alternate() {
            let mut debug = fmt.debug_struct("Report");
            debug.field("frames", &self.frames());
            #[cfg(all(nightly, feature = "std"))]
            debug.field("backtrace", &self.backtrace());
            #[cfg(feature = "spantrace")]
            debug.field("span_trace", &self.span_trace());
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

            #[cfg(all(nightly, feature = "std"))]
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
