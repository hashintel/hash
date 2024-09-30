use crate::{Report, Result};

/// Extends tuples with error-handling capabilities.
///
/// This trait provides a method to collect a tuple of `Result`s into a single `Result`
/// containing a tuple of the successful values, or an error if any of the results failed.
///
/// The trait is implemented for tuples of up to 16 elements.
///
/// # Stability
///
/// This trait is only available behind the `unstable` feature flag and is not covered by
/// semver guarantees. It may change or be removed in future versions without notice.
pub trait TryReportTupleExt<C> {
    /// The type of the successful output, typically a tuple of the inner types of the `Result`s.
    type Output;

    /// Attempts to collect all `Result`s in the tuple into a single `Result`.
    ///
    /// # Errors
    ///
    /// If any element is `Err`, returns the first encountered `Err`, with subsequent errors
    /// appended to it.
    ///
    /// # Examples
    ///
    /// ```
    /// use error_stack::{Report, Result, TryReportTupleExt};
    ///
    /// #[derive(Debug)]
    /// struct CustomError;
    ///
    /// impl core::fmt::Display for CustomError {
    ///     fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
    ///         write!(f, "Custom error")
    ///     }
    /// }
    ///
    /// impl core::error::Error for CustomError {}
    ///
    /// let result1: Result<i32, CustomError> = Ok(1);
    /// let result2: Result<&'static str, CustomError> = Ok("success");
    /// let result3: Result<bool, CustomError> = Ok(true);
    ///
    /// let combined = (result1, result2, result3).try_collect();
    /// assert_eq!(combined.unwrap(), (1, "success", true));
    ///
    /// let result1: Result<i32, CustomError> = Ok(1);
    /// let result2: Result<&'static str, CustomError> = Err(Report::new(CustomError));
    /// let result3: Result<bool, CustomError> = Err(Report::new(CustomError));
    /// let combined_with_error = (result1, result2, result3).try_collect();
    /// assert!(combined_with_error.is_err());
    /// ```
    fn try_collect(self) -> Result<Self::Output, [C]>;
}

impl<T, R, C> TryReportTupleExt<C> for (core::result::Result<T, R>,)
where
    R: Into<Report<[C]>>,
{
    type Output = (T,);

    fn try_collect(self) -> Result<Self::Output, [C]> {
        let (result,) = self;

        match result {
            Ok(value) => Ok((value,)),
            Err(report) => Err(report.into()),
        }
    }
}

#[rustfmt::skip]
macro_rules! all_the_tuples {
    ($macro:ident) => {
        $macro!([A, AO]);
        $macro!([A, AO], [B, BO]);
        $macro!([A, AO], [B, BO], [C, CO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO], [I, IO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO], [I, IO], [J, JO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO], [I, IO], [J, JO], [K, KO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO], [I, IO], [J, JO], [K, KO], [L, LO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO], [I, IO], [J, JO], [K, KO], [L, LO], [M, MO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO], [I, IO], [J, JO], [K, KO], [L, LO], [M, MO], [N, NO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO], [I, IO], [J, JO], [K, KO], [L, LO], [M, MO], [N, NO], [O, OO]);
        $macro!([A, AO], [B, BO], [C, CO], [D, DO], [E, EO], [F, FO], [G, GO], [H, HO], [I, IO], [J, JO], [K, KO], [L, LO], [M, MO], [N, NO], [O, OO], [P, PO]);
    };
}

macro_rules! impl_ext {
    ($([$type:ident, $output:ident]),+) => {
        impl<$($type, $output),*, T, R, Context> TryReportTupleExt<Context> for ($($type),*, core::result::Result<T, R>)
        where
            R: Into<Report<[Context]>>,
            ($($type,)*): TryReportTupleExt<Context, Output = ($($output,)*)>,
        {
            type Output = ($($output),*, T);

            #[allow(non_snake_case, clippy::min_ident_chars)]
            fn try_collect(self) -> Result<Self::Output, [Context]> {
                let ($($type),*, result) = self;
                let prefix = ($($type,)*).try_collect();

                match (prefix, result) {
                    (Ok(($($type,)*)), Ok(value)) => Ok(($($type),*, value)),
                    (Err(report), Ok(_)) => Err(report),
                    (Ok(_), Err(report)) => Err(report.into()),
                    (Err(mut report), Err(error)) => {
                        report.append(error.into());
                        Err(report)
                    }
                }
            }
        }
    };
}

all_the_tuples!(impl_ext);

#[cfg(test)]
mod test {
    use alloc::{borrow::ToOwned as _, collections::BTreeSet, string::String};
    use core::{error::Error, fmt::Display};

    use super::TryReportTupleExt as _;
    use crate::{Report, Result};

    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    struct TestError(usize);

    impl Display for TestError {
        fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
            fmt.write_str("TestError")
        }
    }

    impl Error for TestError {}

    #[test]
    fn single_error() {
        let result1: Result<i32, TestError> = Ok(1);
        let result2: Result<String, TestError> = Ok("test".to_owned());
        let result3: Result<bool, TestError> = Err(Report::new(TestError(0)));

        let combined = (result1, result2, result3).try_collect();
        let report = combined.expect_err("should have error");

        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 1);
        assert!(contexts.contains(&TestError(0)));
    }

    #[test]
    fn no_error() {
        let result1: Result<i32, TestError> = Ok(1);
        let result2: Result<String, TestError> = Ok("test".to_owned());
        let result3: Result<bool, TestError> = Ok(true);

        let combined = (result1, result2, result3).try_collect();
        let (ok1, ok2, ok3) = combined.expect("should have no error");

        assert_eq!(ok1, 1);
        assert_eq!(ok2, "test");
        assert!(ok3);
    }

    #[test]
    fn expanded_error() {
        let result1: Result<i32, [TestError]> = Ok(1);
        let result2: Result<String, [TestError]> = Ok("test".to_owned());
        let result3: Result<bool, [TestError]> = Err(Report::new(TestError(0)).expand());

        let combined = (result1, result2, result3).try_collect();
        let report = combined.expect_err("should have error");

        // order of contexts is not guaranteed
        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 1);
        assert!(contexts.contains(&TestError(0)));
    }

    #[test]
    fn single_and_expanded_mixed() {
        let result1: Result<i32, [TestError]> = Ok(1);
        let result2: Result<String, TestError> = Err(Report::new(TestError(0)));
        let result3: Result<bool, [TestError]> = Err(Report::new(TestError(1)).expand());

        let combined = (result1, result2, result3).try_collect();
        let report = combined.expect_err("should have error");

        // order of contexts is not guaranteed
        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }

    #[test]
    fn multiple_errors() {
        let result1: Result<i32, TestError> = Err(Report::new(TestError(0)));
        let result2: Result<String, TestError> = Ok("test".to_owned());
        let result3: Result<bool, TestError> = Err(Report::new(TestError(1)));

        let combined = (result1, result2, result3).try_collect();
        let report = combined.expect_err("should have error");

        // order of contexts is not guaranteed
        let contexts: BTreeSet<_> = report.current_contexts().collect();
        assert_eq!(contexts.len(), 2);
        assert!(contexts.contains(&TestError(0)));
        assert!(contexts.contains(&TestError(1)));
    }
}
