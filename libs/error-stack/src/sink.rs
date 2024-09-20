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
/// consumed. Depending on its configuration, it will either:
/// - Panic if the `ReportSink` is dropped without being used (when set to `Panic` mode)
/// - Emit a warning to stderr (when in `Warn` mode, which is the default)
/// - Do nothing if properly defused (i.e., when `ReportSink` is correctly used)
///
/// This runtime check complements the compile-time `#[must_use]` attribute,
/// providing a more robust mechanism to prevent `ReportSink` not being consumed.
#[derive(Debug, Default)]
enum Bomb {
    Panic,
    #[default]
    Warn,
    Defused,
}

impl Bomb {
    fn defuse(&mut self) {
        *self = Self::Defused;
    }
}

impl Drop for Bomb {
    fn drop(&mut self) {
        // If we're in release mode, we don't need to do anything
        if !cfg!(debug_assertions) {
            return;
        }

        match self {
            Self::Panic => panic!("ReportSink was dropped without being consumed"),
            #[allow(clippy::print_stderr)]
            Self::Warn => {
                eprintln!("ReportSink was dropped without being consumed");
            }
            Self::Defused => {}
        }
    }
}

#[must_use]
pub struct ReportSink<C> {
    report: Option<Report<[C]>>,
    bomb: Bomb,
}

impl<C> ReportSink<C> {
    pub const fn new() -> Self {
        Self {
            report: None,
            bomb: Bomb::Warn,
        }
    }

    pub const fn new_armed() -> Self {
        Self {
            report: None,
            bomb: Bomb::Panic,
        }
    }

    pub fn add(&mut self, report: impl Into<Report<[C]>>) {
        let report = report.into();

        match self.report.as_mut() {
            Some(existing) => existing.append(report),
            None => self.report = Some(report),
        }
    }

    pub fn capture(&mut self, error: impl Into<Report<C>>) {
        let report = error.into();

        match self.report.as_mut() {
            Some(existing) => existing.push(report),
            None => self.report = Some(report.into()),
        }
    }

    pub fn finish(mut self) -> Result<(), Report<[C]>> {
        self.bomb.defuse();
        self.report.map_or(Ok(()), Err)
    }

    pub fn finish_with<T>(mut self, ok: impl FnOnce() -> T) -> Result<T, Report<[C]>> {
        self.bomb.defuse();
        self.report.map_or_else(|| Ok(ok()), Err)
    }

    pub fn finish_with_default<T: Default>(mut self) -> Result<T, Report<[C]>> {
        self.bomb.defuse();
        self.report.map_or_else(|| Ok(T::default()), Err)
    }

    pub fn finish_with_value<T>(mut self, ok: T) -> Result<T, Report<[C]>> {
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

    fn branch(self) -> core::ops::ControlFlow<Self::Residual, Self::Output> {
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

    use crate::{sink::ReportSink, Report};

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

        sink.add(Report::new(TestError(0)));

        let report = sink.finish().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 1);
        assert!(contexts.contains(&TestError(0)));
    }

    #[test]
    fn add_multiple() {
        let mut sink = ReportSink::new();

        sink.add(Report::new(TestError(0)));
        sink.add(Report::new(TestError(1)));

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

            sink.add(Report::new(TestError(0)));

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

            sink.add(Report::new(TestError(0)));
            sink.add(Report::new(TestError(1)));

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

            sink.add(Report::new(TestError(0)));

            sink?;
            Ok(8)
        }

        let report = sink().expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
    }

    #[test]
    #[should_panic(expected = "must be consumed")]
    fn panic_on_unused() {
        #[allow(clippy::unnecessary_wraps)]
        fn sink() -> Result<(), Report<[TestError]>> {
            let mut sink = ReportSink::new_armed();

            sink.add(Report::new(TestError(0)));

            Ok(())
        }

        let _result = sink();
    }

    #[test]
    fn panic_on_unused_with_defuse() {
        #[allow(clippy::unnecessary_wraps)]
        fn sink() -> Result<(), Report<[TestError]>> {
            let mut sink = ReportSink::new_armed();

            sink.add(Report::new(TestError(0)));

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

        sink.add(Report::new(TestError(0)));
        sink.add(Report::new(TestError(1)));

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

        sink.add(Report::new(TestError(0)));
        sink.add(Report::new(TestError(1)));

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
    fn finish_with_default() {
        let mut sink = ReportSink::new();

        sink.add(Report::new(TestError(0)));
        sink.add(Report::new(TestError(1)));

        let report = sink
            .finish_with_default::<u8>()
            .expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn finish_with_default_ok() {
        let sink: ReportSink<TestError> = ReportSink::new();

        let value = sink
            .finish_with_default::<u8>()
            .expect("should have succeeded");
        assert_eq!(value, 0);
    }

    #[test]
    fn finish_with_value() {
        let mut sink = ReportSink::new();

        sink.add(Report::new(TestError(0)));
        sink.add(Report::new(TestError(1)));

        let report = sink.finish_with_value(8).expect_err("should have failed");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn finish_with_value_ok() {
        let sink: ReportSink<TestError> = ReportSink::new();

        let value = sink.finish_with_value(8).expect("should have succeeded");
        assert_eq!(value, 8);
    }
}
