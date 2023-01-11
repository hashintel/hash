use alloc::{boxed::Box, vec, vec::Vec};
#[cfg(nightly)]
use core::error::Error;
use core::{fmt, marker::PhantomData, mem, panic::Location};
#[cfg(all(rust_1_65, feature = "std"))]
use std::backtrace::{Backtrace, BacktraceStatus};
#[cfg(all(not(nightly), feature = "std"))]
use std::error::Error;
#[cfg(feature = "std")]
use std::process::ExitCode;

#[cfg(feature = "spantrace")]
use tracing_error::{SpanTrace, SpanTraceStatus};

#[cfg(nightly)]
use crate::iter::{RequestRef, RequestValue};
use crate::{
    iter::{Frames, FramesMut},
    Context, Frame,
};

/// Contains a [`Frame`] stack consisting of [`Context`]s and attachments.
///
/// Attachments can be added by using [`attach()`]. The [`Frame`] stack can be iterated by using
/// [`frames()`].
///
/// When creating a `Report` by using [`new()`], the passed [`Context`] is used to set the _current
/// context_ on the `Report`. To provide a new one, use [`change_context()`].
///
/// Attachments, and objects [`provide`]d by a [`Context`], are directly retrievable by calling
/// [`request_ref()`] or [`request_value()`].
///
/// ## Formatting
///
/// `Report` implements [`Display`] and [`Debug`]. When utilizing the [`Display`] implementation,
/// the current context of the `Report` is printed, e.g. `println!("{report}")`. For the alternate
/// [`Display`] output (`"{:#}"`), all [`Context`]s are printed. To print the full stack of
/// [`Context`]s and attachments, use the [`Debug`] implementation (`"{:?}"`). To customize the
/// output of the attachments in the [`Debug`] output, please see the [`error_stack::fmt`] module.
///
/// Please see the examples below for more information.
///
/// [`Display`]: fmt::Display
/// [`error_stack::fmt`]: crate::fmt
///
/// ## Multiple Errors
///
/// `Report` is able to represent multiple errors that have occurred. Errors can be combined using
/// the [`extend_one()`], which will add the [`Frame`] stack of the other error as an additional
/// source to the current report.
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
/// [`provide`]: core::any::Provider::provide
/// [`ErrorLayer`]: tracing_error::ErrorLayer
/// [`attach()`]: Self::attach
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
/// ```
/// # #[cfg(all(not(miri), feature = "std"))] {
/// use error_stack::{IntoReport, ResultExt, Result};
///
/// # #[allow(dead_code)]
/// # fn fake_main() -> Result<String, std::io::Error> {
/// let config_path = "./path/to/config.file";
/// let content = std::fs::read_to_string(config_path)
///     .into_report()
///     .attach_printable_lazy(|| format!("failed to read config file {config_path:?}"))?;
///
/// # const _: &str = stringify! {
/// ...
/// # }; Ok(content) }
/// # }
/// ```
///
/// ## Enforce a context for an error
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
/// impl Context for RuntimeError {}
/// impl Context for ConfigError {}
///
/// # #[allow(unused_variables)]
/// fn read_config(path: impl AsRef<Path>) -> Result<String, Report<ConfigError>> {
///     # #[cfg(any(miri, not(feature = "std")))]
///     # return Err(error_stack::report!(ConfigError::IoError).attach_printable("Not supported"));
///     # #[cfg(all(not(miri), feature = "std"))]
///     std::fs::read_to_string(path.as_ref()).into_report().change_context(ConfigError::IoError)
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
///     # owo_colors::set_override(true);
///     # #[cfg(rust_1_65)]
///     # fn render(value: String) -> String {
///     #     let backtrace = regex::Regex::new(r"backtrace no\. (\d+)\n(?:  .*\n)*  .*").unwrap();
///     #     let backtrace_info = regex::Regex::new(r"backtrace( with (\d+) frames)? \((\d+)\)").unwrap();
///     #
///     #     let value = backtrace.replace_all(&value, "backtrace no. $1\n  [redacted]");
///     #     let value = backtrace_info.replace_all(value.as_ref(), "backtrace ($3)");
///     #
///     #     ansi_to_html::convert_escaped(value.as_ref()).unwrap()
///     # }
///     # #[cfg(rust_1_65)]
///     # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_display__doc.snap")].assert_eq(&render(format!("{report}")));
///     # #[cfg(rust_1_65)]
///     # expect_test::expect_file![concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_display_alt__doc.snap")].assert_eq(&render(format!("{report:#}")));
///     # #[cfg(rust_1_65)]
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
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_display__doc.snap"))]
/// </pre>
///
/// If the alternate [`Display`] implementation of `Report` is invoked (`{report:#}`), this will
/// print something like:
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_display_alt__doc.snap"))]
/// </pre>
///
/// The [`Debug`] implementation of `Report` will print something like:
/// <pre>
#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/snapshots/doc/report_debug__doc.snap"))]
/// </pre>
///
///
/// ## Get the attached [`Backtrace`] and [`SpanTrace`]:
///
/// ```should_panic
/// use error_stack::{IntoReport, ResultExt, Result};
///
/// # #[allow(unused_variables)]
/// # fn main() -> Result<(), std::io::Error> {
/// let config_path = "./path/to/config.file";
/// let content = std::fs::read_to_string(config_path)
///     .into_report()
///     .attach_printable_lazy(|| format!("failed to read config file {config_path:?}"));
///
/// let content = match content {
///     Err(err) => {
///         # #[cfg(all(nightly, feature = "std"))]
///         for backtrace in err.request_ref::<std::backtrace::Backtrace>() {
///             println!("backtrace: {backtrace}");
///         }
///
///         # #[cfg(all(nightly, feature = "spantrace"))]
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
pub struct Report<C> {
    // The vector is boxed as this implies a memory footprint equal to a single pointer size
    // instead of three pointer sizes. Even for small `Result::Ok` variants, the `Result` would
    // still have at least the size of `Report`, even at the happy path. It's unexpected, that
    // creating or traversing a report will happen in the hot path, so a double indirection is
    // a good trade-off.
    #[allow(clippy::box_collection)]
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
    pub fn new(context: C) -> Self
    where
        C: Context,
    {
        Self::from_frame(Frame::from_context(context, Box::new([])))
    }

    #[track_caller]
    pub(crate) fn from_frame(frame: Frame) -> Self {
        #[cfg(nightly)]
        let location = core::any::request_ref::<Location>(&frame)
            .is_none()
            .then_some(Location::caller());

        #[cfg(not(nightly))]
        let location = Some(Location::caller());

        #[cfg(all(nightly, feature = "std"))]
        let backtrace = core::any::request_ref::<Backtrace>(&frame)
            .filter(|backtrace| backtrace.status() == BacktraceStatus::Captured)
            .is_none()
            .then(Backtrace::capture);

        #[cfg(all(rust_1_65, not(nightly), feature = "std"))]
        let backtrace = Some(Backtrace::capture());

        #[cfg(all(nightly, feature = "spantrace"))]
        let span_trace = core::any::request_ref::<SpanTrace>(&frame)
            .filter(|span_trace| span_trace.status() == SpanTraceStatus::CAPTURED)
            .is_none()
            .then(SpanTrace::capture);

        #[cfg(all(not(nightly), feature = "spantrace"))]
        let span_trace = Some(SpanTrace::capture());

        #[allow(unused_mut)]
        let mut report = Self {
            frames: Box::new(vec![frame]),
            _context: PhantomData,
        };

        if let Some(location) = location {
            report = report.attach(*location);
        }

        #[cfg(all(rust_1_65, feature = "std"))]
        if let Some(backtrace) =
            backtrace.filter(|bt| matches!(bt.status(), BacktraceStatus::Captured))
        {
            report = report.attach(backtrace);
        }

        #[cfg(feature = "spantrace")]
        if let Some(span_trace) = span_trace.filter(|st| st.status() == SpanTraceStatus::CAPTURED) {
            report = report.attach(span_trace);
        }

        report
    }

    /// Merge two [`Report`]s together
    ///
    /// This function appends the [`current_frames()`] of the other [`Report`] to the
    /// [`current_frames()`] of this report.
    /// Meaning `A.extend_one(B) -> A.current_frames() = A.current_frames() + B.current_frames()`
    ///
    /// [`current_frames()`]: Self::current_frames
    ///
    /// ```rust
    /// use std::{
    ///     fmt::{Display, Formatter},
    ///     path::Path,
    /// };
    ///
    /// use error_stack::{Context, Report, IntoReport, ResultExt};
    ///
    /// #[derive(Debug)]
    /// struct IoError;
    ///
    /// impl Display for IoError {
    ///     # fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
    ///     #     const _: &str = stringify!(
    ///             ...
    ///     #     );
    ///     #     f.write_str("Io Error")
    ///     # }
    /// }
    ///
    /// # impl Context for IoError {}
    ///
    /// # #[allow(unused_variables)]
    /// fn read_config(path: impl AsRef<Path>) -> Result<String, Report<IoError>> {
    ///     # #[cfg(any(miri, not(feature = "std")))]
    ///     # return Err(error_stack::report!(IoError).attach_printable("Not supported"));
    ///     # #[cfg(all(not(miri), feature = "std"))]
    ///     std::fs::read_to_string(path.as_ref())
    ///         .into_report()
    ///         .change_context(IoError)
    /// }
    ///
    /// let mut error1 = read_config("config.txt").unwrap_err();
    /// let error2 = read_config("config2.txt").unwrap_err();
    /// let mut error3 = read_config("config3.txt").unwrap_err();
    ///
    /// error1.extend_one(error2);
    /// error3.extend_one(error1);
    ///
    /// // ^ This is equivalent to:
    /// // error3.extend_one(error1);
    /// // error3.extend_one(error2);
    /// ```
    ///
    /// This function implements the same functionality as
    /// [`Extend::extend_one` (#7261)](https://github.com/rust-lang/rust/issues/72631).
    /// Once stabilised this function will be removed in favor of [`Extend`].
    ///
    /// [`extend_one()`]: Self::extend_one
    // TODO: once #7261 is stabilized deprecate and remove this function
    pub fn extend_one(&mut self, mut report: Self) {
        self.frames.append(&mut report.frames);
    }

    /// Adds additional information to the [`Frame`] stack.
    ///
    /// This behaves like [`attach_printable()`] but will not be shown when printing the [`Report`].
    /// To benefit from seeing attachments in normal error outputs, use [`attach_printable()`]
    ///
    /// **Note:** [`attach_printable()`] will be deprecated when specialization is stabilized and
    /// it becomes possible to merge these two methods.
    ///
    /// [`Display`]: core::fmt::Display
    /// [`Debug`]: core::fmt::Debug
    /// [`attach_printable()`]: Self::attach_printable
    #[track_caller]
    pub fn attach<A>(mut self, attachment: A) -> Self
    where
        A: Send + Sync + 'static,
    {
        let old_frames = mem::replace(self.frames.as_mut(), Vec::with_capacity(1));
        self.frames.push(Frame::from_attachment(
            attachment,
            old_frames.into_boxed_slice(),
        ));
        self
    }

    /// Adds additional (printable) information to the [`Frame`] stack.
    ///
    /// This behaves like [`attach()`] but the display implementation will be called when
    /// printing the [`Report`].
    ///
    /// **Note:** This will be deprecated in favor of [`attach()`] when specialization is
    /// stabilized it becomes possible to merge these two methods.
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
    ///     .into_report()
    ///     .attach(Suggestion("better use a file which exists next time!"));
    /// # #[cfg_attr(not(nightly), allow(unused_variables))]
    /// let report = error.unwrap_err();
    /// # #[cfg(nightly)]
    /// let suggestion = report.request_ref::<Suggestion>().next().unwrap();
    ///
    /// # #[cfg(nightly)]
    /// assert_eq!(suggestion.0, "better use a file which exists next time!");
    /// # }
    #[track_caller]
    pub fn attach_printable<A>(mut self, attachment: A) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        let old_frames = mem::replace(self.frames.as_mut(), Vec::with_capacity(1));
        self.frames.push(Frame::from_printable_attachment(
            attachment,
            old_frames.into_boxed_slice(),
        ));
        self
    }

    /// Add a new [`Context`] object to the top of the [`Frame`] stack, changing the type of the
    /// `Report`.
    ///
    /// Please see the [`Context`] documentation for more information.
    #[track_caller]
    pub fn change_context<T>(mut self, context: T) -> Report<T>
    where
        T: Context,
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

    /// Return the direct current frames of this report,
    /// to get an iterator over the topological sorting of all frames refer to [`frames()`]
    ///
    /// This is not the same as [`Report::current_context`], this function gets the underlying
    /// frames that make up this report, while [`Report::current_context`] traverses the stack of
    /// frames to find the current context. A [`Report`] and be made up of multiple [`Frame`]s,
    /// which stack on top of each other. Considering `PrintableA<PrintableA<Context>>`,
    /// [`Report::current_frames`] will return the "outer" layer `PrintableA`, while
    /// [`Report::current_context`] will return the underlying `Context` (the current type
    /// parameter of this [`Report`])
    ///
    /// Using [`Extend`] and [`extend_one()`], a [`Report`] can additionally be made up of multiple
    /// stacks of frames and builds a "group" of them, but a [`Report`] can only ever have a single
    /// `Context`, therefore this function returns a slice instead, while
    /// [`Report::current_context`] only returns a single reference.
    ///
    /// [`frames()`]: Self::frames
    /// [`extend_one()`]: Self::extend_one
    #[must_use]
    pub fn current_frames(&self) -> &[Frame] {
        &self.frames
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
    /// that are [`provide`](core::any::Provider::provide)d by [`Context`] objects.
    #[cfg(nightly)]
    pub fn request_ref<T: ?Sized + Send + Sync + 'static>(&self) -> RequestRef<'_, T> {
        RequestRef::new(&self.frames)
    }

    /// Creates an iterator of values of type `T` that have been [`attached`](Self::attach) or
    /// that are [`provide`](core::any::Provider::provide)d by [`Context`] objects.
    #[cfg(nightly)]
    pub fn request_value<T: Send + Sync + 'static>(&self) -> RequestValue<'_, T> {
        RequestValue::new(&self.frames)
    }

    /// Returns if `T` is the type held by any frame inside of the report.
    ///
    /// `T` could either be an attachment or a [`Context`].
    ///
    /// ## Example
    ///
    /// ```rust
    /// # #[cfg(all(not(miri), feature = "std"))] {
    /// # use std::{fs, io, path::Path};
    /// # use error_stack::{IntoReport, Report};
    /// fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # };
    ///     # fs::read_to_string(path.as_ref()).into_report()
    /// }
    ///
    /// let report = read_file("test.txt").unwrap_err();
    /// assert!(report.contains::<io::Error>());
    /// # }
    /// ```
    #[must_use]
    pub fn contains<T: Send + Sync + 'static>(&self) -> bool {
        self.frames().any(Frame::is::<T>)
    }

    /// Searches the frame stack for a context provider `T` and returns the most recent context
    /// found.
    ///
    /// `T` can either be an attachment or a [`Context`].
    ///
    /// ## Example
    ///
    /// ```rust
    /// # #[cfg(all(not(miri), feature = "std"))] {
    /// # use std::{fs, path::Path};
    /// # use error_stack::{IntoReport, Report};
    /// use std::io;
    ///
    /// fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # };
    ///     # fs::read_to_string(path.as_ref()).into_report()
    /// }
    ///
    /// let report = read_file("test.txt").unwrap_err();
    /// let io_error = report.downcast_ref::<io::Error>().unwrap();
    /// assert_eq!(io_error.kind(), io::ErrorKind::NotFound);
    /// # }
    /// ```
    #[must_use]
    pub fn downcast_ref<T: Send + Sync + 'static>(&self) -> Option<&T> {
        self.frames().find_map(Frame::downcast_ref::<T>)
    }

    /// Searches the frame stack for an instance of type `T`, returning the most recent one found.
    ///
    /// `T` can either be an attachment or a [`Context`].
    #[must_use]
    pub fn downcast_mut<T: Send + Sync + 'static>(&mut self) -> Option<&mut T> {
        self.frames_mut().find_map(Frame::downcast_mut::<T>)
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
    /// # #[cfg(all(not(miri), feature = "std"))] {
    /// # use std::{fs, path::Path};
    /// # use error_stack::{IntoReport, Report};
    /// use std::io;
    ///
    /// fn read_file(path: impl AsRef<Path>) -> Result<String, Report<io::Error>> {
    ///     # const _: &str = stringify! {
    ///     ...
    ///     # };
    ///     # fs::read_to_string(path.as_ref()).into_report()
    /// }
    ///
    /// let report = read_file("test.txt").unwrap_err();
    /// let io_error = report.current_context();
    /// assert_eq!(io_error.kind(), io::ErrorKind::NotFound);
    /// # }
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
                "Report does not contain a context. This is considered a bug and should be \
                reported to https://github.com/hashintel/hash/issues/new"
            );
        })
    }

    /// Converts this `Report` to an [`Error`].
    #[cfg(any(nightly, feature = "std"))]
    #[must_use]
    pub fn into_error(self) -> impl Error + Send + Sync + 'static
    where
        C: 'static,
    {
        crate::error::ReportError::new(self)
    }

    /// Returns this `Report` as an [`Error`].
    #[cfg(any(nightly, feature = "std"))]
    #[must_use]
    pub fn as_error(&self) -> &(impl Error + Send + Sync + 'static)
    where
        C: 'static,
    {
        crate::error::ReportError::from_ref(self)
    }
}

#[cfg(any(nightly, feature = "std"))]
impl<C: 'static> From<Report<C>> for Box<dyn Error> {
    fn from(report: Report<C>) -> Self {
        Box::new(report.into_error())
    }
}

#[cfg(any(nightly, feature = "std"))]
impl<C: 'static> From<Report<C>> for Box<dyn Error + Send> {
    fn from(report: Report<C>) -> Self {
        Box::new(report.into_error())
    }
}

#[cfg(any(nightly, feature = "std"))]
impl<C: 'static> From<Report<C>> for Box<dyn Error + Sync> {
    fn from(report: Report<C>) -> Self {
        Box::new(report.into_error())
    }
}

#[cfg(any(nightly, feature = "std"))]
impl<C: 'static> From<Report<C>> for Box<dyn Error + Send + Sync> {
    fn from(report: Report<C>) -> Self {
        Box::new(report.into_error())
    }
}

#[cfg(feature = "std")]
impl<Context> std::process::Termination for Report<Context> {
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

impl<Context> FromIterator<Report<Context>> for Option<Report<Context>> {
    fn from_iter<T: IntoIterator<Item = Report<Context>>>(iter: T) -> Self {
        let mut iter = iter.into_iter();

        let mut base = iter.next()?;
        for rest in iter {
            base.extend_one(rest);
        }

        Some(base)
    }
}

impl<Context> Extend<Self> for Report<Context> {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for item in iter {
            self.extend_one(item);
        }
    }
}
