use alloc::borrow::Cow;
use core::{
    error::Error,
    fmt::{Debug, Display},
};

use ariadne::ColorGenerator;
use error_stack::{Report, TryReportIteratorExt as _};

use crate::{
    category::{
        CanonicalDiagnosticCategoryId, CanonicalDiagnosticCategoryName, DiagnosticCategory,
        category_display_name,
    },
    config::ReportConfig,
    error::ResolveError,
    help::Help,
    label::Label,
    note::Note,
    severity::{Advisory, Critical, Severity, SeverityKind},
    span::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};

pub type AbsoluteDiagnostic<C, F = Severity> = Diagnostic<C, AbsoluteDiagnosticSpan, F>;
pub type BoxedDiagnostic<'category, S, F = Severity> =
    Diagnostic<Box<dyn DiagnosticCategory + 'category>, S, F>;
pub type CriticalDiagnostic<C, S> = Diagnostic<C, S, Critical>;
pub type AdvisoryDiagnostic<C, S> = Diagnostic<C, S, Advisory>;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[must_use = "A diagnostic must be reported"]
// C = Category, S = Span, K = (Severity) Kind
pub struct Diagnostic<C, S, K = Severity> {
    pub category: C,
    pub severity: K,

    pub message: Option<Cow<'static, str>>,

    pub labels: Vec<Label<S>>,
    pub notes: Vec<Note>,
    pub help: Vec<Help>,
}

impl<C, S> Diagnostic<C, S> {
    /// Creates a new diagnostic with the specified category and severity.
    ///
    /// Initializes an empty diagnostic that can be populated with message, labels, notes,
    /// and help messages through the appropriate methods. The category and severity
    /// determine how the diagnostic will be classified and displayed.
    pub const fn new(category: C, severity: Severity) -> Self {
        Self {
            category,
            severity,
            message: None,
            labels: Vec::new(),
            notes: Vec::new(),
            help: Vec::new(),
        }
    }

    pub(crate) fn into_critical_unchecked(self) -> Diagnostic<C, S, Critical> {
        debug_assert!(self.severity.is_critical());

        Diagnostic {
            category: self.category,
            severity: Critical::new_unchecked(self.severity),
            message: self.message,
            labels: self.labels,
            notes: self.notes,
            help: self.help,
        }
    }

    pub(crate) fn into_advisory_unchecked(self) -> Diagnostic<C, S, Advisory> {
        debug_assert!(self.severity.is_advisory());

        Diagnostic {
            category: self.category,
            severity: Advisory::new_unchecked(self.severity),
            message: self.message,
            labels: self.labels,
            notes: self.notes,
            help: self.help,
        }
    }

    pub fn specialize(self) -> Result<Diagnostic<C, S, Advisory>, Diagnostic<C, S, Critical>> {
        let Some(severity) = Advisory::try_new(self.severity) else {
            return Err(Diagnostic {
                category: self.category,
                // critical and advisory are mutually exclusive
                severity: Critical::new_unchecked(self.severity),
                message: self.message,
                labels: self.labels,
                notes: self.notes,
                help: self.help,
            });
        };

        Ok(Diagnostic {
            category: self.category,
            severity,
            message: self.message,
            labels: self.labels,
            notes: self.notes,
            help: self.help,
        })
    }
}

impl<C, S, K> Diagnostic<C, S, K>
where
    K: Copy + Into<Severity>,
{
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

    /// Converts the diagnostic to use a boxed trait object for its category.
    ///
    /// Creates a new [`Diagnostic`] where the category is type-erased into a
    /// `Box<dyn DiagnosticCategory>`.
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
    /// the issue.
    pub fn add_note(&mut self, note: Note) -> &mut Self {
        self.notes.push(note);
        self
    }

    /// Adds a help message to the diagnostic.
    ///
    /// Appends the provided [`Help`] message to the diagnostic's collection of help messages.
    /// Help messages suggest ways to fix or work around the issue described by the diagnostic.
    pub fn add_help(&mut self, help: Help) -> &mut Self {
        self.help.push(help);
        self
    }

    /// Resolve the diagnostic, into a proper diagnostic with span nodes.
    ///
    /// # Errors
    ///
    /// This function will return an error if the span id is not found in the span storage.
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
    pub fn report(&self, config: ReportConfig) -> ariadne::Report<'_, AbsoluteDiagnosticSpan> {
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
