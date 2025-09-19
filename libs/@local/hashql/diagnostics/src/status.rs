use core::mem;

use crate::{
    Diagnostic, DiagnosticIssues,
    category::DiagnosticCategory,
    severity::{Advisory, Critical},
};

/// A successful result combined with any accumulated non-fatal diagnostic messages.
///
/// [`Success`] represents a computation that succeeded but may have encountered warnings or other
/// non-fatal issues along the way. The value represents the successful result, while advisories
/// contains any warnings or informational messages that were collected during processing.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity, Success, severity::Advisory};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut advisories: DiagnosticIssues<_, (), Advisory> = DiagnosticIssues::new();
/// let warning = Diagnostic::new(CATEGORY, Severity::Warning)
///     .specialize()
///     .expect("should be advisory");
/// advisories.push(warning);
///
/// let result = Success {
///     value: 42,
///     advisories,
/// };
///
/// assert_eq!(result.value, 42);
/// assert_eq!(result.advisories.len(), 1);
/// assert_eq!(result.advisories.critical(), 0);
/// ```
#[derive(Debug)]
pub struct Success<T, C, S> {
    pub value: T,
    pub advisories: DiagnosticIssues<C, S, Advisory>,
}

impl<T, C, S> Success<T, C, S> {
    /// Converts to a result with type-erased diagnostic categories.
    ///
    /// When combining diagnostics from different compilation phases that use different category
    /// types, this method allows them to be stored together.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity, Success, severity::Advisory};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut advisories: DiagnosticIssues<_, (), Advisory> = DiagnosticIssues::new();
    /// let warning = Diagnostic::new(CATEGORY, Severity::Warning)
    ///     .specialize()
    ///     .expect("should be advisory");
    /// advisories.push(warning);
    ///
    /// let result = Success {
    ///     value: 100,
    ///     advisories,
    /// };
    ///
    /// let boxed_result = result.boxed();
    /// assert_eq!(boxed_result.value, 100);
    /// assert_eq!(boxed_result.advisories.len(), 1);
    /// ```
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
/// [`Failure`] represents a computation that failed with a primary critical error, along with any
/// secondary diagnostic messages that were collected before the failure occurred.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{
///     Diagnostic, DiagnosticIssues, Failure, Severity, severity::SeverityKind,
/// };
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const ERROR_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "error", name: "Error"
/// # };
/// # const WARNING_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "warning", name: "Warning"
/// # };
///
/// let mut secondary: DiagnosticIssues<_, (), Severity> = DiagnosticIssues::new();
/// secondary.push(Diagnostic::new(WARNING_CATEGORY, Severity::Warning));
///
/// let error_diagnostic = Diagnostic::new(ERROR_CATEGORY, Severity::Error);
/// let critical_diagnostic = error_diagnostic
///     .specialize()
///     .expect_err("should be critical");
///
/// let error = Failure {
///     primary: Box::new(critical_diagnostic),
///     secondary,
/// };
///
/// assert!(error.primary.severity.is_critical());
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
    /// The primary error is inserted at the front of the secondary diagnostics, creating a single
    /// collection containing all diagnostic information.
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
    /// let error_diagnostic = Diagnostic::new(ERROR_CATEGORY, Severity::Error);
    /// let critical_diagnostic = error_diagnostic
    ///     .specialize()
    ///     .expect_err("should be critical");
    ///
    /// let error = Failure {
    ///     primary: Box::new(critical_diagnostic),
    ///     secondary,
    /// };
    ///
    /// let issues = error.into_issues();
    /// assert_eq!(issues.len(), 2);
    /// assert_eq!(issues.critical(), 1);
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

    /// Converts to a result with type-erased diagnostic categories.
    ///
    /// When combining diagnostics from different compilation phases that use different category
    /// types, this method allows them to be stored together.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{
    ///     Diagnostic, DiagnosticIssues, Failure, Severity, severity::SeverityKind,
    /// };
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const ERROR_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "error", name: "Error"
    /// # };
    ///
    /// let error_diagnostic: Diagnostic<_, ()> = Diagnostic::new(ERROR_CATEGORY, Severity::Error);
    /// let critical_diagnostic = error_diagnostic
    ///     .specialize()
    ///     .expect_err("should be critical");
    ///
    /// let error = Failure {
    ///     primary: Box::new(critical_diagnostic),
    ///     secondary: DiagnosticIssues::new(),
    /// };
    ///
    /// let boxed_error = error.boxed();
    /// assert!(boxed_error.primary.severity.is_critical());
    /// ```
    #[must_use]
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
/// [`Status`] is similar to [`Result`] (indeed it is just a type-alias) but allows collecting
/// diagnostic messages (warnings, notes, etc.) even when the operation succeeds. It maintains the
/// invariant that fatal diagnostics are always promoted to the error variant, while non-fatal
/// diagnostics are collected separately.
///
/// # Examples
///
/// Basic usage:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, Severity, Status, StatusExt, severity::SeverityKind};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let success: Status<_, (), ()> = Status::success(42);
/// let error_diagnostic = Diagnostic::new(CATEGORY, Severity::Error);
/// let critical_diagnostic = error_diagnostic
///     .specialize()
///     .expect_err("should be critical");
/// let error: Status<i32, _, ()> = Status::failure(critical_diagnostic);
///
/// // Check the results
/// match success {
///     Ok(success_result) => {
///         assert_eq!(success_result.value, 42);
///         assert_eq!(success_result.advisories.len(), 0);
///     }
///     Err(_) => panic!("should be successful"),
/// }
///
/// match error {
///     Ok(_) => panic!("should be error"),
///     Err(error_result) => {
///         assert!(error_result.primary.severity.is_critical());
///     }
/// }
/// ```
///
/// Accumulating diagnostics:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, Severity, Status, StatusExt};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut result: Status<_, _, ()> = Status::success(100);
///
/// // Add a warning - doesn't change the success state
/// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
///
/// // Add a fatal error - promotes to error state
/// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Error));
///
/// // Now it's an error
/// assert!(result.is_err());
/// ```
pub type Status<T, C, S> = Result<Success<T, C, S>, Failure<C, S>>;

mod sealed {
    use super::Status;

    pub trait Sealed {}

    impl<T, C, S> Sealed for Status<T, C, S> {}
}

/// Extension trait providing diagnostic-aware operations for [`Status`].
///
/// This trait provides methods for creating, manipulating, and converting [`Status`] values while
/// maintaining proper diagnostic handling semantics. The trait ensures that fatal diagnostics are
/// always promoted to the error variant while non-fatal diagnostics are accumulated appropriately.
pub trait StatusExt<T, C, S>: sealed::Sealed {
    /// The type returned by [`boxed`](StatusExt::boxed).
    type Boxed<'category>: StatusExt<T, Box<dyn DiagnosticCategory + 'category>, S>
    where
        C: 'category;

    /// Creates a successful [`Status`] with the given value.
    ///
    /// The created status contains no diagnostic messages and represents a computation that
    /// completed without any issues.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Status, StatusExt};
    ///
    /// let result: Status<_, (), ()> = Status::success(42);
    /// match result {
    ///     Ok(success) => {
    ///         assert_eq!(success.value, 42);
    ///         assert_eq!(success.advisories.len(), 0);
    ///     }
    ///     Err(_) => panic!("should be successful"),
    /// }
    /// ```
    fn success(value: T) -> Self;

    /// Creates a failed [`Status`] with the given fatal diagnostic.
    ///
    /// The created status represents a computation that failed with the provided error as the
    /// primary cause. Additional diagnostics can be added later using
    /// [`push_diagnostic`](StatusExt::push_diagnostic).
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, Status, StatusExt, severity::SeverityKind};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let error_diagnostic = Diagnostic::new(CATEGORY, Severity::Error);
    /// let critical_diagnostic = error_diagnostic
    ///     .specialize()
    ///     .expect_err("should be critical");
    /// let result: Status<i32, _, ()> = Status::failure(critical_diagnostic);
    /// match result {
    ///     Ok(_) => panic!("should be error"),
    ///     Err(error) => {
    ///         assert!(error.primary.severity.is_critical());
    ///     }
    /// }
    /// ```
    fn failure(error: Diagnostic<C, S, Critical>) -> Self;

    /// Converts to a result with type-erased diagnostic categories.
    ///
    /// When combining diagnostics from different compilation phases that use different category
    /// types, this method allows them to be stored together by erasing the concrete category
    /// type to a trait object.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, Status, StatusExt};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result: Status<_, _, ()> = Status::success(100);
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// let boxed_result = result.boxed();
    /// // Verify the result is still successful after boxing
    /// match boxed_result {
    ///     Ok(success) => {
    ///         assert_eq!(success.value, 100);
    ///         assert_eq!(success.advisories.len(), 1);
    ///     }
    ///     Err(_) => panic!("Unexpected error"),
    /// }
    /// ```
    fn boxed<'category>(self) -> Self::Boxed<'category>
    where
        C: DiagnosticCategory + 'category;

    /// Adds a diagnostic to the result.
    ///
    /// If the result is currently successful and the diagnostic is fatal, the result is converted
    /// to an error state using the diagnostic as the primary error. Otherwise, the diagnostic
    /// is added to the appropriate collection of diagnostics.
    ///
    /// # Examples
    ///
    /// Adding a non-fatal diagnostic:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, Status, StatusExt};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result: Status<_, _, ()> = Status::success(42);
    ///
    /// // Add a warning - still successful
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert!(result.is_ok());
    /// ```
    ///
    /// Adding a fatal diagnostic:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, Status, StatusExt};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result: Status<_, _, ()> = Status::success(42);
    /// // Add a fatal error - becomes error
    /// result.push_diagnostic(Diagnostic::new(CATEGORY, Severity::Error));
    /// assert!(result.is_err());
    /// ```
    fn push_diagnostic(&mut self, diagnostic: Diagnostic<C, S>);

    /// Adds all diagnostics from another collection to this result.
    ///
    /// If the result is currently successful and any of the added diagnostics are fatal, the result
    /// is converted to an error state using the first fatal diagnostic found. All diagnostics
    /// are consumed from the source collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity, Status, StatusExt};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut result: Status<_, _, ()> = Status::success(42);
    /// let mut additional = DiagnosticIssues::new();
    /// additional.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// additional.push(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// result.append_diagnostics(&mut additional);
    ///
    /// // Result became an error due to the fatal diagnostic
    /// assert!(result.is_err());
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

    fn success(value: T) -> Self {
        Self::Ok(Success {
            value,
            advisories: DiagnosticIssues::new(),
        })
    }

    fn failure(error: Diagnostic<C, S, Critical>) -> Self {
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
