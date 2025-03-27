use core::{
    error::Error,
    fmt::{Debug, Display},
};

use ariadne::ColorGenerator;
use error_stack::{Report, TryReportIteratorExt as _};
use hashql_core::span::{Span, SpanId, node::SpanNode, storage::SpanStorage};

use crate::{
    category::{
        CanonicalDiagnosticCategoryId, CanonicalDiagnosticCategoryName, DiagnosticCategory,
    },
    config::ReportConfig,
    error::ResolveError,
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
    span::{AbsoluteDiagnosticSpan, TransformSpan},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Diagnostic<C, S> {
    pub category: C,
    pub severity: Box<Severity>,

    pub message: Option<Box<str>>,

    pub labels: Vec<Label<S>>,
    pub note: Option<Note>,
    pub help: Option<Help>,
}

impl<C, S> Diagnostic<C, S> {
    #[must_use]
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
}

impl<C> Diagnostic<C, SpanId> {
    /// Resolve the diagnostic, into a proper diagnostic with span nodes.
    ///
    /// # Errors
    ///
    /// This function will return an error if the span id is not found in the span storage.
    pub fn resolve<S>(
        self,
        storage: &SpanStorage<S>,
    ) -> Result<Diagnostic<C, SpanNode<S>>, Report<[ResolveError]>>
    where
        S: Span + Clone,
    {
        let labels: Vec<_> = self
            .labels
            .into_iter()
            .map(|label| label.resolve(storage))
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

impl<C, S> Diagnostic<C, SpanNode<S>>
where
    C: DiagnosticCategory,
{
    pub fn report(
        &self,
        mut config: ReportConfig<impl TransformSpan<S>>,
    ) -> ariadne::Report<AbsoluteDiagnosticSpan> {
        // According to the examples, the span given to `Report::build` should be the span of the
        // primary (first) label.
        // See: https://github.com/zesterer/ariadne/blob/74c2a7f8881e95629f9fb8d70140c133972d81d3/examples/simple.rs#L14
        let span = self
            .labels
            .first()
            .map_or_else(AbsoluteDiagnosticSpan::full, |label| {
                label.absolute_span(&mut config.transform_span)
            });

        let mut generator = ColorGenerator::new();

        let mut builder = ariadne::Report::build(self.severity.as_ref().kind(), span)
            .with_code(CanonicalDiagnosticCategoryId::new(&self.category));

        builder.set_message(self.message.as_deref().unwrap_or(&self.category.name()));

        if let Some(note) = &self.note {
            builder.set_note(note.colored(config.color));
        }

        if let Some(help) = &self.help {
            builder.set_help(help.colored(config.color));
        }

        for label in &self.labels {
            builder.add_label(label.ariadne(
                config.color,
                &mut generator,
                &mut config.transform_span,
            ));
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
