use core::mem;

use crate::{
    Diagnostic, Failure, Severity, Success,
    category::DiagnosticCategory,
    severity::{Advisory, Critical, SeverityKind},
    status::Status,
};

/// Type alias for [`DiagnosticIssues`] with type-erased diagnostic categories.
///
/// This convenience type allows working with collections of diagnostics where the specific category
/// types may vary.
pub type BoxedDiagnosticIssues<'category, S, K = Severity> =
    DiagnosticIssues<Box<dyn DiagnosticCategory + 'category>, S, K>;

/// Type alias for [`DiagnosticIssues`] containing only critical diagnostics.
///
/// This type ensures compile-time safety by restricting the collection to only critical (fatal)
/// diagnostics that prevent successful compilation.
pub type CriticalDiagnosticIssues<C, S> = DiagnosticIssues<C, S, Critical>;

/// Type alias for [`DiagnosticIssues`] containing only advisory diagnostics.
///
/// This type ensures compile-time safety by restricting the collection to only advisory (non-fatal)
/// diagnostics such as warnings and informational messages.
pub type AdvisoryDiagnosticIssues<C, S> = DiagnosticIssues<C, S, Advisory>;

/// A collection of diagnostic messages for error reporting.
///
/// [`DiagnosticIssues`] collects diagnostic messages during compilation phases, allowing you to
/// accumulate errors, warnings, and other messages before deciding how to handle them. Critical
/// diagnostics are errors that prevent successful compilation (severity codes ≥ 400).
///
/// # Examples
///
/// Basic usage:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
/// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
/// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
///
/// assert_eq!(issues.len(), 2);
/// assert_eq!(issues.critical(), 1);
/// ```
///
/// Working with the [`DiagnosticSink`] trait to process results:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, DiagnosticSink, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
///
/// // Success case - value is extracted
/// let success: Result<i32, Diagnostic<_, ()>> = Ok(42);
/// if let Some(value) = issues.sink(success) {
///     assert_eq!(value, 42);
/// }
///
/// // Error case - diagnostic is collected
/// let error = Result::<i32, _>::Err(Diagnostic::new(CATEGORY, Severity::Error));
/// assert!(issues.sink(error).is_none());
/// assert_eq!(issues.len(), 1);
/// ```
#[must_use]
#[derive(Debug)]
pub struct DiagnosticIssues<C, S, K = Severity> {
    diagnostics: Vec<Diagnostic<C, S, K>>,
    critical: usize,
}

impl<C, S, K> DiagnosticIssues<C, S, K> {
    /// Creates a new, empty collection of diagnostic issues.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::DiagnosticIssues;
    ///
    /// let issues: DiagnosticIssues<(), ()> = DiagnosticIssues::new();
    /// assert_eq!(issues.len(), 0);
    /// assert_eq!(issues.critical(), 0);
    /// assert!(issues.is_empty());
    /// ```
    pub const fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
            critical: 0,
        }
    }

    /// Transforms the category of each diagnostic.
    ///
    /// This is useful when moving diagnostics between compilation phases that
    /// use different category types.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const PARSER_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "parser", name: "Parser"
    /// # };
    /// # const LOWERING_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "lowering", name: "Lowering"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(PARSER_CATEGORY, Severity::Error));
    ///
    /// let lowering_issues = issues.map_category(|_| LOWERING_CATEGORY);
    /// ```
    pub fn map_category<C2>(self, mut func: impl FnMut(C) -> C2) -> DiagnosticIssues<C2, S, K> {
        DiagnosticIssues {
            diagnostics: self
                .diagnostics
                .into_iter()
                .map(|diagnostic| diagnostic.map_category(&mut func))
                .collect(),
            critical: self.critical,
        }
    }

    /// Converts to a collection with type-erased categories.
    ///
    /// When combining diagnostics from different compilation phases that use
    /// different category types, this method allows them to be stored together.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// let boxed_issues = issues.boxed();
    /// ```
    pub fn boxed<'category>(self) -> BoxedDiagnosticIssues<'category, S, K>
    where
        C: DiagnosticCategory + 'category,
    {
        DiagnosticIssues {
            diagnostics: self
                .diagnostics
                .into_iter()
                .map(Diagnostic::boxed)
                .collect(),
            critical: self.critical,
        }
    }

    /// Removes all diagnostics from the collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// assert_eq!(issues.len(), 1);
    ///
    /// issues.clear();
    /// assert_eq!(issues.len(), 0);
    /// assert_eq!(issues.critical(), 0);
    /// assert!(issues.is_empty());
    /// ```
    pub fn clear(&mut self) {
        self.diagnostics.clear();
        self.critical = 0;
    }

    /// Returns the number of critical diagnostics.
    ///
    /// Critical diagnostics are errors that prevent successful compilation
    /// (severity codes ≥ 400). This method runs in O(1) time.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// assert_eq!(issues.critical(), 0);
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// assert_eq!(issues.critical(), 1);
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert_eq!(issues.critical(), 1); // Warnings are not critical
    /// ```
    #[must_use]
    pub const fn critical(&self) -> usize {
        self.critical
    }

    /// Returns the number of advisory (non-critical) diagnostics.
    ///
    /// Advisory diagnostics are warnings, notes, and other non-fatal messages
    /// (severity codes < 400). This method runs in O(1) time.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// assert_eq!(issues.advisory(), 0);
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert_eq!(issues.advisory(), 1);
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// assert_eq!(issues.advisory(), 1); // Errors are not advisory
    /// assert_eq!(issues.critical(), 1);
    /// ```
    #[must_use]
    pub const fn advisory(&self) -> usize {
        self.len() - self.critical
    }

    /// Returns the total number of diagnostics.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// assert_eq!(issues.len(), 0);
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert_eq!(issues.len(), 2);
    /// ```
    #[must_use]
    pub const fn len(&self) -> usize {
        self.diagnostics.len()
    }

    /// Returns `true` if the collection contains no diagnostics.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// assert!(issues.is_empty());
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert!(!issues.is_empty());
    /// ```
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.diagnostics.is_empty()
    }

    /// Moves all diagnostics from another collection into this one.
    ///
    /// After this operation, the other collection will be empty and all its
    /// diagnostics will have been moved to this collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut main_issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// main_issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// let mut other_issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// other_issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// main_issues.append(&mut other_issues);
    ///
    /// assert_eq!(main_issues.len(), 2);
    /// assert_eq!(main_issues.critical(), 1);
    /// assert!(other_issues.is_empty());
    /// ```
    pub fn append(&mut self, other: &mut Self) {
        self.critical += other.critical;
        self.diagnostics.append(&mut other.diagnostics);
        other.critical = 0;
    }

    /// Returns an iterator over the diagnostics.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// for diagnostic in issues.iter() {
    ///     println!("Severity: {:?}", diagnostic.severity);
    /// }
    /// ```
    pub fn iter(&self) -> impl Iterator<Item = &Diagnostic<C, S, K>> {
        self.diagnostics.iter()
    }

    /// Returns a mutable iterator over the diagnostics in the collection.
    pub fn iter_mut(&mut self) -> impl Iterator<Item = &mut Diagnostic<C, S, K>> {
        self.diagnostics.iter_mut()
    }
}

impl<C, S, K> DiagnosticIssues<C, S, K>
where
    K: SeverityKind,
{
    /// Transforms each diagnostic using the provided function.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const OLD_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "old", name: "Old"
    /// # };
    /// # const NEW_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "new", name: "New"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(OLD_CATEGORY, Severity::Error));
    ///
    /// let transformed: DiagnosticIssues<_, ()> =
    ///     issues.map(|diagnostic| Diagnostic::new(NEW_CATEGORY, diagnostic.severity));
    /// ```
    pub fn map<C2, S2, K2>(
        self,
        func: impl FnMut(Diagnostic<C, S, K>) -> Diagnostic<C2, S2, K2>,
    ) -> DiagnosticIssues<C2, S2, K2>
    where
        K2: SeverityKind,
    {
        let diagnostics: Vec<_> = self.diagnostics.into_iter().map(func).collect();

        // re-calculate the fatal count as it might have changed during iteration
        let critical = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_critical())
            .count();

        DiagnosticIssues {
            diagnostics,
            critical,
        }
    }

    /// Inserts a diagnostic at the beginning of the collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// issues.insert_front(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// // The error is now first
    /// let first = issues.iter().next().expect("should have diagnostics");
    /// assert_eq!(first.severity, Severity::Error);
    /// ```
    pub fn insert_front(&mut self, diagnostic: Diagnostic<C, S, K>) {
        self.critical += usize::from(diagnostic.severity.is_critical());
        self.diagnostics.insert(0, diagnostic);
    }

    /// Adds a diagnostic to the collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// assert_eq!(issues.len(), 2);
    /// assert_eq!(issues.critical(), 1);
    /// ```
    pub fn push(&mut self, diagnostic: Diagnostic<C, S, K>) {
        self.critical += usize::from(diagnostic.severity.is_critical());
        self.diagnostics.push(diagnostic);
    }

    /// Removes and returns the last diagnostic.
    ///
    /// Returns [`None`] if the collection is empty.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// let last = issues.pop().expect("should have diagnostic");
    /// assert_eq!(last.severity, Severity::Warning);
    /// assert_eq!(issues.len(), 1);
    ///
    /// let first = issues.pop().expect("should have one diagnostic");
    /// assert_eq!(first.severity, Severity::Error);
    /// assert_eq!(issues.len(), 0);
    ///
    /// assert!(issues.pop().is_none());
    /// ```
    pub fn pop(&mut self) -> Option<Diagnostic<C, S, K>> {
        let diagnostic = self.diagnostics.pop();

        if let Some(diagnostic) = &diagnostic {
            self.critical -= usize::from(diagnostic.severity.is_critical());
        }

        diagnostic
    }

    pub fn generalize(self) -> DiagnosticIssues<C, S, Severity> {
        DiagnosticIssues {
            diagnostics: self
                .diagnostics
                .into_iter()
                .map(Diagnostic::generalize)
                .collect(),
            critical: self.critical,
        }
    }
}

impl<C, S> DiagnosticIssues<C, S, Severity> {
    #[expect(
        clippy::result_large_err,
        reason = "The error is only used transiently"
    )]
    pub(crate) fn merge_into_advisories(
        &mut self,
        other: &mut DiagnosticIssues<C, S, Advisory>,
    ) -> Result<(), (Diagnostic<C, S, Critical>, Self)> {
        if self.critical == 0 {
            // We only have non-critical diagnostics, so we can merge them directly
            other.diagnostics.extend(
                self.diagnostics
                    .drain(..)
                    .map(Diagnostic::into_advisory_unchecked),
            );

            return Ok(());
        }

        let position = self
            .diagnostics
            .iter()
            .position(|diagnostic| diagnostic.severity.is_critical())
            .unwrap_or_else(|| {
                unreachable!(
                    "`self.critical` indicated that at least one critical diagnostic exists"
                )
            });

        let diagnostic = self.diagnostics.swap_remove(position);
        self.critical -= 1;

        let failure = diagnostic.into_critical_unchecked();

        self.diagnostics
            .extend(other.diagnostics.drain(..).map(Diagnostic::generalize));

        let this = mem::take(self);

        Err((failure, this))
    }
}

impl<C, S, K> Extend<Diagnostic<C, S, K>> for DiagnosticIssues<C, S, K>
where
    K: SeverityKind,
{
    #[expect(clippy::indexing_slicing, reason = "indexing is checked")]
    fn extend<T: IntoIterator<Item = Diagnostic<C, S, K>>>(&mut self, iter: T) {
        let previous = self.diagnostics.len();
        self.diagnostics.extend(iter);

        if self.diagnostics.len() == previous {
            return;
        }

        self.critical += self.diagnostics[previous..]
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_critical())
            .count();
    }
}

impl<C, S, K> IntoIterator for DiagnosticIssues<C, S, K> {
    type IntoIter = alloc::vec::IntoIter<Self::Item>;
    type Item = Diagnostic<C, S, K>;

    fn into_iter(self) -> Self::IntoIter {
        self.diagnostics.into_iter()
    }
}

impl<C, S, K> Default for DiagnosticIssues<C, S, K> {
    fn default() -> Self {
        Self::new()
    }
}

/// A trait for collecting diagnostic information from fallible operations.
///
/// `DiagnosticSink` provides a way to process [`Result`] values that may contain
/// either successful outcomes or diagnostic information. This allows you to
/// separate success values from diagnostics while accumulating all diagnostic
/// information for later reporting.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Diagnostic, DiagnosticIssues, DiagnosticSink, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut issues = DiagnosticIssues::new();
///
/// // Process successful operations
/// let success: Result<i32, Diagnostic<_, ()>> = Ok(42);
/// if let Some(value) = issues.sink(success) {
///     println!("Got value: {}", value);
/// }
///
/// // Process failed operations - diagnostics are collected
/// let error = Result::<i32, _>::Err(Diagnostic::new(CATEGORY, Severity::Error));
/// assert!(issues.sink(error).is_none());
/// assert_eq!(issues.len(), 1);
/// ```
pub trait DiagnosticSink<T> {
    type Output;

    /// Processes the input value, extracting success values and collecting diagnostics.
    ///
    /// Returns [`Some`] for successful operations and [`None`] when diagnostics
    /// are collected instead.
    fn sink(&mut self, value: T) -> Option<Self::Output>;
}

impl<T, C, S, K> DiagnosticSink<Result<T, Diagnostic<C, S, K>>> for DiagnosticIssues<C, S, K>
where
    K: SeverityKind,
{
    type Output = T;

    fn sink(&mut self, value: Result<T, Diagnostic<C, S, K>>) -> Option<Self::Output> {
        match value {
            Ok(value) => Some(value),
            Err(diagnostic) => {
                self.push(diagnostic);
                None
            }
        }
    }
}

impl<T, C, S, K> DiagnosticSink<Result<T, Self>> for DiagnosticIssues<C, S, K>
where
    K: SeverityKind,
{
    type Output = T;

    fn sink(&mut self, value: Result<T, Self>) -> Option<Self::Output> {
        match value {
            Ok(value) => Some(value),
            Err(mut issues) => {
                self.append(&mut issues);
                None
            }
        }
    }
}

impl<T, C, S> DiagnosticSink<Success<T, C, S>> for DiagnosticIssues<C, S, Advisory> {
    type Output = T;

    fn sink(&mut self, mut value: Success<T, C, S>) -> Option<Self::Output> {
        self.append(&mut value.advisories);

        Some(value.value)
    }
}

impl<T, C, S> DiagnosticSink<Success<T, C, S>> for DiagnosticIssues<C, S, Severity> {
    type Output = T;

    fn sink(&mut self, value: Success<T, C, S>) -> Option<Self::Output> {
        self.append(&mut value.advisories.generalize());

        Some(value.value)
    }
}

impl<T, C, S> DiagnosticSink<Status<T, C, S>> for DiagnosticIssues<C, S> {
    type Output = T;

    fn sink(&mut self, value: Status<T, C, S>) -> Option<Self::Output> {
        match value {
            Ok(Success { value, advisories }) => {
                self.append(&mut advisories.generalize());
                Some(value)
            }
            Err(Failure {
                primary,
                mut secondary,
            }) => {
                self.push(primary.generalize());
                self.append(&mut secondary);
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Diagnostic, Severity, category::TerminalDiagnosticCategory};

    const TEST_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
        id: "test",
        name: "Test Category",
    };

    const ERROR_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
        id: "error",
        name: "Error Category",
    };

    #[test]
    fn map_preserves_fatal_count_correctly() {
        let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();

        issues.push(Diagnostic::new(TEST_CATEGORY, Severity::Error));
        issues.push(Diagnostic::new(TEST_CATEGORY, Severity::Fatal));
        issues.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));

        let transformed = issues.map(|mut diagnostic| {
            diagnostic.severity = Severity::Fatal;
            diagnostic
        });

        assert_eq!(transformed.len(), 3);
        assert_eq!(transformed.critical(), 3);
    }

    #[test]
    fn extend_trait_adds_diagnostics_correctly() {
        let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();

        issues.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));

        assert_eq!(issues.len(), 1);
        assert_eq!(issues.critical(), 0);

        issues.extend([
            Diagnostic::new(ERROR_CATEGORY, Severity::Error),
            Diagnostic::new(TEST_CATEGORY, Severity::Note),
            Diagnostic::new(ERROR_CATEGORY, Severity::Fatal),
        ]);

        assert_eq!(issues.len(), 4);
        assert_eq!(issues.critical(), 2);
    }

    #[test]
    fn extend_trait_handles_empty_iterator() {
        let mut issues = DiagnosticIssues::new();
        issues.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));

        issues.extend([] as [Diagnostic<_, ()>; 0]);

        assert_eq!(issues.len(), 1);
        assert_eq!(issues.critical(), 0);
    }

    #[test]
    fn into_iterator_trait_consumes_collection() {
        let mut issues: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
        issues.push(Diagnostic::new(TEST_CATEGORY, Severity::Error));
        issues.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));
        issues.push(Diagnostic::new(TEST_CATEGORY, Severity::Note));

        let collected: Vec<_> = issues.into_iter().collect();

        assert_eq!(collected.len(), 3);
        assert_eq!(collected[0].severity, Severity::Error);
        assert_eq!(collected[1].severity, Severity::Warning);
        assert_eq!(collected[2].severity, Severity::Note);
    }

    #[test]
    fn default_trait_creates_empty_collection() {
        let issues: DiagnosticIssues<(), ()> = DiagnosticIssues::default();

        assert_eq!(issues.len(), 0);
        assert_eq!(issues.critical(), 0);
        assert!(issues.is_empty());
    }

    #[test]
    fn diagnostic_sink_with_single_diagnostic_success() {
        let mut issues: DiagnosticIssues<TerminalDiagnosticCategory, ()> = DiagnosticIssues::new();
        let success: Result<&'static str, Diagnostic<_, ()>> = Ok("success");

        let value = issues.sink(success);

        assert_eq!(value, Some("success"));
        assert_eq!(issues.len(), 0);
    }

    #[test]
    fn diagnostic_sink_with_single_diagnostic_error() {
        let mut issues = DiagnosticIssues::new();
        let error: Result<&'static str, Diagnostic<_, ()>> =
            Err(Diagnostic::new(ERROR_CATEGORY, Severity::Error));

        let value = issues.sink(error);

        assert_eq!(value, None);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues.critical(), 1);
    }

    #[test]
    fn diagnostic_sink_with_diagnostic_issues_success() {
        let mut primary = DiagnosticIssues::new();
        let success: Result<i32, DiagnosticIssues<TerminalDiagnosticCategory, ()>> = Ok(42);

        let value = primary.sink(success);

        assert_eq!(value, Some(42));
        assert_eq!(primary.len(), 0);
    }

    #[test]
    fn diagnostic_sink_with_diagnostic_issues_error() {
        let mut primary: DiagnosticIssues<_, ()> = DiagnosticIssues::new();
        primary.push(Diagnostic::new(TEST_CATEGORY, Severity::Note));

        let mut secondary = DiagnosticIssues::new();
        secondary.push(Diagnostic::new(ERROR_CATEGORY, Severity::Error));
        secondary.push(Diagnostic::new(TEST_CATEGORY, Severity::Warning));

        let error_result: Result<i32, _> = Err(secondary);
        let value = primary.sink(error_result);

        assert!(value.is_none());
        assert_eq!(primary.len(), 3); // Original note + error + warning
        assert_eq!(primary.critical(), 1); // Only the error is fatal
    }

    #[test]
    fn boxed_diagnostic_issues_type_alias() {
        let mut issues: BoxedDiagnosticIssues<()> = DiagnosticIssues::new();
        let diagnostic = Diagnostic::new(TEST_CATEGORY, Severity::Error).boxed();

        issues.push(diagnostic);

        assert_eq!(issues.len(), 1);
        assert_eq!(issues.critical(), 1);
    }
}
