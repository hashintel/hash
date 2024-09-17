use error_stack::{Context, Report, Result};

// inspired by the implementation in `std`, see: https://doc.rust-lang.org/1.81.0/src/core/iter/adapters/mod.rs.html#157
// except with the removal of the Try trait, as it is unstable.
struct ReportShunt<'a, I, T, C> {
    iter: I,

    residual: &'a mut Option<Report<[C]>>,
    residual_len: usize,
    residual_bound: usize,

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
            if self.residual_len >= self.residual_bound {
                return None;
            }

            let item = self.iter.next()?;
            let item = item.map_err(Into::into);

            match (item, self.residual.as_mut()) {
                (Ok(output), None) => return Some(output),
                (Ok(_), Some(_)) => {
                    // we're now just consuming the iterator to return all related errors
                    // so we can just ignore the output
                    continue;
                }
                (Err(residual), None) => {
                    *self.residual = Some(residual);
                    self.residual_len += 1;
                }
                (Err(residual), Some(report)) => {
                    report.append(residual);
                    self.residual_len += 1;
                }
            }
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        if self.residual.is_some() {
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
    let mut residual = None;
    let shunt = ReportShunt {
        iter,
        residual: &mut residual,
        residual_len: 0,
        residual_bound: bound.unwrap_or(usize::MAX),
        _marker: core::marker::PhantomData,
    };

    let value = collect(shunt);
    residual.map_or_else(|| Ok(value), |residual| Err(residual))
}

/// An extension trait for iterators that allows collecting items while handling errors.
///
/// This trait provides additional functionality to iterators that yield `Result` items,
/// allowing them to be collected into a container while propagating any errors encountered.
pub trait IteratorExt<C> {
    /// The type of the successful items in the iterator.
    type Output;

    /// Collects the successful items from the iterator into a container, or returns all errors that
    /// occured.
    ///
    /// This method attempts to collect all successful items from the iterator into the specified
    /// container type. If an error is encountered during iteration, the method immediately returns
    /// that error, discarding any previously collected items.
    ///
    /// # Errors
    ///
    /// If any error is encountered during iteration, the method will return a `Report` containing
    /// all errors encountered up to that point.
    ///
    /// # Examples
    ///
    /// ```
    /// use error_stack::{Result, ResultExt, Report};
    /// use std::io;
    /// use error_stack_experimental::IteratorExt;
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
        A: FromIterator<Self::Output>;

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
    /// use error_stack::{Result, ResultExt, Report};
    /// use std::io;
    /// use error_stack_experimental::IteratorExt;
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
        A: FromIterator<Self::Output>;
}

impl<T, C, R, I> IteratorExt<C> for I
where
    I: Iterator<Item = core::result::Result<T, R>>,
    R: Into<Report<[C]>>,
    C: Context,
{
    type Output = T;

    fn try_collect_reports<A>(self) -> Result<A, [C]>
    where
        A: FromIterator<Self::Output>,
    {
        try_process_reports(self, None, |shunt| shunt.collect())
    }

    fn try_collect_reports_bounded<A>(self, bound: usize) -> Result<A, [C]>
    where
        A: FromIterator<Self::Output>,
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
