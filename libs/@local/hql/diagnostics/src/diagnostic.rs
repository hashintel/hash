use core::{
    error::Error,
    fmt::{Debug, Display},
};

use ariadne::ColorGenerator;
use error_stack::{Report, Result};
use hql_span::{storage::SpanStorage, tree::SpanNode, Span, SpanId};

use crate::{
    category::Category,
    config::ReportConfig,
    error::ResolveError,
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
    span::{absolute_span, AbsoluteDiagnosticSpan, TransformSpan},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Diagnostic<S> {
    pub category: Category,
    pub severity: Severity,

    pub message: Option<Box<str>>,
    pub span: Option<S>,

    pub labels: Vec<Label<S>>,
    pub note: Option<Note>,
    pub help: Option<Help>,
}

impl<S> Diagnostic<S> {
    #[must_use]
    pub const fn new(category: Category, severity: Severity) -> Self {
        Self {
            category,
            severity,
            message: None,
            span: None,
            labels: Vec::new(),
            note: None,
            help: None,
        }
    }
}

impl Diagnostic<SpanId> {
    /// Resolve the diagnostic, into a proper diagnostic with span nodes.
    ///
    /// # Errors
    ///
    /// This function will return an error if the span id is not found in the span storage.
    pub fn resolve<S>(
        self,
        storage: &SpanStorage<S>,
    ) -> Result<Diagnostic<SpanNode<S>>, ResolveError>
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

        let (span, labels) = self
            .labels
            .into_iter()
            .map(|label| label.resolve(storage))
            .fold(span.map(|node| (node, Vec::new())), |acc, label| {
                match (acc, label) {
                    (Ok((span, mut labels)), Ok(label)) => {
                        labels.push(label);
                        Ok((span, labels))
                    }
                    (Err(mut acc), Err(error)) => {
                        acc.extend_one(error);
                        Err(acc)
                    }
                    (Err(acc), _) => Err(acc),
                    (_, Err(error)) => Err(error),
                }
            })?;

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

impl<S> Diagnostic<SpanNode<S>> {
    pub fn report(
        &self,
        mut config: ReportConfig<impl TransformSpan<S>>,
    ) -> ariadne::Report<AbsoluteDiagnosticSpan> {
        let start = self.span.as_ref().map_or(0, |span| {
            u32::from(absolute_span(span, &mut config.transform_span).start())
        });

        let mut generator = ColorGenerator::new();

        let mut builder = ariadne::Report::build(self.severity.kind(), (), start as usize)
            .with_code(self.category.canonical_id());

        builder.set_message(self.message.as_deref().unwrap_or(self.category.name));

        if let Some(note) = &self.note {
            builder.set_note(note.colored(config.color));
        }

        if let Some(help) = &self.help {
            builder.set_help(help.colored(config.color));
        }

        for label in &self.labels {
            builder.add_label(label.ariadne(&mut generator, &mut config.transform_span));
        }

        builder = builder.with_config(config.into());

        builder.finish()
    }
}

impl<S> Display for Diagnostic<S>
where
    S: Display,
{
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "[{}] {}", self.severity, self.category.canonical_name())
    }
}

impl<S> Error for Diagnostic<S> where S: Debug + Display {}
