use alloc::borrow::Cow;

use anstyle::Color;
use ariadne::ColorGenerator;
use error_stack::Report;

use crate::{
    error::ResolveError,
    span::{AbsoluteDiagnosticSpan, DiagnosticSpan},
};

// See: https://docs.rs/serde_with/3.9.0/serde_with/guide/serde_as/index.html#gating-serde_as-on-features
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Label<S> {
    span: S,
    message: Cow<'static, str>,

    order: Option<i32>,
    priority: Option<i32>,
    #[cfg_attr(feature = "serde", serde(with = "crate::encoding::color_option"))]
    color: Option<Color>,
}

impl<S> Label<S> {
    pub fn new(span: S, message: impl Into<Cow<'static, str>>) -> Self {
        Self {
            span,
            message: message.into(),
            order: None,
            priority: None,
            color: None,
        }
    }

    pub const fn span(&self) -> &S {
        &self.span
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    #[must_use]
    pub const fn with_order(mut self, order: i32) -> Self {
        self.order = Some(order);
        self
    }

    pub const fn set_order(&mut self, order: i32) -> &mut Self {
        self.order = Some(order);
        self
    }

    #[must_use]
    pub const fn with_priority(mut self, priority: i32) -> Self {
        self.priority = Some(priority);
        self
    }

    pub const fn set_priority(&mut self, priority: i32) -> &mut Self {
        self.priority = Some(priority);
        self
    }

    #[must_use]
    pub const fn with_color(mut self, color: Color) -> Self {
        self.color = Some(color);
        self
    }

    pub const fn set_color(&mut self, color: Color) -> &mut Self {
        self.color = Some(color);
        self
    }
}

impl<S> Label<S> {
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
            order: self.order,
            priority: self.priority,
            color: self.color,
        })
    }
}

impl Label<AbsoluteDiagnosticSpan> {
    pub(crate) fn ariadne(
        &self,
        enable_color: bool,
        generator: &mut ColorGenerator,
    ) -> ariadne::Label<AbsoluteDiagnosticSpan> {
        let mut label = ariadne::Label::new(self.span).with_message(&self.message);

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
