use ariadne::Color;
use hql_span::data::SpanTree;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Label<E> {
    span: SpanTree<E>,
    message: Box<str>,

    order: Option<i32>,
    priority: Option<i32>,
    color: Option<Color>,
}

impl<E> Label<E> {
    pub fn new(span: SpanTree<E>, message: impl Into<Box<str>>) -> Self {
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
