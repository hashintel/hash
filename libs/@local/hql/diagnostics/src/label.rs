use anstyle::Color;
use ariadne::ColorGenerator;
use error_stack::{Report, Result};
use hql_span::{Span, SpanId, storage::SpanStorage, tree::SpanNode};

use crate::{
    error::ResolveError,
    span::{AbsoluteDiagnosticSpan, TransformSpan},
};

// See: https://docs.rs/serde_with/3.9.0/serde_with/guide/serde_as/index.html#gating-serde_as-on-features
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", cfg_eval, serde_with::serde_as)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Label<S> {
    span: S,
    message: Box<str>,

    order: Option<i32>,
    priority: Option<i32>,
    #[cfg_attr(feature = "serde", serde_as(as = "Option<crate::encoding::Color>"))]
    color: Option<Color>,
}

impl<S> Label<S> {
    pub fn new(span: S, message: impl Into<Box<str>>) -> Self {
        Self {
            span,
            message: message.into(),
            order: None,
            priority: None,
            color: None,
        }
    }

    #[must_use]
    pub const fn with_order(mut self, order: i32) -> Self {
        self.order = Some(order);
        self
    }

    pub fn set_order(&mut self, order: i32) -> &mut Self {
        self.order = Some(order);
        self
    }

    #[must_use]
    pub const fn with_priority(mut self, priority: i32) -> Self {
        self.priority = Some(priority);
        self
    }

    pub fn set_priority(&mut self, priority: i32) -> &mut Self {
        self.priority = Some(priority);
        self
    }

    #[must_use]
    pub const fn with_color(mut self, color: Color) -> Self {
        self.color = Some(color);
        self
    }

    pub fn set_color(&mut self, color: Color) -> &mut Self {
        self.color = Some(color);
        self
    }
}

impl Label<SpanId> {
    pub(crate) fn resolve<S>(
        self,
        storage: &SpanStorage<S>,
    ) -> Result<Label<SpanNode<S>>, ResolveError>
    where
        S: Span + Clone,
    {
        let span = storage
            .resolve(self.span)
            .ok_or_else(|| Report::new(ResolveError::UnknownSpan { id: self.span }))?;

        Ok(Label {
            span,
            message: self.message,
            order: self.order,
            priority: self.priority,
            color: self.color,
        })
    }
}

impl<S> Label<SpanNode<S>> {
    pub(crate) fn ariadne(
        &self,
        enable_color: bool,
        generator: &mut ColorGenerator,
        transform: &mut impl TransformSpan<S>,
    ) -> ariadne::Label<AbsoluteDiagnosticSpan> {
        let mut label = ariadne::Label::new(AbsoluteDiagnosticSpan::new(&self.span, transform))
            .with_message(&self.message);

        let color = self
            .color
            .map_or_else(|| generator.next(), anstyle_yansi::to_yansi_color);

        if enable_color {
            label = label.with_color(color);
        }

        if let Some(order) = self.order {
            label = label.with_order(order);
        }

        if let Some(priority) = self.priority {
            label = label.with_priority(priority);
        }

        label
    }
}
