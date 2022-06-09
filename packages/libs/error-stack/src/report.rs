use alloc::{boxed::Box, string::ToString, vec::Vec};
use core::{fmt, marker::PhantomData, panic::Location};
#[cfg(all(nightly, feature = "std"))]
use std::backtrace::{Backtrace, BacktraceStatus};

#[cfg(feature = "spantrace")]
use tracing_error::{SpanTrace, SpanTraceStatus};

#[cfg(nightly)]
use crate::iter::{RequestRef, RequestValue};
#[cfg(all(nightly, any(feature = "std", feature = "spantrace")))]
use crate::{context::temporary_provider, provider::request_ref};
use crate::{
    iter::{Frames, FramesMut},
    AttachmentKind, Context, Frame, FrameKind,
};

/// Contains a [`Frame`] stack consisting of [`Context`]s and attachments.
///
/// Attachments can be added by using [`attach()`]. The [`Frame`] stack can be iterated by using
/// [`frames()`].
///
/// To enforce context information generation, a [`Context`] needs to be used. When creating a
/// `Report` by using [`new()`], the passed [`Context`] is used to set the _current
/// context_ on the `Report`. To provide a new one, use [`change_context()`], which may also be used
/// to provide more context information than only a display message. This information can then be
/// retrieved by calling [`request_ref()`] or [`request_value()`].
///
/// ## `Backtrace` and `SpanTrace`
///
/// `Report` is able to provide a [`Backtrace`] and a [`SpanTrace`], which can be retrieved by
/// calling [`backtrace()`] or [`span_trace()`] respectively. If the root context provides a
/// [`Backtrace`] or a [`SpanTrace`], those are returned, otherwise, if configured, they are tried
/// to be captured when creating a `Report`. To enable capturing of the backtrace, make sure
/// `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` is set according to the
/// [`Backtrace` documentation][`Backtrace`]. To enable capturing of the span trace, an
/// [`ErrorLayer`] has to be enabled. Please also see the [Feature Flags] section.
///
/// [`ErrorLayer`]: tracing_error::ErrorLayer
/// [`attach()`]: Self::attach
/// [`new()`]: Self::new
/// [`frames()`]: Self::frames
/// [`change_context()`]: Self::change_context
/// [`request_ref()`]: Self::request_ref
/// [`request_value()`]: Self::request_value
/// [`backtrace()`]: Self::backtrace
/// [`span_trace()`]: Self::span_trace
/// [Feature Flags]: index.html#feature-flags
///
/// # Examples
///
/// Provide a context for an error:
///
///
/// ```
/// # #[cfg(all(not(miri), feature = "std"))] {
/// use error_stack::{IntoReport, ResultExt, Result};
///
/// # fn fake_main() -> Result<String, std::io::Error> {
/// let config_path = "./path/to/config.file";
/// let content = std::fs::read_to_string(config_path)
///     .report()
///     .attach_printable_lazy(|| format!("Failed to read config file {config_path:?}"))?;
///
/// # const _: &str = stringify! {
/// ...
/// # }; Ok(content) }
/// # assert_eq!(fake_main().unwrap_err().frames().count(), 2);
/// # }
/// ```
///
/// Enforce a context for an error:
///
/// ```
/// use std::{fmt, path::{Path, PathBuf}};
///
/// # #[cfg_attr(any(miri, not(feature = "std")), allow(unused_imports))]
/// use error_stack::{Context, IntoReport, Report, ResultExt};
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
///     # return Err(error_stack::report!(ConfigError::IoError).attach_printable("Not supported"));
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
pub struct Report<C> {
    inner: Box<ReportImpl>,
    _context: PhantomData<C>,
}

impl<C> Report<C> {
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
    ///
    /// If `context` does not provide [`Backtrace`]/[`SpanTrace`] thy are attempted to be
    /// captured. Please see the [`Backtrace` and `SpanTrace` section] of the `Report`
    /// documentation for more information.
    ///
    /// [`Backtrace` and `SpanTrace` section]: #backtrace-and-spantrace
    #[track_caller]
    pub fn new(context: C) -> Self
    where
        C: Context,
    {
        #[cfg(all(nightly, any(feature = "std", feature = "spantrace")))]
        let provider = temporary_provider(&context);

        #[cfg(all(nightly, feature = "std"))]
        let backtrace = if request_ref::<Backtrace, _>(&provider).is_some() {
            None
        } else {
            Some(Backtrace::capture())
        };

        #[cfg(all(nightly, feature = "spantrace"))]
        let span_trace = if request_ref::<SpanTrace, _>(&provider).is_some() {
            None
        } else {
            Some(SpanTrace::capture())
        };
        #[cfg(all(not(nightly), feature = "spantrace"))]
        let span_trace = Some(SpanTrace::capture());

        // Context will be moved in the next statement, so we need to drop the temporary provider
        // first.
        #[cfg(all(nightly, any(feature = "std", feature = "spantrace")))]
        drop(provider);

        Self::from_frame(
            Frame::from_context(context, Location::caller(), None),
            #[cfg(all(nightly, feature = "std"))]
            backtrace,
            #[cfg(feature = "spantrace")]
            span_trace,
        )
    }

    /// Adds contextual information to the [`Frame`] stack.
    ///
    /// This behaves like [`attach_printable()`] but will not be shown when printing the [`Report`].
    ///
    /// **Note:** [`attach_printable()`] will be deprecated when specialization is stabilized.
    ///
    /// [`Display`]: core::fmt::Display
    /// [`Debug`]: core::fmt::Debug
    /// [`attach_printable()`]: Self::attach_printable
    #[track_caller]
    pub fn attach<A>(self, attachment: A) -> Self
    where
        A: Send + Sync + 'static,
    {
        Self::from_frame(
            Frame::from_attachment(
                attachment,
                Location::caller(),
                Some(Box::new(self.inner.frame)),
            ),
            #[cfg(all(nightly, feature = "std"))]
            self.inner.backtrace,
            #[cfg(feature = "spantrace")]
            self.inner.span_trace,
        )
    }

    /// Adds contextual information to the [`Frame`] stack.
    ///
    /// This behaves like [`attach()`] but will also be shown when printing the [`Report`].
    ///
    /// **Note:** This will be deprecated in favor of [`attach()`] when specialization is
    /// stabilized.
    ///
    /// [`attach()`]: Self::attach
    ///
    /// ## Example
    ///
    /// ```rust
    /// # #[cfg(all(feature = "std", not(miri)))] {
    /// use std::{fmt, fs};
    ///
    /// use error_stack::{IntoReport, ResultExt};
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
    /// let error = fs::read_to_string("config.txt")
    ///     .report()
    ///     .attach(Suggestion("Better use a file which exists next time!"));
    /// # #[cfg_attr(not(nightly), allow(unused_variables))]
    /// let report = error.unwrap_err();
    /// # #[cfg(nightly)]
    /// let suggestion = report.request_ref::<Suggestion>().next().unwrap();
    ///
    /// # #[cfg(nightly)]
    /// assert_eq!(suggestion.0, "Better use a file which exists next time!");
    /// # }
    #[track_caller]
    pub fn attach_printable<A>(self, attachment: A) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        Self::from_frame(
            Frame::from_printable_attachment(
                attachment,
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
    ///
    /// Please see the [`Context`] documentation for more information.
    #[track_caller]
    pub fn change_context<T>(self, context: T) -> Report<T>
    where
        T: Context,
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

    /// Returns an iterator over the [`FramesMut`] stack of the report.
    pub fn frames_mut(&mut self) -> FramesMut<'_> {
        FramesMut::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting references of type `R`.
    #[cfg(nightly)]
    pub const fn request_ref<T: ?Sized + Send + Sync + 'static>(&self) -> RequestRef<'_, T> {
        RequestRef::new(self)
    }

    /// Creates an iterator over the [`Frame`] stack requesting values of type `R`.
    #[cfg(nightly)]
    pub const fn request_value<T: Send + Sync + 'static>(&self) -> RequestValue<'_, T> {
        RequestValue::new(self)
    }

    /// Returns if `T` is the type held by any frame inside of the report.
    // TODO: Provide example
    #[must_use]
    pub fn contains<T: Send + Sync + 'static>(&self) -> bool {
        self.frames().any(Frame::is::<T>)
    }

    /// Searches the frame stack for a context provider `T` and returns the most recent context
    /// found.
    // TODO: Provide example
    #[must_use]
    pub fn downcast_ref<T: Send + Sync + 'static>(&self) -> Option<&T> {
        self.frames().find_map(Frame::downcast_ref::<T>)
    }

    /// Searches the frame stack for a context provider `T` and returns the most recent context
    /// found.
    // TODO: Provide example
    #[must_use]
    pub fn downcast_mut<T: Send + Sync + 'static>(&mut self) -> Option<&mut T> {
        self.frames_mut().find_map(Frame::downcast_mut::<T>)
    }

    pub(crate) const fn frame(&self) -> &Frame {
        &self.inner.frame
    }

    pub(crate) fn frame_mut(&mut self) -> &mut Frame {
        &mut self.inner.frame
    }
}

impl<T: Context> Report<T> {
    /// Returns the current context of the `Report`.
    ///
    /// If the user want to get the latest context, `current_context` can be called. If the user
    /// wants to handle the error, the context can then be used to directly access the context's
    /// type. This is only possible for the latest context as the Report does not have multiple
    /// generics as this would either require variadic generics or a workaround like tuple-list.
    ///
    /// This is one disadvantage of the library in comparison to plain Errors, as in these cases,
    /// all context types are known.
    #[must_use]
    #[allow(clippy::missing_panics_doc)] // Panicking here is a bug
    pub fn current_context(&self) -> &T
    where
        T: Send + Sync + 'static,
    {
        // Panics if there isn't an attached context which matches `T`. As it's not possible to
        // create a `Report` without a valid context and this method can only be called when `T` is
        // a valid context, it's guaranteed that the context is available when calling
        // `current_context`.
        self.downcast_ref().expect(
            "Report does not contain a context. This is considered a bug and should be reported \
             to https://github.com/hashintel/hash/issues/new",
        )
    }
}

impl<Context> fmt::Display for Report<Context> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        #[cfg(feature = "hooks")]
        if let Some(display_hook) = Report::display_hook() {
            return display_hook(self.generalized(), fmt);
        }

        for (index, frame) in self
            .frames()
            .filter_map(|frame| match frame.kind() {
                FrameKind::Context(context) => Some(context.to_string()),
                FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                    Some(attachment.to_string())
                }
                FrameKind::Attachment(AttachmentKind::Generic(_)) => None,
            })
            .enumerate()
        {
            if index == 0 {
                fmt::Display::fmt(&frame, fmt)?;
                if !fmt.alternate() {
                    break;
                }
            } else {
                write!(fmt, ": {frame}")?;
            }
        }

        Ok(())
    }
}

impl<Context> fmt::Debug for Report<Context> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
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
            let mut context_idx = -1;
            let mut attachments: Vec<_> = Vec::new();
            for frame in self.frames() {
                match frame.kind() {
                    FrameKind::Context(context) => {
                        if context_idx == -1 {
                            write!(fmt, "{context}")?;
                        } else {
                            if context_idx == 0 {
                                fmt.write_str("\n\nCaused by:")?;
                            }
                            write!(fmt, "\n   {context_idx}: {context}")?;
                        }
                        write!(fmt, "\n             at {}", frame.location())?;

                        #[allow(clippy::iter_with_drain)] // We re-use the vector
                        for attachment in attachments.drain(..) {
                            write!(fmt, "\n      - {attachment}")?;
                        }

                        context_idx += 1;
                    }
                    FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                        attachments.push(attachment);
                    }
                    FrameKind::Attachment(_) => (),
                }
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
