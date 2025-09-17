use crate::{Diagnostic, category::DiagnosticCategory};

/// Type alias for [`DiagnosticIssues`] with type-erased diagnostic categories.
///
/// This convenience type allows working with collections of diagnostics where the
/// specific category types may vary.
pub type BoxedDiagnosticIssues<'category, S> =
    DiagnosticIssues<Box<dyn DiagnosticCategory + 'category>, S>;

/// A collection of diagnostic messages for error reporting.
///
/// `DiagnosticIssues` collects diagnostic messages during compilation phases,
/// allowing you to accumulate errors, warnings, and other messages before
/// deciding how to handle them. Fatal diagnostics are errors that prevent
/// successful compilation (severity codes ≥ 400).
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
/// let mut issues = DiagnosticIssues::new();
/// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
/// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
///
/// assert_eq!(issues.len(), 2);
/// assert_eq!(issues.fatal(), 1);
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
/// let mut issues = DiagnosticIssues::new();
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
pub struct DiagnosticIssues<C, S> {
    diagnostics: Vec<Diagnostic<C, S>>,
    fatal: usize,
}

impl<C, S> DiagnosticIssues<C, S> {
    /// Creates a new, empty collection of diagnostic issues.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::DiagnosticIssues;
    ///
    /// let issues: DiagnosticIssues<(), ()> = DiagnosticIssues::new();
    /// assert_eq!(issues.len(), 0);
    /// assert_eq!(issues.fatal(), 0);
    /// assert!(issues.is_empty());
    /// ```
    pub const fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
            fatal: 0,
        }
    }

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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(OLD_CATEGORY, Severity::Error));
    ///
    /// let transformed = issues.map(|diagnostic| Diagnostic::new(NEW_CATEGORY, diagnostic.severity));
    /// ```
    pub fn map<C2, S2>(
        self,
        func: impl FnMut(Diagnostic<C, S>) -> Diagnostic<C2, S2>,
    ) -> DiagnosticIssues<C2, S2> {
        let diagnostics: Vec<_> = self.diagnostics.into_iter().map(func).collect();

        // re-calculate the fatal count as it might have changed during iteration
        let fatal = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_fatal())
            .count();

        DiagnosticIssues { diagnostics, fatal }
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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(PARSER_CATEGORY, Severity::Error));
    ///
    /// let lowering_issues = issues.map_category(|_| LOWERING_CATEGORY);
    /// ```
    pub fn map_category<C2>(self, mut func: impl FnMut(C) -> C2) -> DiagnosticIssues<C2, S> {
        DiagnosticIssues {
            diagnostics: self
                .diagnostics
                .into_iter()
                .map(|diagnostic| diagnostic.map_category(&mut func))
                .collect(),
            fatal: self.fatal,
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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// let boxed_issues = issues.boxed();
    /// ```
    pub fn boxed<'category>(self) -> BoxedDiagnosticIssues<'category, S>
    where
        C: DiagnosticCategory + 'category,
    {
        DiagnosticIssues {
            diagnostics: self
                .diagnostics
                .into_iter()
                .map(Diagnostic::boxed)
                .collect(),
            fatal: self.fatal,
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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// assert_eq!(issues.len(), 1);
    ///
    /// issues.clear();
    /// assert_eq!(issues.len(), 0);
    /// assert_eq!(issues.fatal(), 0);
    /// assert!(issues.is_empty());
    /// ```
    pub fn clear(&mut self) {
        self.diagnostics.clear();
        self.fatal = 0;
    }

    /// Returns the number of fatal diagnostics.
    ///
    /// Fatal diagnostics are errors that prevent successful compilation
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
    /// let mut issues = DiagnosticIssues::new();
    /// assert_eq!(issues.fatal(), 0);
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// assert_eq!(issues.fatal(), 1);
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert_eq!(issues.fatal(), 1); // Warnings are not fatal
    /// ```
    #[must_use]
    pub const fn fatal(&self) -> usize {
        self.fatal
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
    /// let mut issues = DiagnosticIssues::new();
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
    /// let mut issues = DiagnosticIssues::new();
    /// assert!(issues.is_empty());
    ///
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// assert!(!issues.is_empty());
    /// ```
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.diagnostics.is_empty()
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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// issues.insert_front(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// // The error is now first
    /// let first = issues.iter().next().unwrap();
    /// assert_eq!(first.severity, Severity::Error);
    /// ```
    pub fn insert_front(&mut self, diagnostic: Diagnostic<C, S>) {
        self.fatal += usize::from(diagnostic.severity.is_fatal());
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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// assert_eq!(issues.len(), 2);
    /// assert_eq!(issues.fatal(), 1);
    /// ```
    pub fn push(&mut self, diagnostic: Diagnostic<C, S>) {
        self.fatal += usize::from(diagnostic.severity.is_fatal());
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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// let last = issues.pop().unwrap();
    /// assert_eq!(last.severity, Severity::Warning);
    /// assert_eq!(issues.len(), 1);
    ///
    /// let first = issues.pop().unwrap();
    /// assert_eq!(first.severity, Severity::Error);
    /// assert_eq!(issues.len(), 0);
    ///
    /// assert!(issues.pop().is_none());
    /// ```
    pub fn pop(&mut self) -> Option<Diagnostic<C, S>> {
        let diagnostic = self.diagnostics.pop();

        if let Some(diagnostic) = &diagnostic {
            self.fatal -= usize::from(diagnostic.severity.is_fatal());
        }

        diagnostic
    }

    /// Removes and returns the first fatal diagnostic found.
    ///
    /// Returns [`None`] if no fatal diagnostics are present.
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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Note));
    ///
    /// let fatal = issues.pop_fatal().unwrap();
    /// assert_eq!(fatal.severity, Severity::Error);
    /// assert_eq!(issues.fatal(), 0);
    /// assert_eq!(issues.len(), 2);
    ///
    /// assert!(issues.pop_fatal().is_none());
    /// ```
    pub fn pop_fatal(&mut self) -> Option<Diagnostic<C, S>> {
        let position = self
            .diagnostics
            .iter()
            .position(|diagnostic| diagnostic.severity.is_fatal());

        if let Some(position) = position {
            let diagnostic = self.diagnostics.swap_remove(position);
            self.fatal -= 1;
            Some(diagnostic)
        } else {
            None
        }
    }

    /// Moves all diagnostics from another collection into this one.
    ///
    /// The other collection is left empty.
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
    /// let mut main_issues = DiagnosticIssues::new();
    /// main_issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// let mut other_issues = DiagnosticIssues::new();
    /// other_issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    ///
    /// main_issues.append(&mut other_issues);
    ///
    /// assert_eq!(main_issues.len(), 2);
    /// assert_eq!(main_issues.fatal(), 1);
    /// assert!(other_issues.is_empty());
    /// ```
    pub fn append(&mut self, other: &mut Self) {
        self.fatal += other.fatal;
        self.diagnostics.append(&mut other.diagnostics);
        other.fatal = 0;
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
    /// let mut issues = DiagnosticIssues::new();
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Error));
    /// issues.push(Diagnostic::new(CATEGORY, Severity::Warning));
    ///
    /// for diagnostic in issues.iter() {
    ///     println!("Severity: {:?}", diagnostic.severity);
    /// }
    /// ```
    pub fn iter(&self) -> impl Iterator<Item = &Diagnostic<C, S>> {
        self.diagnostics.iter()
    }
}

impl<C, S> Extend<Diagnostic<C, S>> for DiagnosticIssues<C, S> {
    #[expect(clippy::indexing_slicing, reason = "indexing is checked")]
    fn extend<T: IntoIterator<Item = Diagnostic<C, S>>>(&mut self, iter: T) {
        let previous = self.diagnostics.len();
        self.diagnostics.extend(iter);

        if self.diagnostics.len() == previous {
            return;
        }

        self.fatal += self.diagnostics[previous..]
            .iter()
            .filter(|diagnostic| diagnostic.severity.is_fatal())
            .count();
    }
}

impl<C, S> IntoIterator for DiagnosticIssues<C, S> {
    type IntoIter = alloc::vec::IntoIter<Self::Item>;
    type Item = Diagnostic<C, S>;

    fn into_iter(self) -> Self::IntoIter {
        self.diagnostics.into_iter()
    }
}

impl<C, S> Default for DiagnosticIssues<C, S> {
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

impl<T, C, S> DiagnosticSink<Result<T, Diagnostic<C, S>>> for DiagnosticIssues<C, S> {
    type Output = T;

    fn sink(&mut self, value: Result<T, Diagnostic<C, S>>) -> Option<Self::Output> {
        match value {
            Ok(value) => Some(value),
            Err(diagnostic) => {
                self.push(diagnostic);
                None
            }
        }
    }
}

impl<T, C, S> DiagnosticSink<Result<T, Self>> for DiagnosticIssues<C, S> {
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
