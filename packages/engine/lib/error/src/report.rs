use alloc::boxed::Box;
use core::{fmt, fmt::Formatter, marker::PhantomData, panic::Location};
#[cfg(feature = "backtrace")]
use std::backtrace::{Backtrace, BacktraceStatus};
#[cfg(feature = "std")]
use std::error::Error as StdError;

#[cfg(feature = "spantrace")]
use tracing_error::{SpanTrace, SpanTraceStatus};

use super::Frame;
use crate::{Context, Frames, Message, Report, RequestRef, RequestValue};

#[allow(clippy::module_name_repetitions)]
pub struct ReportImpl {
    pub(super) frame: Frame,
    #[cfg(feature = "backtrace")]
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
            #[cfg(feature = "backtrace")]
            Some(Backtrace::capture()),
            #[cfg(feature = "spantrace")]
            Some(SpanTrace::capture()),
        )
    }
}

impl<C> Report<C> {
    fn from_frame(
        frame: Frame,
        #[cfg(feature = "backtrace")] backtrace: Option<Backtrace>,
        #[cfg(feature = "spantrace")] span_trace: Option<SpanTrace>,
    ) -> Self {
        Self {
            inner: Box::new(ReportImpl {
                frame,
                #[cfg(feature = "backtrace")]
                backtrace,
                #[cfg(feature = "spantrace")]
                span_trace,
            }),
            _context: PhantomData,
        }
    }

    /// Creates a new `Report<Context>` from a provided scope.
    #[track_caller]
    pub fn from_context(context: C) -> Self
    where
        C: Context,
    {
        #[allow(clippy::option_if_let_else)] // #[track_caller] on closures are unstable
        let location = if let Some(location) =
            provider::request_value::<&'static Location<'static>, _>(&context)
        {
            location
        } else {
            Location::caller()
        };

        #[cfg(feature = "backtrace")]
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
            #[cfg(feature = "backtrace")]
            backtrace,
            #[cfg(feature = "spantrace")]
            span_trace,
        )
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
            #[cfg(feature = "backtrace")]
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
            #[cfg(feature = "backtrace")]
            self.inner.backtrace,
            #[cfg(feature = "spantrace")]
            self.inner.span_trace,
        )
    }

    /// Converts the `Report<Context>` to `Report<()>` without modifying the frame stack.
    #[allow(clippy::missing_const_for_fn)] // False positive
    pub fn generalize(self) -> Report {
        Report {
            inner: self.inner,
            _context: PhantomData,
        }
    }

    /// Converts the `&Report<Context>` to `&Report<()>` without modifying the frame stack.
    pub const fn generalized(&self) -> &Report {
        // SAFETY: `Report` is repr(transparent), so it's safe to cast between `Report<A>` and
        //         `Report<B>`
        unsafe { &*(self as *const Self).cast() }
    }

    /// Returns the backtrace of the error, if captured.
    ///
    /// Note, that `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` has to be set to enable backtraces.
    ///
    /// [`ReportBackTrace`]: crate::tags::ReportBackTrace
    #[must_use]
    #[cfg(feature = "backtrace")]
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

    /// Creates an iterator over the [`Frame`] stack requesting references of type `T`.
    pub const fn request_ref<T: ?Sized + 'static>(&self) -> RequestRef<'_, T> {
        RequestRef::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting values of type `T`.
    pub const fn request_value<T: 'static>(&self) -> RequestValue<'_, T> {
        RequestValue::new(self)
    }

    /// Returns if `C` is the type held by any frame inside of the report.
    #[must_use]
    pub fn contains<C2>(&self) -> bool
    where
        C2: Context,
    {
        self.frames().any(Frame::is::<C2>)
    }

    /// Searches the frame stack for a context provider `C` and returns the most recent context
    /// found.
    #[must_use]
    pub fn downcast_ref<C2>(&self) -> Option<&C2>
    where
        C2: Context,
    {
        self.frames().find_map(Frame::downcast_ref::<C2>)
    }
}

impl<Context> fmt::Display for Report<Context> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "hooks")]
        if let Some(debug_hook) = crate::display_hook() {
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
        if let Some(debug_hook) = crate::debug_hook() {
            return debug_hook(self.generalized(), fmt);
        }

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

        Self::from_frame(
            Frame::from_std(error, Location::caller(), None),
            #[cfg(feature = "backtrace")]
            backtrace,
            #[cfg(feature = "spantrace")]
            Some(SpanTrace::capture()),
        )
    }
}
