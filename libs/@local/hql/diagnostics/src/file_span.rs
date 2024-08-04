use hql_span::{tree::SpanNode, Span, TextRange};

pub struct FileSpan {
    range: TextRange,
}

impl ariadne::Span for FileSpan {
    type SourceId = ();

    fn source(&self) -> &Self::SourceId {
        &()
    }

    fn start(&self) -> usize {
        usize::from(self.range.start())
    }

    fn end(&self) -> usize {
        usize::from(self.range.end())
    }
}

impl<S> From<&SpanNode<S>> for FileSpan
where
    S: Span,
{
    fn from(span: &SpanNode<S>) -> Self {
        let range = span.absolute();

        Self { range }
    }
}
