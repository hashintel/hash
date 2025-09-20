mod help;
mod label;
mod note;
mod render;

use alloc::borrow::Cow;
use core::{
    error::Error,
    fmt::{Debug, Display},
};

use ariadne::ColorGenerator;
use error_stack::{Report, TryReportIteratorExt as _};

pub use self::{help::Help, label::Label, note::Note};
use crate::{
    category::{
        CanonicalDiagnosticCategoryId, CanonicalDiagnosticCategoryName, DiagnosticCategory,
        category_display_name,
    },
    config::ReportConfig,
    error::ResolveError,
    severity::{Advisory, Critical, Severity, SeverityKind},
    source::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};

/// Type alias for [`Diagnostic`] with absolute diagnostic spans.
///
/// This convenience type is used when working with diagnostics that have already been resolved to
/// absolute source positions, making them ready for display.
pub type AbsoluteDiagnostic<C, F = Severity> = Diagnostic<C, AbsoluteDiagnosticSpan, F>;

/// Type alias for [`Diagnostic`] with type-erased diagnostic categories.
///
/// This convenience type allows working with diagnostics where the specific category types may
/// vary, useful when combining diagnostics from different compilation phases.
pub type BoxedDiagnostic<'category, S, F = Severity> =
    Diagnostic<Box<dyn DiagnosticCategory + 'category>, S, F>;

/// Type alias for [`Diagnostic`] containing only critical diagnostics.
///
/// This type ensures compile-time safety by restricting diagnostics to only critical (fatal)
/// severity levels that prevent successful compilation.
pub type CriticalDiagnostic<C, S> = Diagnostic<C, S, Critical>;

/// Type alias for [`Diagnostic`] containing only advisory diagnostics.
///
/// This type ensures compile-time safety by restricting diagnostics to only advisory (non-fatal)
/// severity levels such as warnings and informational messages.
pub type AdvisoryDiagnostic<C, S> = Diagnostic<C, S, Advisory>;

/// A diagnostic message representing an issue found during compilation.
///
/// [`Diagnostic`] is the core type for representing compilation errors, warnings, and other
/// messages. It contains all the information needed to display a helpful diagnostic to the user,
/// including the issue category, severity level, descriptive message, source code labels,
/// explanatory notes, and suggested fixes.
///
/// The diagnostic system uses a three-parameter design:
/// - `C`: The category type, identifying what kind of issue this is
/// - `S`: The span type, indicating where in the source code the issue occurs
/// - `K`: The severity kind, controlling the diagnostic's severity level
///
/// # Examples
///
/// Creating a basic diagnostic:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let diagnostic: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Error);
/// assert_eq!(diagnostic.severity, Severity::Error);
/// assert!(diagnostic.labels.is_empty());
/// assert!(diagnostic.notes.is_empty());
/// assert!(diagnostic.help.is_empty());
/// ```
///
/// Adding additional information:
///
/// ```
/// use hashql_diagnostics::{Diagnostic, Help, Note, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "example", name: "Example"
/// # };
///
/// let mut diagnostic: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Warning);
/// diagnostic
///     .add_note(Note::new("This might cause issues"))
///     .add_help(Help::new("Consider using a different approach"));
///
/// assert_eq!(diagnostic.notes.len(), 1);
/// assert_eq!(diagnostic.help.len(), 1);
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[must_use = "A diagnostic must be reported"]
pub struct Diagnostic<C, S, K = Severity> {
    /// The category identifying the type of diagnostic issue.
    pub category: C,
    /// The severity level of the diagnostic.
    pub severity: K,

    /// Optional primary message describing the issue.
    ///
    /// If not provided, the diagnostic will use the category's display name.
    pub message: Option<Cow<'static, str>>,

    /// Labels pointing to specific locations in source code.
    ///
    /// Labels highlight relevant parts of the code and can include explanatory messages about
    /// what's wrong at each location.
    pub labels: Vec<Label<S>>,

    /// Additional explanatory notes about the diagnostic.
    ///
    /// Notes provide extra context or background information to help users understand the issue.
    pub notes: Vec<Note>,

    /// Suggested fixes or help messages for resolving the issue.
    ///
    /// Help messages guide users toward solutions for the reported problem.
    pub help: Vec<Help>,
}

impl<C, S, K> Diagnostic<C, S, K> {
    /// Creates a new diagnostic with the specified category and severity.
    ///
    /// Initializes an empty diagnostic that can be populated with message, labels, notes, and help
    /// messages through the appropriate methods. The category and severity determine how the
    /// diagnostic will be classified and displayed.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "syntax_error", name: "Syntax Error"
    /// # };
    ///
    /// let diagnostic: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Error);
    /// assert_eq!(diagnostic.severity, Severity::Error);
    /// assert!(diagnostic.message.is_none());
    /// assert!(diagnostic.labels.is_empty());
    /// ```
    pub const fn new(category: C, severity: K) -> Self {
        Self {
            category,
            severity,
            message: None,
            labels: Vec::new(),
            notes: Vec::new(),
            help: Vec::new(),
        }
    }
}

impl<C, S> Diagnostic<C, S> {
    /// Converts a diagnostic to critical severity without runtime checks.
    ///
    /// This is an internal method used when the severity is known to be critical at compile time.
    /// Debug builds will assert that the severity is actually critical.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `self.severity.is_critical()` returns `true`.
    pub(crate) fn into_critical_unchecked(self) -> Diagnostic<C, S, Critical> {
        debug_assert!(self.severity.is_critical());

        self.map_severity(Critical::new_unchecked)
    }

    /// Converts a diagnostic to advisory severity without runtime checks.
    ///
    /// This is an internal method used when the severity is known to be advisory at compile time.
    /// Debug builds will assert that the severity is actually advisory.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `self.severity.is_advisory()` returns `true`.
    pub(crate) fn into_advisory_unchecked(self) -> Diagnostic<C, S, Advisory> {
        debug_assert!(self.severity.is_advisory());

        self.map_severity(Advisory::new_unchecked)
    }

    /// Specializes the diagnostic based on its severity level.
    ///
    /// Attempts to convert the diagnostic to an advisory (non-critical) diagnostic. If the
    /// diagnostic has a critical severity, returns it as a critical diagnostic in the error
    /// case.
    ///
    /// This method provides type-safe access to severity-specific operations while
    /// preserving all diagnostic information.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// // Advisory diagnostic
    /// let warning: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Warning);
    /// match warning.specialize() {
    ///     Ok(advisory) => println!("Got advisory diagnostic"),
    ///     Err(_) => panic!("Should be advisory"),
    /// }
    ///
    /// // Critical diagnostic
    /// let error: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Error);
    /// match error.specialize() {
    ///     Ok(_) => panic!("Should be critical"),
    ///     Err(critical) => println!("Got critical diagnostic"),
    /// }
    /// ```
    #[expect(
        clippy::missing_errors_doc,
        reason = "not an actual error, but instead categorization into error or okay"
    )]
    pub fn specialize(self) -> Result<Diagnostic<C, S, Advisory>, Diagnostic<C, S, Critical>> {
        if self.severity.is_critical() {
            return Err(self.into_critical_unchecked());
        }

        Ok(self.into_advisory_unchecked())
    }
}

impl<C, S, K> Diagnostic<C, S, K>
where
    K: Copy + Into<Severity>,
{
    /// Converts severity-specialized diagnostics to use the general [`Severity`] type.
    ///
    /// This method relaxes the type constraint from specialized severity types like [`Critical`] or
    /// [`Advisory`] to the general [`Severity`] enumeration, allowing the diagnostic to be stored
    /// alongside diagnostics of other severity levels.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let diagnostic: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Error);
    /// let critical = diagnostic.specialize().expect_err("should be critical");
    /// let generalized = critical.generalize();
    ///
    /// // Now it can be stored with other general diagnostics
    /// assert_eq!(generalized.severity, Severity::Error);
    /// ```
    pub fn generalize(self) -> Diagnostic<C, S, Severity> {
        Diagnostic {
            category: self.category,
            severity: self.severity.into(),
            message: self.message,
            labels: self.labels,
            notes: self.notes,
            help: self.help,
        }
    }
}

impl<C, S, K> Diagnostic<C, S, K> {
    /// Transforms the diagnostic's category using the provided function.
    ///
    /// Takes the current category, applies the transformation function, and produces a new
    /// [`Diagnostic`] with the transformed category while preserving all other fields such as
    /// severity, message, labels, notes, and help messages.
    ///
    /// This is useful when moving diagnostics between compilation phases that use different
    /// category types.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, category::DiagnosticCategory};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const OLD_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "old", name: "Old"
    /// # };
    /// # const NEW_CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "new", name: "New"
    /// # };
    ///
    /// let diagnostic: Diagnostic<_, ()> = Diagnostic::new(OLD_CATEGORY, Severity::Warning);
    /// let transformed = diagnostic.map_category(|_| NEW_CATEGORY);
    ///
    /// assert_eq!(transformed.category.id(), "new");
    /// assert_eq!(transformed.severity, Severity::Warning);
    /// ```
    pub fn map_category<T>(self, func: impl FnOnce(C) -> T) -> Diagnostic<T, S, K> {
        Diagnostic {
            category: func(self.category),
            severity: self.severity,
            message: self.message,
            labels: self.labels,
            notes: self.notes,
            help: self.help,
        }
    }

    pub fn map_severity<K2>(self, func: impl FnOnce(K) -> K2) -> Diagnostic<C, S, K2> {
        Diagnostic {
            category: self.category,
            severity: func(self.severity),
            message: self.message,
            labels: self.labels,
            notes: self.notes,
            help: self.help,
        }
    }

    pub fn map_spans<S2>(self, mut func: impl FnMut(S) -> S2) -> Diagnostic<C, S2, K> {
        Diagnostic {
            category: self.category,
            severity: self.severity,
            message: self.message,
            labels: self
                .labels
                .into_iter()
                .map(|label| label.map_span(&mut func))
                .collect(),
            notes: self.notes,
            help: self.help,
        }
    }

    /// Converts the diagnostic to use a boxed trait object for its category.
    ///
    /// Creates a new [`Diagnostic`] where the category is type-erased into a [`Box<dyn
    /// DiagnosticCategory>`]. This is useful when combining diagnostics from
    /// different compilation phases that use different category types.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, category::DiagnosticCategory};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let diagnostic: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Error);
    /// let boxed = diagnostic.boxed();
    ///
    /// // Can now be stored alongside diagnostics with different category types
    /// assert_eq!(boxed.severity, Severity::Error);
    /// assert_eq!(boxed.category.id(), "example");
    /// ```
    pub fn boxed<'category>(self) -> BoxedDiagnostic<'category, S, K>
    where
        C: DiagnosticCategory + 'category,
    {
        self.map_category(|category| Box::new(category) as Box<dyn DiagnosticCategory>)
    }

    /// Adds a note to the diagnostic.
    ///
    /// Appends the provided [`Note`] to the diagnostic's collection of notes. Notes provide
    /// additional context or information about the diagnostic that helps users understand
    /// the issue. This method returns a mutable reference to enable method chaining.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Note, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut diagnostic: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Warning);
    /// diagnostic.add_note(Note::new("This is additional context"));
    ///
    /// assert_eq!(diagnostic.notes.len(), 1);
    /// ```
    pub fn add_note(&mut self, note: Note) -> &mut Self {
        self.notes.push(note);
        self
    }

    /// Adds a help message to the diagnostic.
    ///
    /// Appends the provided [`Help`] message to the diagnostic's collection of help messages.
    /// Help messages suggest ways to fix or work around the issue described by the diagnostic.
    /// This method returns a mutable reference to enable method chaining.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Help, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut diagnostic: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Error);
    /// diagnostic.add_help(Help::new("Try using a different syntax"));
    ///
    /// assert_eq!(diagnostic.help.len(), 1);
    /// ```
    pub fn add_help(&mut self, help: Help) -> &mut Self {
        self.help.push(help);
        self
    }

    /// Resolves the diagnostic by converting span references to absolute positions.
    ///
    /// Takes a diagnostic with potentially unresolved span references and converts all labels to
    /// use absolute diagnostic spans that can be displayed to users. This process looks up span
    /// identifiers in the provided context to get their actual source locations.
    ///
    /// # Errors
    ///
    /// - [`ResolveError`] if any span identifier cannot be found in the span storage or if span
    ///   resolution fails for any other reason
    ///
    /// # Examples
    ///
    /// ```ignore
    /// use hashql_diagnostics::{Diagnostic, Label, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let mut diagnostic = Diagnostic::new(CATEGORY, Severity::Error);
    /// // Add labels with span references...
    ///
    /// let resolved = diagnostic.resolve(&mut context)?;
    /// // Now has absolute spans ready for display
    /// # Ok::<(), Box<dyn std::error::Error>>(())
    /// ```
    pub fn resolve<DiagnosticContext>(
        self,
        context: &mut DiagnosticContext,
    ) -> Result<Diagnostic<C, AbsoluteDiagnosticSpan, K>, Report<[ResolveError]>>
    where
        S: DiagnosticSpan<DiagnosticContext>,
    {
        let labels: Vec<_> = self
            .labels
            .into_iter()
            .map(|label| label.resolve(context))
            .try_collect_reports()?;

        Ok(Diagnostic {
            category: self.category,
            severity: self.severity,
            message: self.message,

            labels,
            notes: self.notes,
            help: self.help,
        })
    }
}

impl<C, K> Diagnostic<C, AbsoluteDiagnosticSpan, K>
where
    C: DiagnosticCategory,
    K: SeverityKind,
{
    /// Creates a formatted report for displaying the diagnostic to users.
    ///
    /// Converts this diagnostic into an ariadne [`Report`] that includes source code context,
    /// colorized highlighting, and all the diagnostic information (message, labels, notes, and
    /// help messages). The report can be written to a terminal or other output destination.
    /// The visual appearance is controlled by the provided [`ReportConfig`].
    ///
    /// The generated report includes:
    /// - Syntax-highlighted source code context
    /// - Colored labels pointing to problem areas
    /// - Primary diagnostic message
    /// - Additional notes and help messages
    /// - Severity-specific styling and icons
    ///
    /// # Examples
    ///
    /// ```ignore
    /// use hashql_diagnostics::{Diagnostic, ReportConfig, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let diagnostic = Diagnostic::new(CATEGORY, Severity::Error);
    /// let resolved = diagnostic.resolve(&mut context)?;
    ///
    /// let report = resolved.report(ReportConfig::default());
    /// report.print(sources)?; // Display to user
    /// # Ok::<(), Box<dyn std::error::Error>>(())
    /// ```
    pub fn render_(&self, config: ReportConfig) -> ariadne::Report<'_, AbsoluteDiagnosticSpan> {
        // According to the examples, the span given to `Report::build` should be the span of the
        // primary (first) label.
        // See: https://github.com/zesterer/ariadne/blob/74c2a7f8881e95629f9fb8d70140c133972d81d3/examples/simple.rs#L14
        let span = self
            .labels
            .first()
            .map_or_else(AbsoluteDiagnosticSpan::full, |label| *label.span());

        let severity: Severity = self.severity.into();

        let mut generator = ColorGenerator::new();

        let mut builder = ariadne::Report::build(severity.kind(), span)
            .with_code(CanonicalDiagnosticCategoryId::new(&self.category));

        builder.set_message(
            self.message
                .clone()
                .unwrap_or_else(|| category_display_name(&self.category)),
        );

        for note in &self.notes {
            builder.add_note(note.colored(config.color));
        }

        for note in severity.notes() {
            builder.add_note(note.colored(config.color));
        }

        for help in &self.help {
            builder.add_help(help.colored(config.color));
        }

        for help in severity.help() {
            builder.add_help(help.colored(config.color));
        }

        for label in &self.labels {
            builder.add_label(label.ariadne(config.color, &mut generator));
        }

        builder = builder.with_config(config.into());

        builder.finish()
    }
}

impl<C, S, K> Display for Diagnostic<C, S, K>
where
    C: DiagnosticCategory,
    S: Display,
    K: Display,
{
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(
            fmt,
            "[{}] {}",
            self.severity,
            CanonicalDiagnosticCategoryName::new(&self.category)
        )
    }
}

impl<C, S, K> Error for Diagnostic<C, S, K>
where
    C: Debug + DiagnosticCategory,
    S: Debug + Display,
    K: Debug + Display,
{
}
