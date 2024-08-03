use crate::Span;

/// Represents additional metadata associated with a `Span`.
///
/// `SpanData` can store information about the text range, an optional parent span,
/// and other optional extra data.
///
/// This data is at least 20 bytes in size.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SpanData<E> {
    pub span: Span,
    pub parent: Option<Span>,
    pub extra: Option<E>,
}

impl<E> SpanData<E> {
    #[must_use]
    pub const fn new(span: Span) -> Self {
        Self {
            span,
            parent: None,
            extra: None,
        }
    }

    #[must_use]
    pub const fn with_parent(mut self, parent: Span) -> Self {
        self.parent = Some(parent);
        self
    }

    pub fn set_parent(&mut self, parent: Span) -> &mut Self {
        self.parent = Some(parent);
        self
    }

    #[must_use]
    pub fn with_extra(mut self, extra: E) -> Self {
        self.extra = Some(extra);
        self
    }

    pub fn set_extra(&mut self, extra: E) -> &mut Self {
        self.extra = Some(extra);
        self
    }
}
