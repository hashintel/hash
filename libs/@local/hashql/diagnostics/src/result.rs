use core::{
    convert::Infallible,
    ops::{ControlFlow, FromResidual, Try},
};

use crate::{Diagnostic, DiagnosticIssues, category::DiagnosticCategory};

/// A successful result combined with any accumulated diagnostic messages.
///
/// `DiagnosticValue` represents a computation that succeeded but may have
/// encountered warnings or other non-fatal issues along the way. The value
/// represents the successful result, while diagnostics contains any warnings
/// or informational messages that were collected during processing.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, DiagnosticValue, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut diagnostics = DiagnosticIssues::new();
/// diagnostics.push(Diagnostic::new(CATEGORY, Severity::Warning));
///
/// let result = DiagnosticValue {
///     value: 42,
///     diagnostics,
/// };
///
/// assert_eq!(result.value, 42);
/// assert_eq!(result.diagnostics.len(), 1);
/// assert_eq!(result.diagnostics.fatal(), 0);
/// ```
#[derive(Debug)]
pub struct DiagnosticValue<T, C, S> {
    pub value: T,
    pub diagnostics: DiagnosticIssues<C, S>,
}

/// An error result with additional diagnostic context.
///
/// `DiagnosticError` represents a computation that failed with a primary fatal
/// error, along with any secondary diagnostic messages that were collected
/// before the failure occurred.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticError, DiagnosticIssues, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const ERROR_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "error", name: "Error"
/// # };
/// # const WARNING_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "warning", name: "Warning"
/// # };
///
/// let mut secondary = DiagnosticIssues::new();
/// secondary.push(Diagnostic::new(WARNING_CATEGORY, Severity::Warning));
///
/// let error = DiagnosticError {
///     primary: Diagnostic::new(ERROR_CATEGORY, Severity::Error),
///     secondary,
/// };
///
/// assert!(error.primary.severity.is_fatal());
/// assert_eq!(error.secondary.len(), 1);
/// ```
#[derive(Debug)]
pub struct DiagnosticError<C, S> {
    pub primary: Diagnostic<C, S>,
    pub secondary: DiagnosticIssues<C, S>,
}

impl<C, S> DiagnosticError<C, S> {
    /// Converts the error into a collection of diagnostic issues.
    ///
    /// The primary error is inserted at the front of the secondary diagnostics,
    /// creating a single collection containing all diagnostic information.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticError, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const ERROR_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "error", name: "Error"
    /// # };
    /// # const WARNING_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "warning", name: "Warning"
    /// # };
    ///
    /// let mut secondary = DiagnosticIssues::new();
    /// secondary.push(Diagnostic::new(WARNING_CATEGORY, Severity::Warning));
    ///
    /// let error = DiagnosticError {
    ///     primary: Diagnostic::new(ERROR_CATEGORY, Severity::Error),
    ///     secondary,
    /// };
    ///
    /// let issues = error.into_issues();
    /// assert_eq!(issues.len(), 2);
    /// assert_eq!(issues.fatal(), 1);
    /// // Primary error is now first in the collection
    /// assert_eq!(issues.iter().next().unwrap().severity, Severity::Error);
    /// ```
    pub fn into_issues(mut self) -> DiagnosticIssues<C, S> {
        self.secondary.insert_front(self.primary);
        self.secondary
    }
}

/// A result type that can accumulate diagnostics while processing.
///
/// `DiagnosticResult` is similar to [`Result`] but allows collecting diagnostic
/// messages (warnings, notes, etc.) even when the operation succeeds. It
/// maintains the invariant that fatal diagnostics are always promoted to the
/// error variant, while non-fatal diagnostics are collected separately.
///
/// This type supports the `?` operator and can be used in `try` blocks,
/// making it convenient for error handling patterns that need to accumulate
/// diagnostic information.
///
/// # Examples
///
/// Basic usage:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let success = DiagnosticResult::ok(42);
/// let error = DiagnosticResult::err(Diagnostic::new(CATEGORY, Severity::Error));
///
/// // Converting to regular Result
/// let success_result = success.into_result().unwrap();
/// assert_eq!(success_result.value, 42);
/// assert_eq!(success_result.diagnostics.len(), 0);
///
/// let error_result = error.into_result().unwrap_err();
/// assert!(error_result.primary.severity.is_fatal());
/// ```
///
/// Accumulating diagnostics:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut result = DiagnosticResult::ok(100);
///
/// // Add a warning - doesn't change the success state
/// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
///
/// // Add a fatal error - promotes to error state
/// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Error));
///
/// // Now it's an error
/// assert!(result.into_result().is_err());
/// ```
#[must_use]
#[derive(Debug)]
#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "required for `DiagnosticIssues`"
)]
pub struct DiagnosticResult<T, C, S> {
    pub(crate) diagnostics: DiagnosticIssues<C, S>,
    pub(crate) result: Result<T, Diagnostic<C, S>>,
}

impl<T, C, S> DiagnosticResult<T, C, S> {
    /// Creates a successful `DiagnosticResult` with the given value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::DiagnosticResult;
    ///
    /// let result = DiagnosticResult::ok(42);
    /// let success = result.into_result().unwrap();
    /// assert_eq!(success.value, 42);
    /// assert_eq!(success.diagnostics.len(), 0);
    /// ```
    pub const fn ok(value: T) -> Self {
        Self {
            diagnostics: DiagnosticIssues::new(),
            result: Ok(value),
        }
    }

    /// Creates a failed `DiagnosticResult` with the given fatal diagnostic.
    ///
    /// # Panics
    ///
    /// Panics if the diagnostic is not fatal (severity code < 400).
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let result = DiagnosticResult::err(Diagnostic::new(CATEGORY, Severity::Error));
    /// let error = result.into_result().unwrap_err();
    /// assert!(error.primary.severity.is_fatal());
    /// ```
    pub const fn err(diagnostic: Diagnostic<C, S>) -> Self {
        assert!(
            diagnostic.severity.is_fatal(),
            "Diagnostic severity must be fatal"
        );

        Self {
            diagnostics: DiagnosticIssues::new(),
            result: Err(diagnostic),
        }
    }

    /// Creates a failed `DiagnosticResult` if the diagnostic is fatal.
    ///
    /// Returns the diagnostic unchanged if it's not fatal, allowing the caller
    /// to handle non-fatal diagnostics differently.
    ///
    /// # Errors
    ///
    /// Returns the original diagnostic if it is not fatal (severity code < 400).
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// // Fatal diagnostic - creates error result
    /// let fatal = Diagnostic::new(CATEGORY, Severity::Error);
    /// let result = DiagnosticResult::try_err(fatal).unwrap();
    /// assert!(result.into_result().is_err());
    ///
    /// // Non-fatal diagnostic - returns the diagnostic
    /// let warning = Diagnostic::new(CATEGORY, Severity::Warning);
    /// let returned_diagnostic = DiagnosticResult::try_err(warning).unwrap_err();
    /// assert_eq!(returned_diagnostic.severity, Severity::Warning);
    /// ```
    pub const fn try_err(diagnostic: Diagnostic<C, S>) -> Result<Self, Diagnostic<C, S>> {
        if !diagnostic.severity.is_fatal() {
            return Err(diagnostic);
        }

        Ok(Self {
            diagnostics: DiagnosticIssues::new(),
            result: Err(diagnostic),
        })
    }

    /// Converts to a result with type-erased diagnostic categories.
    ///
    /// When combining diagnostics from different compilation phases that use
    /// different category types, this method allows them to be stored together.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result = DiagnosticResult::ok(42);
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// let boxed_result = result.boxed();
    /// let success = boxed_result.into_result().unwrap();
    /// assert_eq!(success.value, 42);
    /// assert_eq!(success.diagnostics.len(), 1);
    /// ```
    pub fn boxed<'category>(self) -> DiagnosticResult<T, Box<dyn DiagnosticCategory + 'category>, S>
    where
        C: DiagnosticCategory + 'category,
    {
        let Self {
            diagnostics,
            result,
        } = self;

        let diagnostics = diagnostics.boxed();
        let result = result.map_err(Diagnostic::boxed);

        DiagnosticResult {
            diagnostics,
            result,
        }
    }

    /// Transforms the success value using the provided function.
    ///
    /// If the result is an error, the error and diagnostics are left unchanged.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let result = DiagnosticResult::ok(21);
    /// let doubled = result.map_ok(|x| x * 2);
    ///
    /// let success = doubled.into_result().unwrap();
    /// assert_eq!(success.value, 42);
    /// ```
    pub fn map_ok<U>(self, func: impl FnOnce(T) -> U) -> DiagnosticResult<U, C, S> {
        let Self {
            diagnostics,
            result,
        } = self;

        let result = result.map(func);

        DiagnosticResult {
            diagnostics,
            result,
        }
    }

    /// Transforms all diagnostics using the provided function.
    ///
    /// This applies the transformation to both the collected diagnostics and
    /// any error diagnostic, allowing you to change category and span types.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const OLD_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "old", name: "Old"
    /// # };
    /// # const NEW_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "new", name: "New"
    /// # };
    ///
    /// let mut result = DiagnosticResult::ok(42);
    /// result.push_diagnostic(Diagnostic::new(OLD_CATEGORY, Severity::Warning));
    ///
    /// let transformed =
    ///     result.map_diagnostics(|diagnostic| Diagnostic::new(NEW_CATEGORY, diagnostic.severity));
    /// ```
    pub fn map_diagnostics<C2, S2>(
        self,
        mut func: impl FnMut(Diagnostic<C, S>) -> Diagnostic<C2, S2>,
    ) -> DiagnosticResult<T, C2, S2> {
        let Self {
            diagnostics,
            result,
        } = self;

        let diagnostics = diagnostics.map(&mut func);
        let result = result.map_err(func);

        DiagnosticResult {
            diagnostics,
            result,
        }
    }

    /// Adds a diagnostic to the result.
    ///
    /// If the result is currently successful and the diagnostic is fatal,
    /// the result is converted to an error state. Otherwise, the diagnostic
    /// is added to the collection of non-fatal diagnostics.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result = DiagnosticResult::ok(42);
    ///
    /// // Add a warning - still successful
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert!(result.into_result().is_ok());
    ///
    /// let mut result = DiagnosticResult::ok(42);
    /// // Add a fatal error - becomes error
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Error));
    /// assert!(result.into_result().is_err());
    /// ```
    pub fn push_diagnostic(&mut self, diagnostic: Diagnostic<C, S>) {
        if self.result.is_ok() && diagnostic.severity.is_fatal() {
            self.result = Err(diagnostic);
        } else {
            self.diagnostics.push(diagnostic);
        }
    }

    /// Adds all diagnostics from another collection to this result.
    ///
    /// If the result is currently successful and any of the added diagnostics
    /// are fatal, the result is converted to an error state using the first
    /// fatal diagnostic found.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, DiagnosticResult, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result = DiagnosticResult::ok(42);
    /// let mut additional = DiagnosticIssues::new();
    /// additional.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// additional.push(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// result.append_diagnostics(&mut additional);
    ///
    /// // Result became an error due to the fatal diagnostic
    /// assert!(result.into_result().is_err());
    /// assert!(additional.is_empty()); // Diagnostics were moved
    /// ```
    pub fn append_diagnostics(&mut self, diagnostics: &mut DiagnosticIssues<C, S>) {
        self.diagnostics.append(diagnostics);

        if self.result.is_ok()
            && let Some(fatal) = self.diagnostics.pop_fatal()
        {
            self.result = Err(fatal);
        }
    }

    /// Converts the result into a standard [`Result`] type.
    ///
    /// Success cases become [`DiagnosticValue`] containing the value and any
    /// collected diagnostics. Error cases become [`DiagnosticError`] containing
    /// the primary error and any secondary diagnostics.
    ///
    /// # Errors
    ///
    /// Returns [`DiagnosticError`] if the result contains a fatal diagnostic.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticResult, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// // Success case
    /// let mut success = DiagnosticResult::ok(42);
    /// success.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// let result = success.into_result().unwrap();
    /// assert_eq!(result.value, 42);
    /// assert_eq!(result.diagnostics.len(), 1);
    ///
    /// // Error case
    /// let error = DiagnosticResult::err(Diagnostic::new(CATEGORY, Severity::Error));
    /// let error_result = error.into_result().unwrap_err();
    /// assert!(error_result.primary.severity.is_fatal());
    /// ```
    pub fn into_result(self) -> Result<DiagnosticValue<T, C, S>, Box<DiagnosticError<C, S>>> {
        match self.result {
            Ok(value) => {
                debug_assert_eq!(
                    self.diagnostics.fatal(),
                    0,
                    "Fatal diagnostics should have been promoted to an error variant"
                );

                Ok(DiagnosticValue {
                    value,
                    diagnostics: self.diagnostics,
                })
            }
            Err(diagnostic) => {
                debug_assert!(
                    diagnostic.severity.is_fatal(),
                    "Fatal diagnostics should only be present in error variants"
                );

                Err(Box::new(DiagnosticError {
                    primary: diagnostic,
                    secondary: self.diagnostics,
                }))
            }
        }
    }
}

impl<T, C, S> From<DiagnosticValue<T, C, S>> for DiagnosticResult<T, C, S> {
    fn from(
        DiagnosticValue {
            value,
            mut diagnostics,
        }: DiagnosticValue<T, C, S>,
    ) -> Self {
        // in case the `DiagnosticValue` contains fatal diagnostics convert into an error
        if let Some(diagnostic) = diagnostics.pop_fatal() {
            return Self {
                result: Err(diagnostic),
                diagnostics,
            };
        }

        Self {
            result: Ok(value),
            diagnostics,
        }
    }
}

impl<T, C, S> From<DiagnosticError<C, S>> for DiagnosticResult<T, C, S> {
    fn from(DiagnosticError { primary, secondary }: DiagnosticError<C, S>) -> Self {
        Self {
            result: Err(primary),
            diagnostics: secondary,
        }
    }
}

impl<T, C, S> FromResidual<Result<Infallible, DiagnosticIssues<C, S>>>
    for DiagnosticResult<T, C, S>
{
    fn from_residual(Err(mut diagnostics): Result<Infallible, DiagnosticIssues<C, S>>) -> Self {
        let error = diagnostics
            .pop_fatal()
            .expect("error variant should have at least one fatal error");

        Self {
            result: Err(error),
            diagnostics,
        }
    }
}

impl<T, C, S> FromResidual<Result<Infallible, Diagnostic<C, S>>> for DiagnosticResult<T, C, S> {
    fn from_residual(Err(diagnostic): Result<Infallible, Diagnostic<C, S>>) -> Self {
        assert!(
            diagnostic.severity.is_fatal(),
            "Error diagnostic must always be fatal"
        );

        Self {
            result: Err(diagnostic),
            diagnostics: DiagnosticIssues::new(),
        }
    }
}

impl<T, C, S> FromResidual<DiagnosticResult<!, C, S>> for DiagnosticResult<T, C, S> {
    fn from_residual(residual: DiagnosticResult<!, C, S>) -> Self {
        let Err(error) = residual.result;

        Self {
            result: Err(error),
            diagnostics: residual.diagnostics,
        }
    }
}

impl<T, C, S> Try for DiagnosticResult<T, C, S> {
    type Output = DiagnosticValue<T, C, S>;
    type Residual = DiagnosticResult<!, C, S>;

    fn from_output(output: Self::Output) -> Self {
        let DiagnosticValue { value, diagnostics } = output;

        // We cannot convert here directly because of the invariants of the `Try` trait, as in:
        // `Try::from_output(x).branch() --> ControlFlow::Continue(x)`
        // must hold, if we were to convert it this would no longer be the case.
        // As this method is only used internally (and shouldn't be used by a user) - it is fine.
        // `From` does the "correct" conversion.
        assert_eq!(
            diagnostics.fatal(),
            0,
            "Fatal diagnostics should have been promoted to an error variant"
        );

        Self {
            result: Ok(value),
            diagnostics,
        }
    }

    fn branch(self) -> ControlFlow<Self::Residual, Self::Output> {
        match self.result {
            Ok(value) => {
                debug_assert_eq!(
                    self.diagnostics.fatal(),
                    0,
                    "Fatal diagnostics should have been promoted to an error variant"
                );

                ControlFlow::Continue(DiagnosticValue {
                    value,
                    diagnostics: self.diagnostics,
                })
            }
            Err(diagnostic) => {
                debug_assert!(
                    diagnostic.severity.is_fatal(),
                    "Fatal diagnostics should only be present in error variants"
                );

                ControlFlow::Break(DiagnosticResult {
                    result: Err(diagnostic),
                    diagnostics: self.diagnostics,
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use crate::{Diagnostic, DiagnosticIssues, Severity, category::TerminalDiagnosticCategory};

    const TEST_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
        id: "test",
        name: "Test Category",
    };

    const ERROR_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
        id: "error",
        name: "Error Category",
    };

    #[test]
    fn diagnostic_result_map_diagnostics_transforms_all() {
        let mut result: DiagnosticResult<&'static str, _, ()> =
            DiagnosticResult::err(Diagnostic::new(ERROR_CATEGORY, Severity::Error));
        result.push_diagnostic(Diagnostic::new(TEST_CATEGORY, Severity::Warning));
        result.push_diagnostic(Diagnostic::new(TEST_CATEGORY, Severity::Note));

        let transformed = result.map_diagnostics(|mut diagnostic| {
            diagnostic.message = Some(Cow::Borrowed("transformed"));
            diagnostic
        });

        let error = transformed
            .into_result()
            .expect_err("Should have a fatal error as result");
        assert_eq!(error.primary.message, Some(Cow::Borrowed("transformed")));

        for diagnostic in error.secondary {
            assert_eq!(diagnostic.message, Some(Cow::Borrowed("transformed")));
        }
    }

    #[test]
    fn from_diagnostic_value_creates_success_result() {
        let mut diagnostics = DiagnosticIssues::new();
        diagnostics.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));

        let value = DiagnosticValue {
            value: 42,
            diagnostics,
        };

        let result = DiagnosticResult::from(value);
        let converted_back = result.into_result().unwrap();

        assert_eq!(converted_back.value, 42);
        assert_eq!(converted_back.diagnostics.len(), 1);
    }

    #[test]
    fn from_diagnostic_error_creates_error_result() {
        let mut secondary = DiagnosticIssues::new();
        secondary.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));

        let error = DiagnosticError {
            primary: Diagnostic::new(ERROR_CATEGORY, Severity::Error),
            secondary,
        };

        let result = DiagnosticResult::from(error);
        let converted_back = result.into_result().unwrap_err();

        assert!(converted_back.primary.severity.is_fatal());
        assert_eq!(converted_back.secondary.len(), 1);
    }

    #[test]
    fn from_residual_diagnostic_issues_promotes_fatal_to_error() {
        let mut diagnostics: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
        diagnostics.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));
        diagnostics.push(Diagnostic::new(ERROR_CATEGORY, Severity::Error)); // Fatal
        diagnostics.push(Diagnostic::new(TEST_CATEGORY, Severity::Note));

        // Very contrived example, but demonstrates how it works
        let result: DiagnosticResult<_, _, _> = try {
            let value: Result<&'static str, _> = Err(diagnostics);
            let _foo = value?;

            DiagnosticValue {
                value: "ok",
                diagnostics: DiagnosticIssues::new(),
            }
        };

        let error = result.into_result().expect_err("should've errored out");
        assert!(error.primary.severity.is_fatal());
        assert_eq!(error.secondary.len(), 2); // Warning and Note remain
    }

    #[test]
    fn from_residual_single_diagnostic() {
        let diagnostic = Diagnostic::new(ERROR_CATEGORY, Severity::Error);
        let residual: Result<core::convert::Infallible, _> = Err(diagnostic);

        let result = DiagnosticResult::<String, _, ()>::from_residual(residual);
        let error = result.into_result().unwrap_err();

        assert!(error.primary.severity.is_fatal());
        assert_eq!(error.secondary.len(), 0);
    }

    #[test]
    fn from_residual_diagnostic_result() {
        let mut other_result =
            DiagnosticResult::err(Diagnostic::new(ERROR_CATEGORY, Severity::Error));
        other_result.push_diagnostic(Diagnostic::new(TEST_CATEGORY, Severity::Warning));

        // Convert to residual type
        let residual = DiagnosticResult::<!, _, _> {
            diagnostics: other_result.diagnostics,
            result: other_result.result,
        };

        let result = DiagnosticResult::<String, _, _>::from_residual(residual);
        let error = result.into_result().unwrap_err();

        assert!(error.primary.severity.is_fatal());
        assert_eq!(error.secondary.len(), 1);
    }

    #[test]
    fn try_trait_from_output() {
        let mut diagnostics = DiagnosticIssues::new();
        diagnostics.push(Diagnostic::new(TEST_CATEGORY, Severity::Note));

        let value = DiagnosticValue {
            value: "test",
            diagnostics,
        };

        let result = DiagnosticResult::from_output(value);
        let converted_back = result.into_result().unwrap();

        assert_eq!(converted_back.value, "test");
        assert_eq!(converted_back.diagnostics.len(), 1);
    }

    #[test]
    fn try_trait_branch_success() {
        let mut result = DiagnosticResult::ok(100);
        result.push_diagnostic(Diagnostic::new(TEST_CATEGORY, Severity::Warning));

        match result.branch() {
            core::ops::ControlFlow::Continue(value) => {
                assert_eq!(value.value, 100);
                assert_eq!(value.diagnostics.len(), 1);
            }
            core::ops::ControlFlow::Break(_) => {
                panic!("Expected Continue variant");
            }
        }
    }

    #[test]
    fn try_trait_branch_error() {
        let result = DiagnosticResult::err(Diagnostic::new(ERROR_CATEGORY, Severity::Error));

        match result.branch() {
            core::ops::ControlFlow::Continue(_) => {
                panic!("Expected Break variant");
            }
            core::ops::ControlFlow::Break(residual) => {
                let error = residual.into_result().unwrap_err();
                assert!(error.primary.severity.is_fatal());
            }
        }
    }

    #[test]
    fn append_diagnostics_promotes_fatal_to_error() {
        let mut result = DiagnosticResult::ok(42);

        let mut additional = DiagnosticIssues::new();
        additional.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));
        additional.push(Diagnostic::new(ERROR_CATEGORY, Severity::Error)); // Fatal
        additional.push(Diagnostic::new(TEST_CATEGORY, Severity::Note));

        result.append_diagnostics(&mut additional);

        let error = result.into_result().unwrap_err();
        assert!(error.primary.severity.is_fatal());
        assert_eq!(error.secondary.len(), 2); // Warning and Note
        assert!(additional.is_empty()); // All moved
    }

    #[test]
    fn append_diagnostics_no_promotion_when_no_fatal() {
        let mut result = DiagnosticResult::ok(42);

        let mut additional = DiagnosticIssues::new();
        additional.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));
        additional.push(Diagnostic::new(TEST_CATEGORY, Severity::Note));

        result.append_diagnostics(&mut additional);

        let success = result.into_result().unwrap();
        assert_eq!(success.value, 42);
        assert_eq!(success.diagnostics.len(), 2);
        assert_eq!(success.diagnostics.fatal(), 0);
        assert!(additional.is_empty());
    }
}
