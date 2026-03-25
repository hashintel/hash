use alloc::{boxed::Box, vec, vec::Vec};
use core::{error::Error, marker::PhantomData, mem, panic::Location};
#[cfg(feature = "backtrace")]
use std::backtrace::{Backtrace, BacktraceStatus};
#[cfg(feature = "std")]
use std::process::ExitCode;

#[cfg(feature = "spantrace")]
use tracing_error::{SpanTrace, SpanTraceStatus};

#[cfg(nightly)]
use crate::iter::{RequestRef, RequestValue};
use crate::{
    Attachment, Frame, OpaqueAttachment,
    context::SourceContext,
    iter::{Frames, FramesMut},
};

/// Contains a [`Frame`] stack consisting of [`Error`] contexts and attachments.
///
/// Attachments can be added by using [`attach_opaque()`]. The [`Frame`] stack can be iterated by
/// using [`frames()`].
///
/// When creating a `Report` by using [`new()`], the passed [`Error`] context is used to set the
/// _current context_ on the `Report`. To provide a new one, use [`change_context()`].
///
/// Attachments, and objects [`provide`]d by a [`Error`] context, are directly retrievable by
/// calling [`request_ref()`] or [`request_value()`].
///
/// ## Formatting
///
/// `Report` implements [`Display`] and [`Debug`]. When utilizing the [`Display`] implementation,
/// the current context of the `Report` is printed, e.g. `println!("{report}")`. For the alternate
/// [`Display`] output (`"{:#}"`), all [`Error`] contexts are printed. To print the full stack of
/// [`Error`] contexts and attachments, use the [`Debug`] implementation (`"{:?}"`). To customize
/// the output of the attachments in the [`Debug`] output, please see the [`error_stack::fmt`]
/// module.
///
/// Please see the examples below for more information.
///
/// [`Display`]: core::fmt::Display
/// [`error_stack::fmt`]: crate::fmt
///
/// ## Multiple Errors
///
/// `Report` comes in two variants: `Report<C>` which represents a single error context, and
/// `Report<[C]>` which can represent multiple error contexts. To combine multiple errors,
/// first convert a `Report<C>` to `Report<[C]>` using [`expand()`], then use [`push()`] to
/// add additional errors. This allows for representing complex error scenarios with multiple
/// related simultaneous errors.
///
/// [`expand()`]: Self::expand
/// [`push()`]: Self::push
///
/// ## `Backtrace` and `SpanTrace`
///
/// `Report` is able to [`provide`] a [`Backtrace`] and a [`SpanTrace`], which can be retrieved by
/// calling [`request_ref::<Backtrace>()`] or [`request_ref::<SpanTrace>()`]
/// ([`downcast_ref::<SpanTrace>()`] on stable) respectively. If the root context [`provide`]s a
/// [`Backtrace`] or a [`SpanTrace`], those are returned, otherwise, if configured, an attempt is
/// made to capture them when creating a `Report`. To enable capturing of the backtrace, make sure
/// `RUST_BACKTRACE` or `RUST_LIB_BACKTRACE` is set according to the [`Backtrace`
/// documentation][`Backtrace`]. To enable capturing of the span trace, an [`ErrorLayer`] has to be
/// enabled. Please also see the [Feature Flags] section. A single `Report` can have multiple
/// [`Backtrace`]s and [`SpanTrace`]s, depending on the amount of related errors the `Report`
/// consists of. Therefore it isn't guaranteed that [`request_ref()`] will only ever return a single
/// [`Backtrace`] or [`SpanTrace`].
///
/// [`provide`]: core::error::Error::provide
/// [`ErrorLayer`]: tracing_error::ErrorLayer
/// [`attach_opaque()`]: Self::attach
/// [`extend_one()`]: Self::extend_one
/// [`new()`]: Self::new
/// [`frames()`]: Self::frames
/// [`change_context()`]: Self::change_context
/// [`request_ref()`]: Self::request_ref
/// [`request_value()`]: Self::request_value
/// [`request_ref::<Backtrace>()`]: Self::request_ref
/// [`request_ref::<SpanTrace>()`]: Self::request_ref
/// [`downcast_ref::<SpanTrace>()`]: Self::downcast_ref
/// [Feature Flags]: index.html#feature-flags
///
/// # Examples
///
/// ## Provide a context for an error
///
/// ```rust
/// use error_stack::ResultExt;
///
/// # #[allow(dead_code)]
/// # fn fake_main() -> Result<String, error_stack::Report<std::io::Error>> {
/// let config_path = "./path/to/config.file";
/// let content = std::fs::read_to_string(config_path)
///     .attach_with(|| format!("failed to read config file {config_path:?}"))?;
///
/// # const _: &str = stringify! {
/// ...
/// # }; Ok(content) }
/// ```
///
/// ## Enforce a context for an error
///
/// ```rust
/// use std::{error::Error, fmt, path::{Path, PathBuf}};
///
/// use error_stack::{Report, ResultExt};
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
///     # fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///     # const _: &str = stringify! {
///     ...
///     # };
///     # let Self::InvalidConfig(path) = self;
///     # write!(fmt, "could not parse {path:?}")
///     # }
/// }
/// impl fmt::Display for ConfigError {
///     # fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
///     # const _: &str = stringify! {
///     ...
///     # };
///     # fmt.write_str("config file is invalid")
///     # }
/// }
///
/// impl Error for RuntimeError {}
/// impl Error for ConfigError {}
///
/// # #[allow(unused_variables)]
/// fn read_config(path: impl AsRef<Path>) -> Result<String, Report<ConfigError>> {
///     std::fs::read_to_string(path.as_ref()).change_context(ConfigError::IoError)
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
///     # let report = fake_main().unwrap_err();
///     # assert!(report.contains::<ConfigError>());
///     # assert_eq!(report.downcast_ref::<RuntimeError>(), Some(&RuntimeError::InvalidConfig(PathBuf::from("./path/to/config.file"))));
///     # Report::set_color_mode(error_stack::fmt::ColorMode::Emphasis);
///     # #[cfg(nightly)]
///     # fn render(value: String) -> String {
///     #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
///     #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
///     #
///     #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
///     #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
///     #
///     #     ansi_to_html::convert(value.as_ref()).unwrap()
///     # }
///     # #[cfg(nightly)]
///     # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_display__doc.snap")].assert_eq(&render(format!("{report}")));
///     # #[cfg(nightly)]
///     # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_display_alt__doc.snap")].assert_eq(&render(format!("{report:#}")));
///     # #[cfg(nightly)]
///     # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_debug__doc.snap")].assert_eq(&render(format!("{report:?}")));
///     # Ok(())
/// }
/// ```
///
/// ## Formatting
///
/// For the example from above, the report could be formatted as follows:
///
/// If the [`Display`] implementation of `Report` will be invoked, this will print something like:
/// <pre>
#[cfg_attr(doc, doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_display__doc.snap")))]
/// </pre>
///
/// If the alternate [`Display`] implementation of `Report` is invoked (`{report:#}`), this will
/// print something like:
/// <pre>
#[cfg_attr(doc, doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_display_alt__doc.snap")))]
/// </pre>
///
/// The [`Debug`] implementation of `Report` will print something like:
/// <pre>
#[cfg_attr(doc, doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_debug__doc.snap")))]
/// </pre>
///
///
/// ## Get the attached [`Backtrace`] and [`SpanTrace`]:
///
/// ```rust,should_panic
/// use error_stack::{ResultExt, Report};
///
/// # #[allow(unused_variables)]
/// # fn main() -> Result<(), Report<std::io::Error>> {
/// let config_path = "./path/to/config.file";
/// let content = std::fs::read_to_string(config_path)
///     .attach_with(|| format!("failed to read config file {config_path:?}"));
///
/// let content = match content {
///     Err(err) => {
///         # #[cfg(nightly)]
///         for backtrace in err.request_ref::<std::backtrace::Backtrace>() {
///             println!("backtrace: {backtrace}");
///         }
///
///         # #[cfg(nightly)]
///         for span_trace in err.request_ref::<tracing_error::SpanTrace>() {
///             println!("span trace: {span_trace}")
///         }
///
///         return Err(err)
///     }
///
///     Ok(ok) => ok
/// };
///
/// # const _: &str = stringify! {
/// ...
/// # }; Ok(())
/// # }
/// ```
#[must_use]
#[expect(clippy::field_scoped_visibility_modifiers)]
pub struct Report<C: ?Sized> {
    // The vector is boxed as this implies a memory footprint equal to a single pointer size
    // instead of three pointer sizes. Even for small `Result::Ok` variants, the `Result` would
    // still have at least the size of `Report`, even at the happy path. It's unexpected, that
    // creating or traversing a report will happen in the hot path, so a double indirection is
    // a good trade-off.
    #[expect(clippy::box_collection)]
    pub(super) frames: Box<Vec<Frame>>,
    _context: PhantomData<fn() -> *const C>,
}

impl<C> Report<C> {
    /// Creates a new `Report<Context>` from a provided scope.
    ///
    /// If `context` does not provide [`Backtrace`]/[`SpanTrace`] then this attempts to capture
    /// them directly. Please see the [`Backtrace` and `SpanTrace` section] of the `Report`
    /// documentation for more information.
    ///
    /// [`Backtrace` and `SpanTrace` section]: #backtrace-and-spantrace
    #[inline]
    #[track_caller]
    #[expect(clippy::missing_panics_doc, reason = "No panic possible")]
    pub fn new(context: C) -> Self
    where
        C: Error + Send + Sync + 'static,
    {
        if let Some(mut current_source) = context.source() {
            // The sources needs to be applied in reversed order, so we buffer them in a vector
            let mut sources = vec![SourceContext::from_error(current_source)];
            while let Some(source) = current_source.source() {
                sources.push(SourceContext::from_error(source));
                current_source = source;
            }

            // We create a new report with the oldest source as the base
            let mut report = Report::from_frame(Frame::from_context(
                sources.pop().expect("At least one context is guaranteed"),
                Box::new([]),
            ));
            // We then extend the report with the rest of the sources
            while let Some(source) = sources.pop() {
                report = report.change_context(source);
            }
            // Finally, we add the new context passed to this function
            return report.change_context(context);
        }

        // We don't have any sources, directly create the `Report` from the context
        Self::from_frame(Frame::from_context(context, Box::new([])))
    }

    #[track_caller]
    pub(crate) fn from_frame(frame: Frame) -> Self {
        #[cfg(nightly)]
        let location = core::error::request_ref::<Location>(&frame.as_error())
            .is_none()
            .then_some(Location::caller());

        #[cfg(not(nightly))]
        let location = Some(Location::caller());

        #[cfg(all(nightly, feature = "backtrace"))]
        let backtrace = core::error::request_ref::<Backtrace>(&frame.as_error())
            .is_none_or(|backtrace| backtrace.status() != BacktraceStatus::Captured)
            .then(Backtrace::capture);

        #[cfg(all(not(nightly), feature = "backtrace"))]
        let backtrace = Some(Backtrace::capture());

        #[cfg(all(nightly, feature = "spantrace"))]
        let span_trace = core::error::request_ref::<SpanTrace>(&frame.as_error())
            .is_none_or(|span_trace| span_trace.status() != SpanTraceStatus::CAPTURED)
            .then(SpanTrace::capture);

        #[cfg(all(not(nightly), feature = "spantrace"))]
        let span_trace = Some(SpanTrace::capture());

        let mut report = Self {
            frames: Box::new(vec![frame]),
            _context: PhantomData,
        };

        if let Some(location) = location {
            report = report.attach_opaque(*location);
        }

        #[cfg(feature = "backtrace")]
        if let Some(backtrace) =
            backtrace.filter(|bt| matches!(bt.status(), BacktraceStatus::Captured))
        {
            report = report.attach_opaque(backtrace);
        }

        #[cfg(feature = "spantrace")]
        if let Some(span_trace) = span_trace.filter(|st| st.status() == SpanTraceStatus::CAPTURED) {
            report = report.attach_opaque(span_trace);
        }

        report
    }

    /// Converts a `Report` with a single context into a `Report` with multiple contexts.
    ///
    /// This function allows for the transformation of a `Report<C>` into a `Report<[C]>`,
    /// enabling the report to potentially hold multiple current contexts of the same type.
    ///
    /// # Example
    ///
    /// ```
    /// use error_stack::Report;
    ///
    /// #[derive(Debug)]
    /// struct SystemFailure;
    ///
    /// impl std::fmt::Display for SystemFailure {
    ///     fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    ///         f.write_str("System failure occured")
    ///     }
    /// }
    ///
    /// impl core::error::Error for SystemFailure {}
    ///
    /// // Type annotations are used here to illustrate the types used, these are not required
    /// let failure: Report<SystemFailure> = Report::new(SystemFailure);
    /// let mut failures: Report<[SystemFailure]> = failure.expand();
    ///
    /// assert_eq!(failures.current_frames().len(), 1);
    ///
    /// let another_failure = Report::new(SystemFailure);
    /// failures.push(another_failure);
    ///
    /// assert_eq!(failures.current_frames().len(), 2);
    /// ```
    pub fn expand(self) -> Report<[C]> {
        Report {
            frames: self.frames,
            _context: PhantomData,
        }
    }

    /// Returns the direct current frames of this report.
    ///
    /// To get an iterator over the topological sorting of all frames refer to [`frames()`].
    ///
    /// This is not the same as [`Report::current_context`], this function gets the underlying
    /// frames that make up this report, while [`Report::current_context`] traverses the stack of
    /// frames to find the current context. A [`Report`] and be made up of multiple [`Frame`]s,
    /// which stack on top of each other. Considering `PrintableA<PrintableA<Context>>`,
    /// [`Report::current_frame`] will return the "outer" layer `PrintableA`, while
    /// [`Report::current_context`] will return the underlying `Error` (the current type
    /// parameter of this [`Report`]).
    ///
    /// A report can be made up of multiple stacks of frames and builds a "group" of them, this can
    /// be achieved through first calling [`Report::expand`] and then either using [`Extend`]
    /// or [`Report::push`].
    ///
    /// [`frames()`]: Self::frames
    #[must_use]
    pub fn current_frame(&self) -> &Frame {
        self.frames.first().unwrap_or_else(|| {
            unreachable!(
                "Report does not contain any frames. This should not happen as a Report must \
                 always contain at least one frame.\n\n
                 Please file an issue to https://github.com/hashintel/hash/issues/new?template=bug-report-error-stack.yml\n\n
                 Report:\n{self:?}",
            )
        })
    }

    /// Returns the current context of the `Report`.
    ///
    /// If the user want to get the latest context, `current_context` can be called. If the user
    /// wants to handle the error, the context can then be used to directly access the context's
    /// type. This is only possible for the latest context as the Report does not have multiple
    /// generics as this would either require variadic generics or a workaround like tuple-list.
    ///
    /// This is one disadvantage of the library in comparison to plain Errors, as in these cases,
    /// all context types are known.
    ///
    /// ## Example
    ///
    /// ```rust
    /// # use std::{fs, path::Path};
    /// # use error_stack::Report;
    /// use std::io;
    ///
    /// fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # };
    ///     # fs::read_to_string(path.as_ref()).map_err(Report::from)
    /// }
    ///
    /// let report = read_file("test.txt").unwrap_err();
    /// let io_error = report.current_context();
    /// assert_eq!(io_error.kind(), io::ErrorKind::NotFound);
    /// ```
    #[must_use]
    pub fn current_context(&self) -> &C
    where
        C: Send + Sync + 'static,
    {
        self.downcast_ref().unwrap_or_else(|| {
            // Panics if there isn't an attached context which matches `T`. As it's not possible to
            // create a `Report` without a valid context and this method can only be called when `T`
            // is a valid context, it's guaranteed that the context is available.
            unreachable!(
                "Report does not contain a context. This should not happen as a Report must \
                 always contain at least one frame.\n\n
                 Please file an issue to https://github.com/hashintel/hash/issues/new?template=bug-report-error-stack.yml\n\n
                 Report:\n{self:?}",
            )
        })
    }

    /// Converts this `Report` to an [`Error`].
    #[must_use]
    pub fn into_error(self) -> impl Error + Send + Sync + 'static
    where
        C: 'static,
    {
        crate::error::ReportError::new(self)
    }

    /// Returns this `Report` as an [`Error`].
    #[must_use]
    pub fn as_error(&self) -> &(impl Error + Send + Sync + 'static)
    where
        C: 'static,
    {
        crate::error::ReportError::from_ref(self)
    }
}

impl<C: ?Sized> Report<C> {
    /// Retrieves the current frames of the `Report`, regardless of its current type state.
    ///
    /// You should prefer using [`Report::current_frame`] or [`Report::current_frames`] instead of
    /// this function, as those properly interact with the type state of the `Report`.
    ///
    /// # Use Cases
    ///
    /// This function is primarily used to implement traits that require access to the frames,
    /// such as [`Debug`]. It allows for code reuse between `Report<C>` and `Report<[C]>`
    /// implementations without duplicating logic.
    #[must_use]
    pub(crate) fn current_frames_unchecked(&self) -> &[Frame] {
        &self.frames
    }

    /// Adds additional (printable) information to the [`Frame`] stack.
    ///
    /// This behaves like [`attach_opaque()`] but the display implementation will be called when
    /// printing the [`Report`].
    ///
    /// **Note:** [`attach_opaque()`] will be deprecated when specialization is stabilized and
    /// it becomes possible to merge these two methods.
    ///
    /// [`attach_opaque()`]: Self::attach
    ///
    /// ## Example
    ///
    /// ```rust
    /// use core::fmt;
    /// use std::fs;
    ///
    /// use error_stack::ResultExt;
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
    ///     .attach(Suggestion("better use a file which exists next time!"));
    /// # #[cfg_attr(not(nightly), allow(unused_variables))]
    /// let report = error.unwrap_err();
    /// # #[cfg(nightly)]
    /// let suggestion = report.request_ref::<Suggestion>().next().unwrap();
    ///
    /// # #[cfg(nightly)]
    /// assert_eq!(suggestion.0, "better use a file which exists next time!");
    /// ```
    #[track_caller]
    pub fn attach<A>(mut self, attachment: A) -> Self
    where
        A: Attachment,
    {
        let old_frames = mem::replace(self.frames.as_mut(), Vec::with_capacity(1));
        self.frames.push(Frame::from_printable_attachment(
            attachment,
            old_frames.into_boxed_slice(),
        ));
        self
    }

    /// Adds additional information to the [`Frame`] stack.
    ///
    /// This behaves like [`attach()`] but will not be shown when printing the [`Report`].
    /// To benefit from seeing attachments in normal error outputs, use [`attach()`].
    ///
    /// **Note:** This will be deprecated in favor of [`attach()`] when specialization is
    /// stabilized it becomes possible to merge these two methods.
    ///
    /// [`Display`]: core::fmt::Display
    /// [`Debug`]: core::fmt::Debug
    /// [`attach()`]: Self::attach
    #[track_caller]
    pub fn attach_opaque<A>(mut self, attachment: A) -> Self
    where
        A: OpaqueAttachment,
    {
        let old_frames = mem::replace(self.frames.as_mut(), Vec::with_capacity(1));
        self.frames.push(Frame::from_attachment(
            attachment,
            old_frames.into_boxed_slice(),
        ));
        self
    }

    /// Add a new [`Error`] object to the top of the [`Frame`] stack, changing the type of the
    /// `Report`.
    ///
    /// Please see the [`Error`] documentation for more information.
    #[track_caller]
    pub fn change_context<T>(mut self, context: T) -> Report<T>
    where
        T: Error + Send + Sync + 'static,
    {
        let old_frames = mem::replace(self.frames.as_mut(), Vec::with_capacity(1));
        let context_frame = vec![Frame::from_context(context, old_frames.into_boxed_slice())];
        self.frames.push(Frame::from_attachment(
            *Location::caller(),
            context_frame.into_boxed_slice(),
        ));
        Report {
            frames: self.frames,
            _context: PhantomData,
        }
    }

    /// Returns an iterator over the [`Frame`] stack of the report.
    pub fn frames(&self) -> Frames<'_> {
        Frames::new(&self.frames)
    }

    /// Returns an iterator over the [`Frame`] stack of the report with mutable elements.
    pub fn frames_mut(&mut self) -> FramesMut<'_> {
        FramesMut::new(&mut self.frames)
    }

    /// Creates an iterator of references of type `T` that have been [`attached`](Self::attach) or
    /// that are [`provide`](Error::provide)d by [`Error`] objects.
    #[cfg(nightly)]
    pub fn request_ref<T: ?Sized + Send + Sync + 'static>(&self) -> RequestRef<'_, T> {
        RequestRef::new(&self.frames)
    }

    /// Creates an iterator of values of type `T` that have been [`attached`](Self::attach) or
    /// that are [`provide`](Error::provide)d by [`Error`] objects.
    #[cfg(nightly)]
    pub fn request_value<T: Send + Sync + 'static>(&self) -> RequestValue<'_, T> {
        RequestValue::new(&self.frames)
    }

    /// Returns if `T` is the type held by any frame inside of the report.
    ///
    /// `T` could either be an attachment or a [`Error`] context.
    ///
    /// ## Example
    ///
    /// ```rust
    /// # use std::{fs, io, path::Path};
    /// # use error_stack::Report;
    /// fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # };
    ///     # fs::read_to_string(path.as_ref()).map_err(Report::from)
    /// }
    ///
    /// let report = read_file("test.txt").unwrap_err();
    /// assert!(report.contains::<io::Error>());
    /// ```
    #[must_use]
    pub fn contains<T: Send + Sync + 'static>(&self) -> bool {
        self.frames().any(Frame::is::<T>)
    }

    /// Searches the frame stack for a context provider `T` and returns the most recent context
    /// found.
    ///
    /// `T` can either be an attachment or a new [`Error`] context.
    ///
    /// ## Example
    ///
    /// ```rust
    /// # use std::{fs, path::Path};
    /// # use error_stack::Report;
    /// use std::io;
    ///
    /// fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # };
    ///     # fs::read_to_string(path.as_ref()).map_err(Report::from)
    /// }
    ///
    /// let report = read_file("test.txt").unwrap_err();
    /// let io_error = report.downcast_ref::<io::Error>().unwrap();
    /// assert_eq!(io_error.kind(), io::ErrorKind::NotFound);
    /// ```
    #[must_use]
    pub fn downcast_ref<T: Send + Sync + 'static>(&self) -> Option<&T> {
        self.frames().find_map(Frame::downcast_ref::<T>)
    }

    /// Searches the frame stack for an instance of type `T`, returning the most recent one found.
    ///
    /// `T` can either be an attachment or a new [`Error`] context.
    #[must_use]
    pub fn downcast_mut<T: Send + Sync + 'static>(&mut self) -> Option<&mut T> {
        self.frames_mut().find_map(Frame::downcast_mut::<T>)
    }
}

impl<C> Report<[C]> {
    /// Returns the direct current frames of this report.
    ///
    /// To get an iterator over the topological sorting of all frames refer to [`frames()`].
    ///
    /// This is not the same as [`Report::current_context`], this function gets the underlying
    /// frames that make up this report, while [`Report::current_context`] traverses the stack of
    /// frames to find the current context. A [`Report`] and be made up of multiple [`Frame`]s,
    /// which stack on top of each other. Considering `PrintableA<PrintableA<Context>>`,
    /// [`Report::current_frames`] will return the "outer" layer `PrintableA`, while
    /// [`Report::current_context`] will return the underlying `Error` (the current type
    /// parameter of this [`Report`]).
    ///
    /// Using [`Extend`], [`push()`] and [`append()`], a [`Report`] can additionally be made up of
    /// multiple stacks of frames and builds a "group" of them, therefore this function returns a
    /// slice instead, while [`Report::current_context`] only returns a single reference.
    ///
    /// [`push()`]: Self::push
    /// [`append()`]: Self::append
    /// [`frames()`]: Self::frames
    /// [`extend_one()`]: Self::extend_one
    #[must_use]
    pub fn current_frames(&self) -> &[Frame] {
        &self.frames
    }

    /// Pushes a new context to the `Report`.
    ///
    /// This function adds a new [`Frame`] to the current frames with the frame from the given
    /// [`Report`].
    ///
    /// [`current_frames()`]: Self::current_frames
    ///
    /// ## Example
    ///
    /// ```rust
    /// use std::{fmt, path::Path};
    ///
    /// use error_stack::{Report, ResultExt};
    ///
    /// #[derive(Debug)]
    /// struct IoError;
    ///
    /// impl fmt::Display for IoError {
    ///     # fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
    ///     #     const _: &str = stringify!(
    ///             ...
    ///     #     );
    ///     #     fmt.write_str("Io Error")
    ///     # }
    /// }
    ///
    /// # impl core::error::Error for IoError {}
    ///
    /// # #[allow(unused_variables)]
    /// fn read_config(path: impl AsRef<Path>) -> Result<String, Report<IoError>> {
    ///     # #[cfg(any(miri, not(feature = "std")))]
    ///     # return Err(error_stack::report!(IoError).attach("Not supported"));
    ///     # #[cfg(all(not(miri), feature = "std"))]
    ///     std::fs::read_to_string(path.as_ref())
    ///         .change_context(IoError)
    /// }
    ///
    /// let mut error1 = read_config("config.txt").unwrap_err().expand();
    /// let error2 = read_config("config2.txt").unwrap_err();
    /// let error3 = read_config("config3.txt").unwrap_err();
    ///
    /// error1.push(error2);
    /// error1.push(error3);
    /// ```
    pub fn push(&mut self, mut report: Report<C>) {
        self.frames.append(&mut report.frames);
    }

    /// Appends the frames from another `Report` to this one.
    ///
    /// This method combines the frames of the current `Report` with those of the provided `Report`,
    /// effectively merging the two error reports.
    ///
    /// ## Example
    ///
    /// ```rust
    /// use std::{fmt, path::Path};
    ///
    /// use error_stack::{Report, ResultExt};
    ///
    /// #[derive(Debug)]
    /// struct IoError;
    ///
    /// impl fmt::Display for IoError {
    ///     # fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
    ///     #     const _: &str = stringify!(
    ///             ...
    ///     #     );
    ///     #     fmt.write_str("Io Error")
    ///     # }
    /// }
    ///
    /// # impl core::error::Error for IoError {}
    ///
    /// # #[allow(unused_variables)]
    /// fn read_config(path: impl AsRef<Path>) -> Result<String, Report<IoError>> {
    ///     # #[cfg(any(miri, not(feature = "std")))]
    ///     # return Err(error_stack::report!(IoError).attach("Not supported"));
    ///     # #[cfg(all(not(miri), feature = "std"))]
    ///     std::fs::read_to_string(path.as_ref())
    ///         .change_context(IoError)
    /// }
    ///
    /// let mut error1 = read_config("config.txt").unwrap_err().expand();
    /// let error2 = read_config("config2.txt").unwrap_err();
    /// let mut error3 = read_config("config3.txt").unwrap_err().expand();
    ///
    /// error1.push(error2);
    /// error3.append(error1);
    /// ```
    pub fn append(&mut self, mut report: Self) {
        self.frames.append(&mut report.frames);
    }

    /// Returns an iterator over the current contexts of the `Report`.
    ///
    /// This method is similar to [`current_context`], but instead of returning a single context,
    /// it returns an iterator over all contexts in the `Report`.
    ///
    /// The order of the contexts should not be relied upon, as it is not guaranteed to be stable.
    ///
    /// ## Example
    ///
    /// ```rust
    /// # use std::{fs, path::Path};
    /// # use error_stack::Report;
    /// use std::io;
    ///
    /// fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # };
    ///     # fs::read_to_string(path.as_ref()).map_err(Report::from)
    /// }
    ///
    /// let mut a = read_file("test.txt").unwrap_err().expand();
    /// let b = read_file("test2.txt").unwrap_err();
    ///
    /// a.push(b);
    ///
    /// let io_error = a.current_contexts();
    /// assert_eq!(io_error.count(), 2);
    /// ```
    ///
    /// [`current_context`]: Self::current_context
    pub fn current_contexts(&self) -> impl Iterator<Item = &C>
    where
        C: Send + Sync + 'static,
    {
        // this needs a manual traveral implementation, why?
        // We know that each arm has a current context, but we don't know where that context is,
        // therefore we need to search for it on each branch, but stop once we found it, that way
        // we're able to return the current context, even if it is "buried" underneath a bunch of
        // attachments.
        let mut output = Vec::new();

        // this implementation does some "weaving" in a sense, it goes L->R for the frames, then
        // R->L for the sources, which means that some sources might be out of order, but this
        // simplifies implementation.
        let mut stack = vec![self.current_frames()];
        while let Some(frames) = stack.pop() {
            for frame in frames {
                // check if the frame is the current context, in that case we don't need to follow
                // the tree anymore
                if let Some(context) = frame.downcast_ref::<C>() {
                    output.push(context);
                    continue;
                }

                // descend into the tree
                let sources = frame.sources();
                match sources {
                    [] => unreachable!(
                        "Report does not contain a context. This is considered a bug and should be \
                        reported to https://github.com/hashintel/hash/issues/new/choose"
                    ),
                    sources => {
                        stack.push(sources);
                    }
                }
            }
        }

        output.into_iter()
    }
}

impl<C: 'static> From<Report<C>> for Box<dyn Error> {
    fn from(report: Report<C>) -> Self {
        Box::new(report.into_error())
    }
}

impl<C: 'static> From<Report<C>> for Box<dyn Error + Send> {
    fn from(report: Report<C>) -> Self {
        Box::new(report.into_error())
    }
}

impl<C: 'static> From<Report<C>> for Box<dyn Error + Sync> {
    fn from(report: Report<C>) -> Self {
        Box::new(report.into_error())
    }
}

impl<C: 'static> From<Report<C>> for Box<dyn Error + Send + Sync> {
    fn from(report: Report<C>) -> Self {
        Box::new(report.into_error())
    }
}

impl<C> From<Report<C>> for Report<[C]> {
    fn from(report: Report<C>) -> Self {
        Self {
            frames: report.frames,
            _context: PhantomData,
        }
    }
}

#[cfg(feature = "std")]
impl<C> std::process::Termination for Report<C> {
    fn report(self) -> ExitCode {
        #[cfg(not(nightly))]
        return ExitCode::FAILURE;

        #[cfg(nightly)]
        self.request_ref::<ExitCode>()
            .next()
            .copied()
            .unwrap_or(ExitCode::FAILURE)
    }
}

impl<C> FromIterator<Report<C>> for Option<Report<[C]>> {
    fn from_iter<T: IntoIterator<Item = Report<C>>>(iter: T) -> Self {
        let mut iter = iter.into_iter();

        let mut base = iter.next()?.expand();
        for rest in iter {
            base.push(rest);
        }

        Some(base)
    }
}

impl<C> FromIterator<Report<[C]>> for Option<Report<[C]>> {
    fn from_iter<T: IntoIterator<Item = Report<[C]>>>(iter: T) -> Self {
        let mut iter = iter.into_iter();

        let mut base = iter.next()?;
        for mut rest in iter {
            base.frames.append(&mut rest.frames);
        }

        Some(base)
    }
}

impl<C> Extend<Report<C>> for Report<[C]> {
    fn extend<T: IntoIterator<Item = Report<C>>>(&mut self, iter: T) {
        for item in iter {
            self.push(item);
        }
    }
}

impl<C> Extend<Self> for Report<[C]> {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for mut item in iter {
            self.frames.append(&mut item.frames);
        }
    }
}

/// Provides unified way to convert an error-like structure to a [`Report`].
///
/// This trait allows both [`Report<C>`] instances and regular error types to be converted into a
/// [`Report`]. It is automatically implemented for any type that can be converted into a [`Report`]
/// via the [`Into`] trait.
///
/// This trait is particularly useful when working with functions that need to return a [`Report`],
/// as it provides a consistent way to convert errors into reports without explicitly calling
/// conversion methods.
///
/// # Examples
///
/// ```rust
/// use std::io;
///
/// use error_stack::{IntoReport as _, Report};
///
/// # #[expect(dead_code)]
/// fn example() -> Result<(), Report<io::Error>> {
///     // io::Error implements Into<Report<io::Error>>, so we can use into_report()
///     let err = io::Error::new(io::ErrorKind::Other, "oh no!");
///     Err(err.into_report())
/// }
/// ```
pub trait IntoReport {
    /// The context type that will be used in the resulting [`Report`].
    type Context: ?Sized;

    /// Converts this value into a [`Report`].
    fn into_report(self) -> Report<Self::Context>;
}

impl<C: ?Sized> IntoReport for Report<C> {
    type Context = C;

    #[track_caller]
    fn into_report(self) -> Report<Self::Context> {
        self
    }
}

impl<E> IntoReport for E
where
    E: Into<Report<E>>,
{
    type Context = E;

    #[track_caller]
    fn into_report(self) -> Report<Self::Context> {
        self.into()
    }
}
