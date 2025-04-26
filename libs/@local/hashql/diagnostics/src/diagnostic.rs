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
    severity::Severity,
    span::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};

pub type AbsoluteDiagnostic<C> = Diagnostic<C, AbsoluteDiagnosticSpan>;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[must_use = "A diagnostic must be reported"]
pub struct Diagnostic<C, S> {
    pub category: C,
    pub severity: Box<Severity>,

    pub message: Option<Cow<'static, str>>,

    pub labels: Vec<Label<S>>,
    pub note: Option<Note>,
    pub help: Option<Help>,
}

impl<C, S> Diagnostic<C, S> {
    pub fn new(category: impl Into<C>, severity: impl Into<Box<Severity>>) -> Self {
        Self {
            category: category.into(),
            severity: severity.into(),
            message: None,
            labels: Vec::new(),
            note: None,
            help: None,
        }
    }

    pub fn map_category<T>(self, func: impl FnOnce(C) -> T) -> Diagnostic<T, S> {
        Diagnostic {
            category: func(self.category),
            severity: self.severity,
            message: self.message,
            labels: self.labels,
            note: self.note,
            help: self.help,
        }
    }

    pub fn boxed<'a>(self) -> Diagnostic<Box<dyn DiagnosticCategory + 'a>, S>
    where
        C: DiagnosticCategory + 'a,
    {
        self.map_category(|category| Box::new(category) as Box<dyn DiagnosticCategory>)
    }
}

impl<C, S> Diagnostic<C, S> {
    /// Resolve the diagnostic, into a proper diagnostic with span nodes.
    ///
    /// # Errors
    ///
    /// This function will return an error if the span id is not found in the span storage.
    pub fn resolve<DiagnosticContext>(
        self,
        context: &mut DiagnosticContext,
    ) -> Result<Diagnostic<C, AbsoluteDiagnosticSpan>, Report<[ResolveError]>>
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
            note: self.note,
            help: self.help,
        })
    }
}

impl<C> Diagnostic<C, AbsoluteDiagnosticSpan>
where
    C: DiagnosticCategory,
{
    pub fn report(&self, config: ReportConfig) -> ariadne::Report<AbsoluteDiagnosticSpan> {
        // According to the examples, the span given to `Report::build` should be the span of the
        // primary (first) label.
        // See: https://github.com/zesterer/ariadne/blob/74c2a7f8881e95629f9fb8d70140c133972d81d3/examples/simple.rs#L14
        let span = self
            .labels
            .first()
            .map_or_else(AbsoluteDiagnosticSpan::full, |label| *label.span());

        let mut generator = ColorGenerator::new();

        let mut builder = ariadne::Report::build(self.severity.as_ref().kind(), span)
            .with_code(CanonicalDiagnosticCategoryId::new(&self.category));

        builder.set_message(
            self.message
                .clone()
                .unwrap_or_else(|| category_display_name(&self.category)),
        );

        if let Some(note) = &self.note {
            builder.set_note(note.colored(config.color));
        }

        if let Some(help) = &self.help {
            builder.set_help(help.colored(config.color));
        }

        for label in &self.labels {
            builder.add_label(label.ariadne(config.color, &mut generator));
        }

        builder = builder.with_config(config.into());

        builder.finish()
    }
}

impl<C, S> Display for Diagnostic<C, S>
where
    C: DiagnosticCategory,
    S: Display,
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

impl<C, S> Error for Diagnostic<C, S>
where
    C: Debug + DiagnosticCategory,
    S: Debug + Display,
{
}
