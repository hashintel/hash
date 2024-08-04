use anstyle::Color;
use ariadne::ColorGenerator;
use hql_span::{tree::SpanNode, Span};

use crate::file_span::FileSpan;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", cfg_eval, serde_with::serde_as)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Label<S> {
    span: SpanNode<S>,
    message: Box<str>,

    order: Option<i32>,
    priority: Option<i32>,
    #[cfg_attr(feature = "serde", serde_as(as = "Option<crate::encoding::Color>"))]
    color: Option<Color>,
}

impl<S> Label<S> {
    pub fn new(span: SpanNode<S>, message: impl Into<Box<str>>) -> Self {
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

impl<S> Label<S>
where
    S: Span,
{
    pub(crate) fn ariadne(&self, generator: &mut ColorGenerator) -> ariadne::Label<FileSpan> {
        let mut label = ariadne::Label::new(FileSpan::from(&self.span)).with_message(&self.message);

        let color = self
            .color
            .map_or_else(|| generator.next(), anstyle_yansi::to_yansi_color);
        label = label.with_color(color);

        if let Some(order) = self.order {
            label = label.with_order(order);
        }

        if let Some(priority) = self.priority {
            label = label.with_priority(priority);
        }

        label
    }
}
