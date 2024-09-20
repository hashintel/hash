use crate::{Context, Report, Result};

// inspired by the implementation in `std`, see: https://doc.rust-lang.org/1.81.0/src/core/iter/adapters/mod.rs.html#157
// except with the removal of the Try trait, as it is unstable.
struct ReportShunt<'a, I, T, C> {
    iter: I,

    report: &'a mut Option<Report<[C]>>,
    context_len: usize,
    context_bound: usize,

    _marker: core::marker::PhantomData<fn() -> *const T>,
}

impl<I, T, R, C> Iterator for ReportShunt<'_, I, T, C>
where
    I: Iterator<Item = core::result::Result<T, R>>,
    R: Into<Report<[C]>>,
{
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.context_len >= self.context_bound {
                return None;
            }

            let item = self.iter.next()?;
            let item = item.map_err(Into::into);

            match (item, self.report.as_mut()) {
                (Ok(output), None) => return Some(output),
                (Ok(_), Some(_)) => {
                    // we're now just consuming the iterator to return all related errors
                    // so we can just ignore the output
                    continue;
                }
                (Err(error), None) => {
                    *self.report = Some(error);
                    self.context_len += 1;
                }
                (Err(error), Some(report)) => {
                    report.append(error);
                    self.context_len += 1;
                }
            }
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        if self.report.is_some() {
            (0, Some(0))
        } else {
            let (_, upper) = self.iter.size_hint();

            (0, upper)
        }
    }
}

fn try_process_reports<I, T, R, C, F, U>(
    iter: I,
    bound: Option<usize>,
    mut collect: F,
) -> Result<U, [C]>
where
    I: Iterator<Item = core::result::Result<T, R>>,
    R: Into<Report<[C]>>,
    for<'a> F: FnMut(ReportShunt<'a, I, T, C>) -> U,
{
    let mut report = None;
    let shunt = ReportShunt {
        iter,
        report: &mut report,
        context_len: 0,
        context_bound: bound.unwrap_or(usize::MAX),
        _marker: core::marker::PhantomData,
    };

    let value = collect(shunt);
    report.map_or_else(|| Ok(value), |report| Err(report))
}

/// An extension trait for iterators that enables error-aware collection of items.
///
/// This trait enhances iterators yielding `Result` items by providing methods to
/// collect successful items into a container while aggregating encountered errors.
///
/// # Performance Considerations
///
/// These methods may have performance implications as they potentially iterate
/// through the entire collection, even after encountering errors.
///
/// # Unstable Feature
///
/// This trait is currently available only under the `unstable` feature flag and
/// does not adhere to semver guarantees. Its API may change in future releases.
///
/// [`Report`]: crate::Report
pub trait TryReportIteratorExt<C> {
    /// The type of the successful items in the iterator.
    type Ok;

    /// Collects the successful items from the iterator into a container, or returns all errors that
    /// occured.
    ///
    /// This method attempts to collect all successful items from the iterator into the specified
    /// container type. If an error is encountered during iteration, the method will exhaust the
    /// iterator and return a `Report` containing all errors encountered.
    ///
    /// # Errors
    ///
    /// If any error is encountered during iteration, the method will return a `Report` containing
    /// all errors encountered up to that point.
    ///
    /// # Examples
    ///
    /// ```
    /// use error_stack::{Result, ResultExt, Report, TryReportIteratorExt};
    /// use std::io;
    ///
    /// fn fetch_fail() -> Result<u8, io::Error> {
    ///    # stringify! {
    ///    ...
    ///    # };
    ///    # Err(Report::from(io::Error::new(io::ErrorKind::Other, "error")))
    /// }
    ///
    /// let results = [Ok(1_u8), fetch_fail(), Ok(2), fetch_fail(), fetch_fail()];
    /// let collected: Result<Vec<_>, _> = results.into_iter().try_collect_reports();
    /// let error = collected.expect_err("multiple calls should have failed");
    ///
    /// assert_eq!(error.current_contexts().count(), 3);
    /// ```
    fn try_collect_reports<A>(self) -> Result<A, [C]>
    where
        A: FromIterator<Self::Ok>;

    /// Collects the successful items from the iterator into a container or returns all errors up to
    /// the specified bound.
    ///
    /// This method is similar to `try_collect`, but it limits the number of errors collected to the
    /// specified `bound`. If the number of errors encountered exceeds the bound, the method stops
    /// collecting errors and returns the collected errors up to that point.
    ///
    /// # Errors
    ///
    /// If any error is encountered during iteration, the method will return a `Report` containing
    /// all errors encountered up to the specified bound.
    ///
    /// # Examples
    ///
    /// ```
    /// use error_stack::{Result, ResultExt, Report, TryReportIteratorExt};
    /// use std::io;
    ///
    /// fn fetch_fail() -> Result<u8, io::Error> {
    ///    # stringify! {
    ///    ...
    ///    # };
    ///    # Err(Report::from(io::Error::new(io::ErrorKind::Other, "error")))
    /// }
    ///
    /// let results = [Ok(1_u8), fetch_fail(), Ok(2), fetch_fail(), fetch_fail()];
    /// let collected: Result<Vec<_>, _> = results.into_iter().try_collect_reports_bounded(2);
    /// let error = collected.expect_err("should have failed");
    ///
    /// assert_eq!(error.current_contexts().count(), 2);
    /// ```
    fn try_collect_reports_bounded<A>(self, bound: usize) -> Result<A, [C]>
    where
        A: FromIterator<Self::Ok>;
}

impl<T, C, R, I> TryReportIteratorExt<C> for I
where
    I: Iterator<Item = core::result::Result<T, R>>,
    R: Into<Report<[C]>>,
    C: Context,
{
    type Ok = T;

    fn try_collect_reports<A>(self) -> Result<A, [C]>
    where
        A: FromIterator<Self::Ok>,
    {
        try_process_reports(self, None, |shunt| shunt.collect())
    }

    fn try_collect_reports_bounded<A>(self, bound: usize) -> Result<A, [C]>
    where
        A: FromIterator<Self::Ok>,
    {
        try_process_reports(self, Some(bound), |shunt| shunt.collect())
    }
}
#[cfg(test)]
mod tests {
    #![allow(clippy::integer_division_remainder_used)]
    use core::fmt;
    use std::collections::HashSet;

    use super::*;

    #[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
    struct CustomError(usize);

    impl fmt::Display for CustomError {
        fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(fmt, "CustomError({})", self.0)
        }
    }

    impl core::error::Error for CustomError {}

    #[test]
    fn try_collect_multiple_errors() {
        let iter = (0..5).map(|i| {
            if i % 2 == 0 {
                Ok(i)
            } else {
                Err(Report::new(CustomError(i)))
            }
        });

        let result: Result<Vec<_>, [CustomError]> = iter.try_collect_reports();
        let report = result.expect_err("should have failed");

        let contexts: HashSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&CustomError(1)));
        assert!(contexts.contains(&CustomError(3)));
    }

    #[test]
    fn try_collect_multiple_errors_bounded() {
        let iter = (0..10).map(|i| {
            if i % 2 == 0 {
                Ok(i)
            } else {
                Err(Report::new(CustomError(i)))
            }
        });

        let result: Result<Vec<_>, [CustomError]> = iter.try_collect_reports_bounded(3);
        let report = result.expect_err("should have failed");

        let contexts: HashSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 3);
        assert!(contexts.contains(&CustomError(1)));
        assert!(contexts.contains(&CustomError(3)));
        assert!(contexts.contains(&CustomError(5)));
    }

    #[test]
    fn try_collect_no_errors() {
        let iter = (0..5).map(Result::<_, CustomError>::Ok);

        let result: Result<Vec<_>, [CustomError]> = iter.try_collect_reports();
        let values = result.expect("should have succeeded");

        assert_eq!(values, [0, 1, 2, 3, 4]);
    }

    #[test]
    fn try_collect_multiple_errors_expanded() {
        let iter = (0..5).map(|i| {
            if i % 2 == 0 {
                Ok(i)
            } else {
                Err(Report::new(CustomError(i)).expand())
            }
        });

        let result: Result<Vec<_>, [CustomError]> = iter.try_collect_reports();
        let report = result.expect_err("should have failed");

        let contexts: HashSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&CustomError(1)));
        assert!(contexts.contains(&CustomError(3)));
    }
}
