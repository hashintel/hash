use core::{
    error::Error,
    fmt::{Debug, Display},
};

use ariadne::ColorGenerator;
use error_stack::{Report, Result, TryReportIteratorExt, TryReportTupleExt};
use hql_span::{storage::SpanStorage, tree::SpanNode, Span, SpanId};

use crate::{
    category::Category,
    config::ReportConfig,
    error::ResolveError,
    help::Help,
    label::Label,
    note::Note,
    rob::RefOrBox,
    severity::Severity,
    span::{absolute_span, AbsoluteDiagnosticSpan, TransformSpan},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Diagnostic<'a, S> {
    pub category: RefOrBox<'a, Category<'a>>,
    pub severity: RefOrBox<'a, Severity<'a>>,

    pub message: Option<Box<str>>,
    pub span: Option<S>,

    pub labels: Vec<Label<S>>,
    pub note: Option<Note>,
    pub help: Option<Help>,
}

impl<'a, S> Diagnostic<'a, S> {
    #[must_use]
    pub fn new(
        category: impl Into<RefOrBox<'a, Category<'a>>>,
        severity: impl Into<RefOrBox<'a, Severity<'a>>>,
    ) -> Self {
        Self {
            category: category.into(),
            severity: severity.into(),
            message: None,
            span: None,
            labels: Vec::new(),
            note: None,
            help: None,
        }
    }
}

impl<'a> Diagnostic<'a, SpanId> {
    /// Resolve the diagnostic, into a proper diagnostic with span nodes.
    ///
    /// # Errors
    ///
    /// This function will return an error if the span id is not found in the span storage.
    pub fn resolve<S>(
        self,
        storage: &SpanStorage<S>,
    ) -> Result<Diagnostic<'a, SpanNode<S>>, [ResolveError]>
    where
        S: Span + Clone,
    {
        let span = self
            .span
            .map(|id| {
                storage
                    .resolve(id)
                    .ok_or_else(|| Report::new(ResolveError::UnknownSpan { id }))
            })
            .transpose();

        let labels: Result<Vec<_>, _> = self
            .labels
            .into_iter()
            .map(|label| label.resolve(storage))
            .try_collect_reports();

        let (span, labels) = (span, labels).try_collect()?;

        Ok(Diagnostic {
            category: self.category,
            severity: self.severity,
            message: self.message,
            span,
            labels,
            note: self.note,
            help: self.help,
        })
    }
}

impl<S> Diagnostic<'_, SpanNode<S>> {
    pub fn report(
        &self,
        mut config: ReportConfig<impl TransformSpan<S>>,
    ) -> ariadne::Report<AbsoluteDiagnosticSpan> {
        let start = self.span.as_ref().map_or(0, |span| {
            u32::from(absolute_span(span, &mut config.transform_span).start())
        });

        let mut generator = ColorGenerator::new();

        let mut builder = ariadne::Report::build(self.severity.as_ref().kind(), (), start as usize)
            .with_code(self.category.as_ref().canonical_id());

        builder.set_message(
            self.message
                .as_deref()
                .unwrap_or(&self.category.as_ref().name),
        );

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

impl<S> Display for Diagnostic<'_, S>
where
    S: Display,
{
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(
            fmt,
            "[{}] {}",
            self.severity,
            self.category.as_ref().canonical_name()
        )
    }
}

impl<S> Error for Diagnostic<'_, S> where S: Debug + Display {}
