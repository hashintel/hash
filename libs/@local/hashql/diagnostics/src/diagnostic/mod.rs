mod label;
mod message;
#[cfg(feature = "render")]
pub mod render;
mod suggestion;

use alloc::borrow::Cow;
use core::{
    error::Error,
    fmt::{Debug, Display},
};

pub use self::{
    label::{Label, Labels},
    message::{Message, Messages},
    suggestion::{Patch, Suggestions},
};
use crate::{
    category::{CanonicalDiagnosticCategoryName, DiagnosticCategory},
    severity::{Advisory, Critical, Severity, SeverityKind},
};

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

/// A partially constructed diagnostic containing category and severity information.
///
/// [`DiagnosticHeader`] is created by [`Diagnostic::new`] and represents the first step
/// in building a complete diagnostic. It contains the diagnostic category (identifying
/// the type of issue) and severity level, but lacks the primary label that points to
/// the specific source location where the issue occurs.
///
/// To complete the diagnostic construction, call [`primary`](DiagnosticHeader::primary)
/// with a label that identifies the main location of the issue.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::{Diagnostic, Label, Severity};
/// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
/// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
/// #     id: "syntax_error", name: "Syntax Error"
/// # };
///
/// // Create a diagnostic header
/// let header = Diagnostic::new(CATEGORY, Severity::Error);
///
/// // Complete it with a primary label
/// let diagnostic = header.primary(Label::new(10..15, "unexpected token"));
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[must_use = "A diagnostic header must be materialized"]
pub struct DiagnosticHeader<C, K> {
    pub category: C,
    pub severity: K,
}

impl<C, K> DiagnosticHeader<C, K> {
    /// Creates a [`Diagnostic`] with the given label as the primary label.
    ///
    /// The primary label is the main focus of the diagnostic, pointing to the exact
    /// location where the issue occurs. Additional secondary labels and messages
    /// can be added to provide context.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Label, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "type_error", name: "Type Error"
    /// # };
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Error);
    /// let label = Label::new(42..45, "expected integer, found string");
    /// let diagnostic = header.primary(label);
    ///
    /// assert_eq!(diagnostic.severity, Severity::Error);
    /// assert_eq!(diagnostic.labels.iter().count(), 1);
    /// assert!(diagnostic.messages.iter().count() == 0);
    /// ```
    ///
    /// Building a diagnostic with additional context:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Label, Message, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "undefined_var", name: "Undefined Variable"
    /// # };
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Error);
    /// let primary_label = Label::new(10..15, "undefined variable");
    /// let mut diagnostic = header.primary(primary_label);
    ///
    /// diagnostic.add_label(Label::new(5..8, "similar variable defined here"));
    /// diagnostic.add_message(Message::help("Did you mean to use this variable instead?"));
    ///
    /// assert_eq!(diagnostic.labels.iter().count(), 2);
    /// assert_eq!(diagnostic.messages.iter().count(), 1);
    /// ```
    pub fn primary<S>(self, label: Label<S>) -> Diagnostic<C, S, K> {
        Diagnostic {
            category: self.category,
            severity: self.severity,
            title: None,
            labels: Labels::new(label),
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

    /// Additional explanatory notes about the diagnostic.
    ///
    /// Notes provide extra context or background information to help users understand the issue.
    pub messages: Messages<S>,
}

impl<C, K> Diagnostic<C, !, K> {
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
    #[expect(clippy::new_ret_no_self)]
    pub const fn new(category: C, severity: K) -> DiagnosticHeader<C, K> {
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
        self.map_severity(Into::into)
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
            messages: self.messages,
        }
    }

    /// Transforms the severity type of the diagnostic using the provided function.
    ///
    /// This method applies a transformation function to convert the diagnostic's severity from
    /// one type to another while preserving all other diagnostic information.
    ///
    /// # Examples
    ///
    /// Converting from a specialized severity to a general severity:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity, severity::Critical};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let diagnostic: Diagnostic<_, (), Severity> = Diagnostic::new(CATEGORY, Severity::Error);
    /// let critical = diagnostic.specialize().expect_err("should be critical");
    ///
    /// // Convert back to general severity
    /// let general = critical.map_severity(|severity| severity.into());
    /// assert_eq!(general.severity, Severity::Error);
    /// ```
    ///
    /// Custom severity transformations:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    /// # #[derive(Debug, PartialEq)]
    /// # enum CustomSeverity { Low, High }
    ///
    /// let diagnostic: Diagnostic<_, ()> = Diagnostic::new(CATEGORY, Severity::Warning);
    /// let custom = diagnostic.map_severity(|_| CustomSeverity::Low);
    /// assert_eq!(custom.severity, CustomSeverity::Low);
    /// ```
    pub fn map_severity<K2>(self, func: impl FnOnce(K) -> K2) -> Diagnostic<C, S, K2> {
        Diagnostic {
            category: self.category,
            severity: func(self.severity),
            title: self.title,
            labels: self.labels,
            messages: self.messages,
        }
    }

    /// Transforms all spans in the diagnostic using the provided function.
    ///
    /// This method applies a transformation function to convert all span references in the
    /// diagnostic from one type to another.
    ///
    /// This is particularly useful when moving diagnostics between different compilation
    /// phases that use different span representations, or when converting from relative
    /// to absolute spans for rendering.
    ///
    /// # Examples
    ///
    /// Converting span types:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Label, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Error);
    /// let label = Label::new(10..15, "error here");
    /// let diagnostic = header.primary(label);
    ///
    /// // Convert Range<usize> spans to absolute positions
    /// let converted = diagnostic.map_spans(|range| (range.start, range.end));
    /// // All spans in labels, suggestions, and patches are now (usize, usize) tuples
    /// ```
    ///
    /// Adding offset to all spans:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Label, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "example", name: "Example"
    /// # };
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Warning);
    /// let label = Label::new(5..8, "issue here");
    /// let diagnostic = header.primary(label);
    ///
    /// // Add a base offset to all spans
    /// let offset = 100;
    /// let offset_diagnostic =
    ///     diagnostic.map_spans(|range| (range.start + offset)..(range.end + offset));
    /// ```
    pub fn map_spans<S2>(self, mut func: impl FnMut(S) -> S2) -> Diagnostic<C, S2, K> {
        Diagnostic {
            category: self.category,
            severity: self.severity,
            title: self.title,
            labels: self.labels.map(|label| label.map_span(&mut func)),
            messages: self.messages.map(|message| {
                message.map_suggestions(|suggestion| {
                    suggestion.map_patches(|patch| patch.map_span(&mut func))
                })
            }),
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

    /// Adds a secondary label to the diagnostic.
    ///
    /// Labels point to specific locations in source code to provide context about the
    /// diagnostic issue. While the diagnostic has one primary label (set when created),
    /// additional secondary labels can be added to show related locations, similar
    /// identifiers, or provide additional context.
    ///
    /// # Examples
    ///
    /// Adding context labels to show related code locations:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Label, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "redefinition", name: "Variable Redefinition"
    /// # };
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Error);
    /// let primary = Label::new(50..55, "variable redefined here");
    /// let mut diagnostic = header.primary(primary);
    ///
    /// diagnostic
    ///     .add_label(Label::new(10..15, "first definition here"))
    ///     .add_label(Label::new(25..30, "also used here"));
    ///
    /// assert_eq!(diagnostic.labels.iter().count(), 3);
    /// ```
    ///
    /// Adding highlighted labels for emphasis:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Label, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "type_mismatch", name: "Type Mismatch"
    /// # };
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Error);
    /// let primary = Label::new(20..25, "expected integer");
    /// let mut diagnostic = header.primary(primary);
    ///
    /// let highlighted_label = Label::new(15..18, "this is a string").with_highlight(true);
    /// diagnostic.add_label(highlighted_label);
    ///
    /// assert_eq!(diagnostic.labels.iter().count(), 2);
    /// ```
    pub fn add_label(&mut self, label: impl Into<Label<S>>) -> &mut Self {
        self.labels.push(label.into());
        self
    }

    /// Adds an explanatory message to the diagnostic.
    ///
    /// Messages provide additional context, explanations, or suggestions to help users
    /// understand and resolve the diagnostic issue. They can be notes (providing background
    /// information) or help messages (offering specific guidance or suggestions).
    ///
    /// # Examples
    ///
    /// Adding explanatory notes and help messages:
    ///
    /// ```
    /// use hashql_diagnostics::{Diagnostic, Label, Message, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "unused_var", name: "Unused Variable"
    /// # };
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Warning);
    /// let primary = Label::new(10..15, "unused variable");
    /// let mut diagnostic = header.primary(primary);
    ///
    /// diagnostic
    ///     .add_message(Message::note("Variables should be used after declaration"))
    ///     .add_message(Message::help(
    ///         "Consider removing this variable or using it in your code",
    ///     ));
    ///
    /// assert_eq!(diagnostic.messages.iter().count(), 2);
    /// ```
    ///
    /// Adding styled messages for visual emphasis:
    ///
    /// ```
    /// use anstyle::Color;
    /// use hashql_diagnostics::{Diagnostic, Label, Message, Severity};
    /// # use hashql_diagnostics::category::TerminalDiagnosticCategory;
    /// # const CATEGORY: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    /// #     id: "deprecation", name: "Deprecation Warning"
    /// # };
    ///
    /// let header = Diagnostic::new(CATEGORY, Severity::Warning);
    /// let primary = Label::new(5..12, "deprecated function");
    /// let mut diagnostic = header.primary(primary);
    ///
    /// let styled_message = Message::help("Use the new `calculate_v2` function instead")
    ///     .with_color(Color::Ansi256(208)); // Orange color
    /// diagnostic.add_message(styled_message);
    ///
    /// assert_eq!(diagnostic.messages.iter().count(), 1);
    /// ```
    pub fn add_message(&mut self, message: impl Into<Message<S>>) -> &mut Self {
        self.messages.push(message.into());
        self
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
