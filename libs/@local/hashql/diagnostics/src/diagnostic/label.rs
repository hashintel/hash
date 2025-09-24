use alloc::borrow::Cow;
use core::borrow::Borrow;

#[cfg(feature = "render")]
use annotate_snippets::{Annotation, AnnotationKind};
use error_stack::{Report, TryReportIteratorExt as _};

use crate::{
    error::ResolveError,
    source::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};

// #[derive(Debug, Clone, PartialEq, Eq, Hash)]
// #[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
// pub struct Patch(Cow<'static, str>);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Label<S> {
    span: S,
    message: Cow<'static, str>,

    pub highlight: bool,
}

impl<S> Label<S> {
    pub const fn new<M>(span: S, message: M) -> Self
    where
        M: [const] Into<Cow<'static, str>>,
    {
        Self {
            span,
            message: message.into(),
            highlight: false,
        }
    }

    pub const fn span(&self) -> &S {
        &self.span
    }

    pub fn map_span<S2>(self, func: impl FnOnce(S) -> S2) -> Label<S2> {
        Label {
            span: func(self.span),
            message: self.message,

            highlight: self.highlight,
        }
    }

    pub const fn message(&self) -> &str
    where
        String: [const] Borrow<str>,
    {
        &self.message
    }

    #[must_use]
    pub const fn with_highlight(mut self, highlight: bool) -> Self {
        self.highlight = highlight;
        self
    }

    pub(crate) fn resolve<C>(
        self,
        context: &mut C,
    ) -> Result<Label<AbsoluteDiagnosticSpan>, Report<ResolveError>>
    where
        S: DiagnosticSpan<C>,
    {
        let span = AbsoluteDiagnosticSpan::new(&self.span, context)?;

        Ok(Label {
            span,
            message: self.message,

            highlight: self.highlight,
        })
    }
}

impl Label<AbsoluteDiagnosticSpan> {
    #[cfg(feature = "render")]
    pub(crate) fn render(&self, kind: AnnotationKind) -> Annotation<'_> {
        kind.span(self.span.range().into())
            .label(&*self.message)
            .highlight_source(self.highlight)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Labels<S> {
    labels: Vec<Label<S>>,
}

impl<S> Labels<S> {
    pub fn new(primary: Label<S>) -> Self {
        Self {
            labels: vec![primary],
        }
    }

    pub fn push(&mut self, label: impl Into<Label<S>>) {
        self.labels.push(label.into());
    }

    pub fn iter(&self) -> impl Iterator<Item = &Label<S>> {
        self.labels.iter()
    }

    pub(crate) fn as_slice(&self) -> &[Label<S>] {
        &self.labels
    }

    pub(crate) fn resolve<C>(
        self,
        context: &mut C,
    ) -> Result<Labels<AbsoluteDiagnosticSpan>, Report<[ResolveError]>>
    where
        S: DiagnosticSpan<C>,
    {
        let labels = self
            .labels
            .into_iter()
            .map(|label| label.resolve(context))
            .try_collect_reports()?;

        Ok(Labels { labels })
    }

    pub(crate) fn map<T>(self, func: impl FnMut(Label<S>) -> Label<T>) -> Labels<T> {
        Labels {
            labels: self.labels.into_iter().map(func).collect(),
        }
    }
}
