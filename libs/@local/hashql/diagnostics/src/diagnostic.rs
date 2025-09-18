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
    severity::{Advisory, Critical, Severity},
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
// C = Category, S = Span, L = (Severity) Level
pub struct Diagnostic<C, S, L = Severity> {
    pub category: C,
    pub severity: L,

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

    pub fn try_into_critical(self) -> Result<Diagnostic<C, S, Critical>, Self> {
        let Some(severity) = Critical::try_new(self.severity) else {
            return Err(self);
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

    pub fn try_into_advisory(self) -> Result<Diagnostic<C, S, Advisory>, Self> {
        let Some(severity) = Advisory::try_new(self.severity) else {
            return Err(self);
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

impl<C, S, L> Diagnostic<C, S, L>
where
    L: Copy + Into<Severity>,
{
    pub fn into_severity(self) -> Diagnostic<C, S, Severity> {
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

impl<C, S, L> Diagnostic<C, S, L> {
    /// Transforms the diagnostic's category using the provided function.
    ///
    /// Takes the current category, applies the transformation function, and produces a new
    /// [`Diagnostic`] with the transformed category while preserving all other fields such as
    /// severity, message, labels, notes, and help messages.
    pub fn map_category<T>(self, func: impl FnOnce(C) -> T) -> Diagnostic<T, S, L> {
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
    pub fn boxed<'category>(self) -> BoxedDiagnostic<'category, S, L>
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
    ) -> Result<Diagnostic<C, AbsoluteDiagnosticSpan, L>, Report<[ResolveError]>>
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

impl<C, L> Diagnostic<C, AbsoluteDiagnosticSpan, L>
where
    C: DiagnosticCategory,
    L: Copy + Into<Severity>,
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

impl<C, S, L> Display for Diagnostic<C, S, L>
where
    C: DiagnosticCategory,
    S: Display,
    L: Display,
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

impl<C, S, L> Error for Diagnostic<C, S, L>
where
    C: Debug + DiagnosticCategory,
    S: Debug + Display,
    L: Debug + Display,
{
}
