use alloc::borrow::Cow;
use core::borrow::Borrow;

#[cfg(feature = "render")]
use annotate_snippets::{Annotation, AnnotationKind};

#[cfg(feature = "render")]
use super::render::{RenderContext, RenderError};
use crate::source::{AbsoluteDiagnosticSpan, DiagnosticSpan};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub(crate) enum LabelKind {
    Primary,
    Secondary,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Label<S> {
    span: S,
    kind: LabelKind,
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
            kind: LabelKind::Secondary,
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
            kind: self.kind,
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
}

#[cfg(feature = "render")]
impl<S> Label<S> {
    pub(crate) fn render<C>(
        &self,
        context: &mut RenderContext<C>,
    ) -> Result<Annotation<'_>, RenderError<'_, S>>
    where
        S: DiagnosticSpan<C>,
    {
        let span = AbsoluteDiagnosticSpan::new(&self.span, context.span_context)
            .ok_or(RenderError::SpanNotFound(None, &self.span))?;

        let kind = match self.kind {
            LabelKind::Primary => AnnotationKind::Primary,
            LabelKind::Secondary => AnnotationKind::Context,
        };

        Ok(kind
            .span(span.range().into())
            .label(&*self.message)
            .highlight_source(self.highlight))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Labels<S> {
    labels: Vec<Label<S>>,
}

impl<S> Labels<S> {
    pub fn new(mut primary: Label<S>) -> Self {
        primary.kind = LabelKind::Primary;

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

    pub(crate) fn map<T>(self, func: impl FnMut(Label<S>) -> Label<T>) -> Labels<T> {
        Labels {
            labels: self.labels.into_iter().map(func).collect(),
        }
    }
}
