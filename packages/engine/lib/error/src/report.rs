use alloc::boxed::Box;
use core::{any::Any, fmt, fmt::Formatter, marker::PhantomData, panic::Location};
#[cfg(all(nightly, feature = "std"))]
use std::backtrace::{Backtrace, BacktraceStatus};

#[cfg(feature = "spantrace")]
use tracing_error::{SpanTrace, SpanTraceStatus};

use super::Frame;
use crate::{iter::Frames, Context};
#[cfg(nightly)]
use crate::{
    iter::{RequestRef, RequestValue},
    provider::Provider,
};

/// Contains a [`Frame`] stack consisting of an original error, context information, and optionally
/// a [`Backtrace`] and a [`SpanTrace`].
///
/// To enable the backtrace, make sure `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` is set according to
/// the [`Backtrace` documentation][`Backtrace`]. To enable the span trace, [`ErrorLayer`] has to
/// be enabled.
///
/// Context information can be added by using [`attach_message()`] or [`ResultExt`]. The [`Frame`]
/// stack can be iterated by using [`frames()`].
///
/// To enforce context information generation, a context [`Provider`] needs to be used. When
/// creating a `Report` by using [`from_error()`] or [`from_context()`], the parameter is used as
/// context in the `Report`. To provide a new one, use [`change_context()`] or [`ResultExt`] to add
/// it, which may also be used to provide more context information than only a display message. This
/// information can then be retrieved by calling [`request_ref()`] or [`request_value()`].
///
/// [`Backtrace`]: std::backtrace::Backtrace
/// [`SpanTrace`]: tracing_error::SpanTrace
/// [`ErrorLayer`]: tracing_error::ErrorLayer
/// [`attach_message()`]: Self::attach_message
/// [`from_error()`]: Self::from_error
/// [`from_context()`]: Self::from_context
/// [`frames()`]: Self::frames
/// [`change_context()`]: Self::change_context
/// [`request_ref()`]: Self::request_ref
/// [`request_value()`]: Self::request_value
/// [`ResultExt`]: crate::ResultExt
/// [`Provider`]: crate::provider::Provider
///
/// # Examples
///
/// Provide a context for an error:
///
///
/// ```
/// # #![cfg_attr(any(miri, not(feature = "std")), allow(warnings))]
/// use error::{IntoReport, ResultExt, Result};
///
/// # #[allow(dead_code)]
/// # fn fake_main() -> Result<(), std::io::Error> {
/// let config_path = "./path/to/config.file";
/// # #[cfg(all(not(miri), feature = "std"))]
/// # #[allow(unused_variables)]
/// let content = std::fs::read_to_string(config_path)
///     .report()
///     .attach_message_lazy(|| format!("Failed to read config file {config_path:?}"))?;
///
/// # const _: &str = stringify! {
/// ...
/// # }; Ok(()) }
/// ```
///
/// Enforce a context for an error:
///
/// ```
/// use std::{fmt, path::{Path, PathBuf}};
///
/// # #[cfg_attr(any(miri, not(feature = "std")), allow(unused_imports))]
/// use error::{Context, IntoReport, Report, ResultExt};
///
/// #[derive(Debug)]
/// # #[derive(PartialEq)]
/// enum RuntimeError {
///     InvalidConfig(PathBuf),
/// # }
/// # const _: &str = stringify! {
///     ...
/// }
/// # ;
///
/// #[derive(Debug)]
/// enum ConfigError {
///     IoError,
/// # }
/// # const _: &str = stringify! {
///     ...
/// }
/// # ;
///
/// impl fmt::Display for RuntimeError {
///     # fn fmt(&self, _fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(())
///     # }
/// }
/// impl fmt::Display for ConfigError {
///     # fn fmt(&self, _fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(())
///     # }
/// }
///
/// impl Context for RuntimeError {}
/// impl Context for ConfigError {}
///
/// # #[allow(unused_variables)]
/// fn read_config(path: impl AsRef<Path>) -> Result<String, Report<ConfigError>> {
///     # #[cfg(any(miri, not(feature = "std")))]
///     # return Err(error::report!(ConfigError::IoError).attach_message("Not supported"));
///     # #[cfg(all(not(miri), feature = "std"))]
///     std::fs::read_to_string(path.as_ref()).report().change_context(ConfigError::IoError)
/// }
///
/// fn main() -> Result<(), Report<RuntimeError>> {
///     # fn fake_main() -> Result<(), Report<RuntimeError>> {
///     let config_path = "./path/to/config.file";
///     # #[allow(unused_variables)]
///     let config = read_config(config_path)
///             .change_context_lazy(|| RuntimeError::InvalidConfig(PathBuf::from(config_path)))?;
///
///     # const _: &str = stringify! {
///     ...
///     # };
///     # Ok(()) }
///     # let err = fake_main().unwrap_err();
///     # assert_eq!(err.frames().count(), 3);
///     # assert!(err.contains::<ConfigError>());
///     # assert_eq!(err.downcast_ref::<RuntimeError>(), Some(&RuntimeError::InvalidConfig(PathBuf::from("./path/to/config.file"))));
///     # Ok(())
/// }
/// ```
#[must_use]
#[repr(transparent)]
pub struct Report<T> {
    inner: Box<ReportImpl>,
    _context: PhantomData<T>,
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
        #[cfg(all(nightly, feature = "std"))]
        let backtrace = Some(Backtrace::capture());

        #[cfg(feature = "spantrace")]
        let span_trace = Some(SpanTrace::capture());

        Self::from_frame(
            Frame::from_context(context, Location::caller(), None),
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
        #[cfg(nightly)]
        let backtrace = if error.backtrace().is_some() {
            None
        } else {
            Some(std::backtrace::Backtrace::capture())
        };

        Self::from_frame(
            Frame::from_error(error, Location::caller(), None),
            #[cfg(nightly)]
            backtrace,
            #[cfg(feature = "spantrace")]
            Some(tracing_error::SpanTrace::capture()),
        )
    }

    /// Adds a contextual message to the [`Frame`] stack.
    #[track_caller]
    pub fn attach_message<M>(self, message: M) -> Self
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
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

    /// Adds a [`Provider`] to the [`Frame`] stack.
    ///
    /// The provider is used to [`provide`] values either by calling
    /// [`request_ref()`]/[`request_value()`] to return an iterator over all specified values, or by
    /// using the [`Provider`] implementation on a [`Frame`].
    ///
    /// [`provide`]: Provider::provide
    /// [`request_ref()`]: Self::request_ref
    /// [`request_value()`]: Self::request_value
    /// [`Frame`]: crate::Frame
    #[track_caller]
    #[cfg(nightly)]
    pub fn attach_provider<P>(self, provider: P) -> Self
    where
        P: Provider + fmt::Debug + fmt::Display + Send + Sync + 'static,
    {
        Self::from_frame(
            Frame::from_provider(
                provider,
                Location::caller(),
                Some(Box::new(self.inner.frame)),
            ),
            #[cfg(all(nightly, feature = "std"))]
            self.inner.backtrace,
            #[cfg(feature = "spantrace")]
            self.inner.span_trace,
        )
    }

    /// Adds the provided object to the [`Frame`] stack.
    ///
    /// The object can later be retrieved by calling [`request_ref()`].
    ///
    /// [`request_ref()`]: Self::request_ref
    /// [`Frame`]: crate::Frame
    ///
    /// ## Example
    ///
    /// ```rust
    /// # #![cfg_attr(not(feature = "std"), allow(unused_imports))]
    /// use std::{fmt, fs};
    ///
    /// use error::{IntoReport, ResultExt};
    ///
    /// #[derive(Debug)]
    /// pub struct Suggestion(&'static str);
    ///
    /// impl fmt::Display for Suggestion {
    ///     fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
    ///         fmt.write_str(self.0)
    ///     }
    /// }
    ///
    /// # #[derive(Debug)] struct NoStdError;
    /// # impl core::fmt::Display for NoStdError { fn fmt(&self, _: &mut std::fmt::Formatter<'_>) -> fmt::Result { Ok(()) }}
    /// # impl error::Context for NoStdError {}
    /// # #[cfg(any(not(feature = "std"), miri))]
    /// # let error: Result<(), _> = Err(error::report!(NoStdError).provide(Suggestion("Better use a file which exists next time!")));
    /// # #[cfg(all(feature = "std", not(miri)))]
    /// let error = fs::read_to_string("config.txt")
    ///     .report()
    ///     .provide(Suggestion("Better use a file which exists next time!"));
    /// let report = error.unwrap_err();
    /// let suggestion = report.request_ref::<Suggestion>().next().unwrap();
    ///
    /// assert_eq!(suggestion.0, "Better use a file which exists next time!");
    /// ```
    #[track_caller]
    #[cfg(nightly)]
    pub fn provide<P>(self, provided: P) -> Self
    where
        P: fmt::Debug + fmt::Display + Send + Sync + 'static,
    {
        self.attach_provider(crate::single_provider::SingleProvider(provided))
    }

    /// Adds context information to the [`Frame`] stack enforcing a typed `Report`.
    ///
    /// Please see the [`Context`] documentation for more information.
    #[track_caller]
    pub fn change_context<C>(self, context: C) -> Report<C>
    where
        C: Context,
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
    pub fn generalize(self) -> Report<()> {
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
        #[cfg(not(nightly))]
        let span_trace = self.inner.span_trace.as_ref()?;
        #[cfg(nightly)]
        let span_trace = self
            .inner
            .span_trace
            .as_ref()
            .or_else(|| self.request_ref::<SpanTrace>().next())?;

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
    #[cfg(nightly)]
    pub const fn request_ref<R: ?Sized + 'static>(&self) -> RequestRef<'_, R> {
        RequestRef::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting values of type `R`.
    #[cfg(nightly)]
    pub const fn request_value<R: 'static>(&self) -> RequestValue<'_, R> {
        RequestValue::new(self)
    }

    /// Returns if `T` is the type held by any frame inside of the report.
    // TODO: Provide example
    #[must_use]
    pub fn contains<A: Any>(&self) -> bool {
        self.frames().any(Frame::is::<A>)
    }

    /// Searches the frame stack for a context provider `T` and returns the most recent context
    /// found.
    // TODO: Provide example
    #[must_use]
    pub fn downcast_ref<A: Any>(&self) -> Option<&A> {
        self.frames().find_map(Frame::downcast_ref::<A>)
    }

    pub(crate) const fn frame(&self) -> &Frame {
        &self.inner.frame
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

pub struct ReportImpl {
    pub(super) frame: Frame,
    #[cfg(all(nightly, feature = "std"))]
    backtrace: Option<Backtrace>,
    #[cfg(feature = "spantrace")]
    span_trace: Option<SpanTrace>,
}
