#[cfg(all(not(target_arch = "wasm32"), feature = "std"))]
use core::panic::Location;
use core::{
    convert::Infallible,
    ops::{FromResidual, Try},
};

use crate::Report;

/// The `Bomb` type is used to enforce proper usage of `ReportSink` at runtime.
///
/// It addresses a limitation of the `#[must_use]` attribute, which becomes ineffective
/// when methods like `&mut self` are called, marking the value as used prematurely.
///
/// By moving this check to runtime, `Bomb` ensures that `ReportSink` is properly
/// consumed.
///
/// This runtime check complements the compile-time `#[must_use]` attribute,
/// providing a more robust mechanism to prevent `ReportSink` not being consumed.
#[derive(Debug)]
enum BombState {
    /// Panic if the `ReportSink` is dropped without being used.
    Panic,
    /// Emit a warning to stderr if the `ReportSink` is dropped without being used.
    Warn(#[cfg(all(not(target_arch = "wasm32"), feature = "std"))] &'static Location<'static>),
    /// Do nothing if the `ReportSink` is properly consumed.
    Defused,
}

impl Default for BombState {
    #[track_caller]
    fn default() -> Self {
        Self::Warn(
            #[cfg(all(not(target_arch = "wasm32"), feature = "std"))]
            Location::caller(),
        )
    }
}

#[derive(Debug, Default)]
struct Bomb(BombState);

impl Bomb {
    const fn panic() -> Self {
        Self(BombState::Panic)
    }

    #[track_caller]
    const fn warn() -> Self {
        Self(BombState::Warn(
            #[cfg(all(not(target_arch = "wasm32"), feature = "std"))]
            Location::caller(),
        ))
    }

    fn defuse(&mut self) {
        self.0 = BombState::Defused;
    }
}

impl Drop for Bomb {
    fn drop(&mut self) {
        // If we're in release mode, we don't need to do anything
        if !cfg!(debug_assertions) {
            return;
        }

        match self.0 {
            BombState::Panic => panic!("ReportSink was dropped without being consumed"),
            #[allow(clippy::print_stderr, unused_variables)]
            #[cfg(all(not(target_arch = "wasm32"), feature = "std"))]
            BombState::Warn(location) => {
                #[cfg(feature = "tracing")]
                tracing::warn!(
                    target: "error_stack",
                    %location,
                    "`ReportSink` was dropped without being consumed"
                );
                #[cfg(all(not(target_arch = "wasm32"), not(feature = "tracing"), feature = "std"))]
                eprintln!("`ReportSink` was dropped without being consumed at {location}");
            }
            _ => {}
        }
    }
}
/// A sink for collecting multiple [`Report`]s into a single [`Result`].
///
/// [`ReportSink`] allows you to accumulate multiple errors or reports and then
/// finalize them into a single `Result`. This is particularly useful when you
/// need to collect errors from multiple operations before deciding whether to
/// proceed or fail.
///
/// The sink is equipped with a "bomb" mechanism to ensure proper usage,
/// if the sink hasn't been finished when dropped, it will emit a warning or panic,
/// depending on the constructor used.
///
/// # Examples
///
/// ```
/// use error_stack::{ReportSink, Result};
///
/// #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
/// struct InternalError;
///
/// impl core::fmt::Display for InternalError {
///     fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
///         f.write_str("Internal error")
///     }
/// }
///
/// impl core::error::Error for InternalError {}
///
/// fn operation1() -> Result<u32, InternalError> {
///     // ...
///     # Ok(42)
/// }
///
/// fn operation2() -> Result<(), InternalError> {
///     // ...
///     # Ok(())
/// }
///
/// fn process_data() -> Result<(), [InternalError]> {
///     let mut sink = ReportSink::new();
///
///     if let Some(value) = sink.attempt(operation1()) {
///         // process value
///         # let _value = value;
///     }
///
///     if let Err(e) = operation2() {
///         sink.append(e);
///     }
///
///     sink.finish()
/// }
/// # let _result = process_data();
/// ```
#[must_use]
pub struct ReportSink<C> {
    report: Option<Report<[C]>>,
    bomb: Bomb,
}

impl<C> ReportSink<C> {
    /// Creates a new [`ReportSink`].
    ///
    /// If the sink hasn't been finished when dropped, it will emit a warning.
    #[track_caller]
    pub const fn new() -> Self {
        Self {
            report: None,
            bomb: Bomb::warn(),
        }
    }

    /// Creates a new [`ReportSink`].
    ///
    /// If the sink hasn't been finished when dropped, it will panic.
    pub const fn new_armed() -> Self {
        Self {
            report: None,
            bomb: Bomb::panic(),
        }
    }

    /// Adds a [`Report`] to the sink.
    ///
    /// # Examples
    ///
    /// ```
    /// # use error_stack::{ReportSink, Report};
    /// # use std::io;
    /// let mut sink = ReportSink::new();
    /// sink.append(Report::new(io::Error::new(
    ///     io::ErrorKind::Other,
    ///     "I/O error",
    /// )));
    /// ```
    pub fn append(&mut self, report: impl Into<Report<[C]>>) {
        let report = report.into();

        match self.report.as_mut() {
            Some(existing) => existing.append(report),
            None => self.report = Some(report),
        }
    }

    /// Captures a single error or report in the sink.
    ///
    /// This method is similar to [`append`], but allows for bare errors without prior [`Report`]
    /// creation.
    ///
    /// # Examples
    ///
    /// ```
    /// # use error_stack::ReportSink;
    /// # use std::io;
    /// let mut sink = ReportSink::new();
    /// sink.capture(io::Error::new(io::ErrorKind::Other, "I/O error"));
    /// ```
    ///
    /// [`append`]: ReportSink::append
    pub fn capture(&mut self, error: impl Into<Report<C>>) {
        let report = error.into();

        match self.report.as_mut() {
            Some(existing) => existing.push(report),
            None => self.report = Some(report.into()),
        }
    }

    /// Attempts to execute a fallible operation and collect any errors.
    ///
    /// This method takes a [`Result`] and returns an [`Option`]:
    /// - If the [`Result`] is [`Ok`], it returns [`Some(T)`] with the successful value.
    /// - If the [`Result`] is [`Err`], it captures the error in the sink and returns [`None`].
    ///
    /// This is useful for concisely handling operations that may fail, allowing you to
    /// collect errors while continuing execution.
    ///
    /// # Examples
    ///
    /// ```
    /// # use error_stack::ReportSink;
    /// # use std::io;
    /// fn fallible_operation() -> Result<u32, io::Error> {
    ///     // ...
    ///     # Ok(42)
    /// }
    ///
    /// let mut sink = ReportSink::new();
    /// let value = sink.attempt(fallible_operation());
    /// if let Some(v) = value {
    ///     // Use the successful value
    ///     # let _v = v;
    /// }
    /// // Any errors are now collected in the sink
    /// # let _result = sink.finish();
    /// ```
    pub fn attempt<T, R>(&mut self, result: Result<T, R>) -> Option<T>
    where
        R: Into<Report<C>>,
    {
        match result {
            Ok(value) => Some(value),
            Err(error) => {
                self.capture(error);
                None
            }
        }
    }

    /// Finishes the sink and returns a [`Result`].
    ///
    /// This method consumes the sink, and returns `Ok(())` if no errors
    /// were collected, or `Err(Report<[C]>)` containing all collected errors otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// # use error_stack::ReportSink;
    /// # use std::io;
    /// let mut sink = ReportSink::new();
    /// # // needed for type inference
    /// # sink.capture(io::Error::new(io::ErrorKind::Other, "I/O error"));
    /// // ... add errors ...
    /// let result = sink.finish();
    /// # let _result = result;
    /// ```
    pub fn finish(mut self) -> Result<(), Report<[C]>> {
        self.bomb.defuse();
        self.report.map_or(Ok(()), Err)
    }

    /// Finishes the sink and returns a [`Result`] with a custom success value.
    ///
    /// Similar to [`finish`], but allows specifying a function to generate the success value.
    ///
    /// # Examples
    ///
    /// ```
    /// # use error_stack::ReportSink;
    /// # use std::io;
    /// let mut sink = ReportSink::new();
    /// # // needed for type inference
    /// # sink.capture(io::Error::new(io::ErrorKind::Other, "I/O error"));
    /// // ... add errors ...
    /// let result = sink.finish_with(|| "Operation completed");
    /// # let _result = result;
    /// ```
    ///
    /// [`finish`]: ReportSink::finish
    pub fn finish_with<T>(mut self, ok: impl FnOnce() -> T) -> Result<T, Report<[C]>> {
        self.bomb.defuse();
        self.report.map_or_else(|| Ok(ok()), Err)
    }

    /// Finishes the sink and returns a [`Result`] with a default success value.
    ///
    /// Similar to [`finish`], but uses `T::default()` as the success value.
    ///
    /// # Examples
    ///
    /// ```
    /// # use error_stack::ReportSink;
    /// # use std::io;
    /// let mut sink = ReportSink::new();
    /// # // needed for type inference
    /// # sink.capture(io::Error::new(io::ErrorKind::Other, "I/O error"));
    /// // ... add errors ...
    /// let result: Result<Vec<String>, _> = sink.finish_default();
    /// # let _result = result;
    /// ```
    ///
    /// [`finish`]: ReportSink::finish
    pub fn finish_default<T: Default>(mut self) -> Result<T, Report<[C]>> {
        self.bomb.defuse();
        self.report.map_or_else(|| Ok(T::default()), Err)
    }

    /// Finishes the sink and returns a [`Result`] with a provided success value.
    ///
    /// Similar to [`finish`], but allows specifying a concrete value for the success case.
    ///
    /// # Examples
    ///
    /// ```
    /// # use error_stack::ReportSink;
    /// # use std::io;
    /// let mut sink = ReportSink::new();
    /// # // needed for type inference
    /// # sink.capture(io::Error::new(io::ErrorKind::Other, "I/O error"));
    /// // ... add errors ...
    /// let result = sink.finish_ok(42);
    /// # let _result = result;
    /// ```
    ///
    /// [`finish`]: ReportSink::finish
    pub fn finish_ok<T>(mut self, ok: T) -> Result<T, Report<[C]>> {
        self.bomb.defuse();
        self.report.map_or(Ok(ok), Err)
    }
}

impl<C> Default for ReportSink<C> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(nightly)]
impl<C> FromResidual for ReportSink<C> {
    fn from_residual(residual: <Self as Try>::Residual) -> Self {
        match residual {
            Err(report) => Self {
                report: Some(report),
                bomb: Bomb::default(),
            },
        }
    }
}

#[cfg(nightly)]
impl<C> Try for ReportSink<C> {
    type Output = ();
    // needs to be infallible, not `!` because of the `Try` of `Result`
    type Residual = Result<Infallible, Report<[C]>>;

    fn from_output((): ()) -> Self {
        Self {
            report: None,
            bomb: Bomb::default(),
        }
    }

    fn branch(mut self) -> core::ops::ControlFlow<Self::Residual, Self::Output> {
        self.bomb.defuse();
        self.report.map_or(
            core::ops::ControlFlow::Continue(()), //
            |report| core::ops::ControlFlow::Break(Err(report)),
        )
    }
}

#[cfg(test)]
mod test {
    use alloc::collections::BTreeSet;
    use core::fmt::Display;

    use crate::{Report, sink::ReportSink};

    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    struct TestError(u8);

    impl Display for TestError {
        fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            fmt.write_str("TestError(")?;
            core::fmt::Display::fmt(&self.0, fmt)?;
            fmt.write_str(")")
        }
    }

    impl core::error::Error for TestError {}

    #[test]
    fn add_single() {
        let mut sink = ReportSink::new();

        sink.append(Report::new(TestError(0)));

        let report = sink.finish().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 1);
        assert!(contexts.contains(&TestError(0)));
    }

    #[test]
    fn add_multiple() {
        let mut sink = ReportSink::new();

        sink.append(Report::new(TestError(0)));
        sink.append(Report::new(TestError(1)));

        let report = sink.finish().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn capture_single() {
        let mut sink = ReportSink::new();

        sink.capture(TestError(0));

        let report = sink.finish().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 1);
        assert!(contexts.contains(&TestError(0)));
    }

    #[test]
    fn capture_multiple() {
        let mut sink = ReportSink::new();

        sink.capture(TestError(0));
        sink.capture(TestError(1));

        let report = sink.finish().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn new_does_not_panic() {
        let _sink: ReportSink<TestError> = ReportSink::new();
    }

    #[cfg(nightly)]
    #[test]
    fn try_none() {
        fn sink() -> Result<(), Report<[TestError]>> {
            let sink = ReportSink::new();

            sink?;

            Ok(())
        }

        sink().expect("should not have failed");
    }

    #[cfg(nightly)]
    #[test]
    fn try_single() {
        fn sink() -> Result<(), Report<[TestError]>> {
            let mut sink = ReportSink::new();

            sink.append(Report::new(TestError(0)));

            sink?;
            Ok(())
        }

        let report = sink().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 1);
        assert!(contexts.contains(&TestError(0)));
    }

    #[cfg(nightly)]
    #[test]
    fn try_multiple() {
        fn sink() -> Result<(), Report<[TestError]>> {
            let mut sink = ReportSink::new();

            sink.append(Report::new(TestError(0)));
            sink.append(Report::new(TestError(1)));

            sink?;
            Ok(())
        }

        let report = sink().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[cfg(nightly)]
    #[test]
    fn try_arbitrary_return() {
        fn sink() -> Result<u8, Report<[TestError]>> {
            let mut sink = ReportSink::new();

            sink.append(Report::new(TestError(0)));

            sink?;
            Ok(8)
        }

        let report = sink().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 1);
        assert!(contexts.contains(&TestError(0)));
    }

    #[test]
    #[should_panic(expected = "without being consumed")]
    fn panic_on_unused() {
        #[allow(clippy::unnecessary_wraps)]
        fn sink() -> Result<(), Report<[TestError]>> {
            let mut sink = ReportSink::new_armed();

            sink.append(Report::new(TestError(0)));

            Ok(())
        }

        let _result = sink();
    }

    #[test]
    fn panic_on_unused_with_defuse() {
        #[allow(clippy::unnecessary_wraps)]
        fn sink() -> Result<(), Report<[TestError]>> {
            let mut sink = ReportSink::new_armed();

            sink.append(Report::new(TestError(0)));

            sink?;
            Ok(())
        }

        let report = sink().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 1);
        assert!(contexts.contains(&TestError(0)));
    }

    #[test]
    fn finish() {
        let mut sink = ReportSink::new();

        sink.append(Report::new(TestError(0)));
        sink.append(Report::new(TestError(1)));

        let report = sink.finish().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn finish_ok() {
        let sink: ReportSink<TestError> = ReportSink::new();

        sink.finish().expect("should have succeeded");
    }

    #[test]
    fn finish_with() {
        let mut sink = ReportSink::new();

        sink.append(Report::new(TestError(0)));
        sink.append(Report::new(TestError(1)));

        let report = sink.finish_with(|| 8).expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn finish_with_ok() {
        let sink: ReportSink<TestError> = ReportSink::new();

        let value = sink.finish_with(|| 8).expect("should have succeeded");
        assert_eq!(value, 8);
    }

    #[test]
    fn finish_default() {
        let mut sink = ReportSink::new();

        sink.append(Report::new(TestError(0)));
        sink.append(Report::new(TestError(1)));

        let report = sink.finish_default::<u8>().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn finish_default_ok() {
        let sink: ReportSink<TestError> = ReportSink::new();

        let value = sink.finish_default::<u8>().expect("should have succeeded");
        assert_eq!(value, 0);
    }

    #[test]
    fn finish_with_value() {
        let mut sink = ReportSink::new();

        sink.append(Report::new(TestError(0)));
        sink.append(Report::new(TestError(1)));

        let report = sink.finish_ok(8).expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn finish_with_value_ok() {
        let sink: ReportSink<TestError> = ReportSink::new();

        let value = sink.finish_ok(8).expect("should have succeeded");
        assert_eq!(value, 8);
    }
}
