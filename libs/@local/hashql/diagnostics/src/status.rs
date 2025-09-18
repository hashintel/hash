use core::mem;

use crate::{
    Diagnostic, DiagnosticIssues,
    category::DiagnosticCategory,
    severity::{Advisory, Critical},
};

/// A successful result combined with any accumulated diagnostic messages.
///
/// `Success` represents a computation that succeeded but may have
/// encountered warnings or other non-fatal issues along the way. The value
/// represents the successful result, while diagnostics contains any warnings
/// or informational messages that were collected during processing.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity, Success};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut diagnostics: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
/// diagnostics.push(Diagnostic::new(CATEGORY, Severity::Warning));
///
/// let result = Success {
///     value: 42,
///     diagnostics,
/// };
///
/// assert_eq!(result.value, 42);
/// assert_eq!(result.diagnostics.len(), 1);
/// assert_eq!(result.diagnostics.fatal(), 0);
/// ```
#[derive(Debug)]
pub struct Success<T, C, S> {
    pub value: T,
    pub advisories: DiagnosticIssues<C, S, Advisory>,
}

impl<T, C, S> Success<T, C, S> {
    pub fn boxed<'category>(self) -> Success<T, Box<dyn DiagnosticCategory + 'category>, S>
    where
        C: DiagnosticCategory + 'category,
    {
        Success {
            value: self.value,
            advisories: self.advisories.boxed(),
        }
    }
}

/// An error result with additional diagnostic context.
///
/// `Failure` represents a computation that failed with a primary fatal
/// error, along with any secondary diagnostic messages that were collected
/// before the failure occurred.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Failure, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const ERROR_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "error", name: "Error"
/// # };
/// # const WARNING_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "warning", name: "Warning"
/// # };
///
/// let mut secondary: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
/// secondary.push(Diagnostic::new(WARNING_CATEGORY, Severity::Warning));
///
/// let error = Failure {
///     primary: Diagnostic::new(ERROR_CATEGORY, Severity::Error),
///     secondary,
/// };
///
/// assert!(error.primary.severity.is_fatal());
/// assert_eq!(error.secondary.len(), 1);
/// ```
#[derive(Debug)]
pub struct Failure<C, S> {
    // boxed to reduce memory footprint
    pub primary: Box<Diagnostic<C, S, Critical>>,
    pub secondary: DiagnosticIssues<C, S>,
}

impl<C, S> Failure<C, S> {
    /// Converts the error into a collection of diagnostic issues.
    ///
    /// The primary error is inserted at the front of the secondary diagnostics,
    /// creating a single collection containing all diagnostic information.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Failure, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const ERROR_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "error", name: "Error"
    /// # };
    /// # const WARNING_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "warning", name: "Warning"
    /// # };
    ///
    /// let mut secondary: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// secondary.push(Diagnostic::new(WARNING_CATEGORY, Severity::Warning));
    ///
    /// let error = Failure {
    ///     primary: Diagnostic::new(ERROR_CATEGORY, Severity::Error),
    ///     secondary,
    /// };
    ///
    /// let issues = error.into_issues();
    /// assert_eq!(issues.len(), 2);
    /// assert_eq!(issues.fatal(), 1);
    /// // Primary error is now first in the collection
    /// assert_eq!(
    ///     issues
    ///         .iter()
    ///         .next()
    ///         .expect("should have diagnostics")
    ///         .severity,
    ///     Severity::Error
    /// );
    /// ```
    pub fn into_issues(mut self) -> DiagnosticIssues<C, S> {
        self.secondary.insert_front(self.primary.generalize());
        self.secondary
    }

    pub fn boxed<'category>(self) -> Failure<Box<dyn DiagnosticCategory + 'category>, S>
    where
        C: DiagnosticCategory + 'category,
    {
        Failure {
            primary: Box::new(self.primary.boxed()),
            secondary: self.secondary.boxed(),
        }
    }
}

/// A result type that can accumulate diagnostics while processing.
///
/// [`Status`] is similar to [`Result`] but allows collecting diagnostic
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
/// use hashql_diagnostics::{Diagnostic, Severity, Status};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let success: Status<_, (), ()> = Status::ok(42);
/// let error: Status<i32, _, ()> = Status::err(Diagnostic::new(CATEGORY, Severity::Error));
///
/// // Converting to regular Result
/// let success_result = success.into_result().expect("should be successful");
/// assert_eq!(success_result.value, 42);
/// assert_eq!(success_result.diagnostics.len(), 0);
///
/// let error_result = error.into_result().expect_err("should be error");
/// assert!(error_result.primary.severity.is_fatal());
/// ```
///
/// Accumulating diagnostics:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, Severity, Status};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut result: Status<_, _, ()> = Status::ok(100);
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
pub type Status<T, C, S> = Result<Success<T, C, S>, Failure<C, S>>;

pub trait StatusExt<T, C, S> {
    type Boxed<'category>: StatusExt<T, Box<dyn DiagnosticCategory + 'category>, S>
    where
        C: 'category;

    /// Creates a successful `Status` with the given value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::Status;
    ///
    /// let result: Status<_, (), ()> = Status::ok(42);
    /// let success = result.into_result().expect("should be successful");
    /// assert_eq!(success.value, 42);
    /// assert_eq!(success.diagnostics.len(), 0);
    /// ```
    fn ok(value: T) -> Self;

    /// Creates a failed `Status` with the given fatal diagnostic.
    ///
    /// # Panics
    ///
    /// Panics if the diagnostic is not fatal (severity code < 400).
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, Status};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let result: Status<i32, _, ()> = Status::err(Diagnostic::new(CATEGORY, Severity::Error));
    /// let error = result.into_result().expect_err("should be error");
    /// assert!(error.primary.severity.is_fatal());
    /// ```
    fn err(error: Diagnostic<C, S, Critical>) -> Self;

    /// Converts to a result with type-erased diagnostic categories.
    ///
    /// When combining diagnostics from different compilation phases that use
    /// different category types, this method allows them to be stored together.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, Status};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result: Status<_, _, ()> = Status::ok(100);
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// let boxed_result = result.boxed();
    /// // Verify the result is still successful after boxing
    /// let Ok(success) = boxed_result.into_result() else {
    ///     panic!("Unexpected error")
    /// };
    /// assert_eq!(success.value, 100);
    /// assert_eq!(success.diagnostics.len(), 1);
    /// ```
    fn boxed<'category>(self) -> Self::Boxed<'category>
    where
        C: DiagnosticCategory + 'category;

    /// Adds a diagnostic to the result.
    ///
    /// If the result is currently successful and the diagnostic is fatal,
    /// the result is converted to an error state. Otherwise, the diagnostic
    /// is added to the collection of non-fatal diagnostics.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, Status};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result: Status<_, _, ()> = Status::ok(42);
    ///
    /// // Add a warning - still successful
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert!(result.into_result().is_ok());
    ///
    /// let mut result: Status<_, _, ()> = Status::ok(42);
    /// // Add a fatal error - becomes error
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Error));
    /// assert!(result.into_result().is_err());
    /// ```
    fn push_diagnostic(&mut self, diagnostic: Diagnostic<C, S>);

    /// Adds all diagnostics from another collection to this result.
    ///
    /// If the result is currently successful and any of the added diagnostics
    /// are fatal, the result is converted to an error state using the first
    /// fatal diagnostic found.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity, Status};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result: Status<_, _, ()> = Status::ok(42);
    /// let mut additional: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// additional.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// additional.push(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// result.append_diagnostics(&mut additional);
    ///
    /// // Result became an error due to the fatal diagnostic
    /// assert!(result.into_result().is_err());
    /// assert!(additional.is_empty()); // Diagnostics were moved
    /// ```
    fn append_diagnostics(&mut self, diagnostics: &mut DiagnosticIssues<C, S>);
}

impl<T, C, S> StatusExt<T, C, S> for Status<T, C, S> {
    type Boxed<'category>
        = Result<
        Success<T, Box<dyn DiagnosticCategory + 'category>, S>,
        Failure<Box<dyn DiagnosticCategory + 'category>, S>,
    >
    where
        C: 'category;

    fn ok(value: T) -> Self {
        Self::Ok(Success {
            value,
            advisories: DiagnosticIssues::new(),
        })
    }

    fn err(error: Diagnostic<C, S, Critical>) -> Self {
        Self::Err(Failure {
            primary: Box::new(error),
            secondary: DiagnosticIssues::new(),
        })
    }

    fn boxed<'category>(self) -> Self::Boxed<'category>
    where
        C: DiagnosticCategory + 'category,
    {
        match self {
            Ok(success) => Ok(success.boxed()),
            Err(failure) => Err(failure.boxed()),
        }
    }

    fn push_diagnostic(&mut self, diagnostic: Diagnostic<C, S>) {
        match self {
            Ok(success) => match diagnostic.specialize() {
                Ok(advisory) => success.advisories.push(advisory),
                Err(critical) => {
                    let issues = mem::take(&mut success.advisories);

                    *self = Err(Failure {
                        primary: Box::new(critical),
                        secondary: issues.generalize(),
                    });
                }
            },
            Err(failure) => {
                failure.secondary.push(diagnostic);
            }
        }
    }

    fn append_diagnostics(&mut self, diagnostics: &mut DiagnosticIssues<C, S>) {
        match self {
            Ok(success) => {
                if let Err((critical, issues)) =
                    diagnostics.merge_into_advisories(&mut success.advisories)
                {
                    *self = Err(Failure {
                        primary: Box::new(critical),
                        secondary: issues,
                    });
                }
            }
            Err(failure) => {
                failure.secondary.append(diagnostics);
            }
        }
    }
}
