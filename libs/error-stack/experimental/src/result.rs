use error_stack::{Report, Result};

/// Extension trait for accumulating errors in a `Result<T, [C]>`.
pub trait ResultMultiExt<C> {
    /// The type of the successful value in the `Result`.
    type Output;

    /// Accumulates an error into the `Result`.
    ///
    /// If the `Result` is `Ok`, it replaces it with an `Err` containing the new error.
    /// If it's already `Err`, it appends the new error to the existing list.
    ///
    /// # Examples
    ///
    /// ```
    /// use error_stack::{Report, Result};
    /// use error_stack_experimental::ResultMultiExt;
    ///
    /// #[derive(Debug)]
    /// struct CustomError;
    ///
    /// impl std::fmt::Display for CustomError {
    ///     fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    ///         write!(f, "Custom error")
    ///     }
    /// }
    ///
    /// impl std::error::Error for CustomError {}
    ///
    /// let mut result: Result<(), [CustomError]> = Ok(());
    /// result.accumulate(Report::new(CustomError));
    /// assert!(result.is_err());
    ///
    /// result.accumulate(Report::new(CustomError));
    /// assert_eq!(result.unwrap_err().current_contexts().count(), 2);
    /// ```
    fn accumulate<R>(&mut self, report: R)
    where
        R: Into<Report<[C]>>;
}

impl<T, C> ResultMultiExt<C> for Result<T, [C]> {
    type Output = T;

    fn accumulate<R>(&mut self, report: R)
    where
        R: Into<Report<[C]>>,
    {
        match self {
            Ok(_) => {
                *self = Err(report.into());
            }
            Err(reports) => {
                reports.append(report.into());
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use error_stack::{Report, Result};

    use crate::ResultMultiExt;

    #[derive(Debug)]
    struct TestError;

    impl core::fmt::Display for TestError {
        fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            write!(fmt, "Test error")
        }
    }

    impl core::error::Error for TestError {}

    #[test]
    fn accumulate_on_ok() {
        let mut result: Result<(), [TestError]> = Ok(());
        result.accumulate(Report::new(TestError));
        assert!(result.is_err());
    }

    #[test]
    fn accumulate_multiple_errors() {
        let mut result: Result<(), [TestError]> = Ok(());
        result.accumulate(Report::new(TestError));
        result.accumulate(Report::new(TestError));
        result.accumulate(Report::new(TestError));

        let report = result.expect_err("should have failed");
        assert_eq!(report.current_contexts().count(), 3);
    }

    #[test]
    fn accumulate_on_err() {
        let mut result: Result<(), [TestError]> = Err(Report::new(TestError).expand());
        result.accumulate(Report::new(TestError));

        let report = result.expect_err("should have failed");
        assert_eq!(report.current_contexts().count(), 2);
    }
}
