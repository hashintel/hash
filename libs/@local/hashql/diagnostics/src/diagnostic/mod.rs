mod label;
mod message;
mod patch;
mod render;
pub(crate) mod zindex;

use alloc::borrow::Cow;
use core::{
    error::Error,
    fmt::{Debug, Display},
};

use error_stack::{Report, TryReportTupleExt};

pub use self::{
    label::{Label, Labels},
    message::{Message, Messages},
    patch::{Patch, Patches},
};
use crate::{
    category::{CanonicalDiagnosticCategoryName, DiagnosticCategory},
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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[must_use = "A diagnostic header must be materialized"]
pub struct DiagnosticHeader<C, K> {
    pub category: C,
    pub severity: K,
}

impl<C, K> DiagnosticHeader<C, K> {
    pub fn primary<S>(self, label: Label<S>) -> Diagnostic<C, S, K> {
        Diagnostic {
            category: self.category,
            severity: self.severity,
            title: None,
            labels: Labels::new(label),
            patches: Patches::new(),
            messages: Messages::new(),
        }
    }
}

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
    pub title: Option<Cow<'static, str>>,

    /// Labels pointing to specific locations in source code.
    ///
    /// Labels highlight relevant parts of the code and can include explanatory messages about
    /// what's wrong at each location.
    pub labels: Labels<S>,
    pub patches: Patches<S>,

    /// Additional explanatory notes about the diagnostic.
    ///
    /// Notes provide extra context or background information to help users understand the issue.
    pub messages: Messages,
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
    pub const fn new(category: C, severity: Severity) -> DiagnosticHeader<C, Severity> {
        DiagnosticHeader { category, severity }
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
    K: SeverityKind,
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
        self.with_severity(Into::into)
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
            title: self.title,
            labels: self.labels,
            patches: self.patches,
            messages: self.messages,
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

    pub fn add_label(&mut self, label: impl Into<Label<S>>) -> &mut Self {
        self.labels.push(label.into());
        self
    }

    pub fn add_patch(&mut self, patch: impl Into<Patch<S>>) -> &mut Self {
        self.patches.push(patch.into());
        self
    }

    pub fn add_message(&mut self, message: impl Into<Message>) -> &mut Self {
        self.messages.push(message.into());
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
        let labels = self.labels.resolve(context);
        let patches = self.patches.resolve(context);

        let (labels, patches) = (labels, patches).try_collect()?;

        Ok(Diagnostic {
            category: self.category,
            severity: self.severity,
            title: self.title,

            labels,
            patches,
            messages: self.messages,
        })
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
