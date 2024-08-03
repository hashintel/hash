use ariadne::Span;
use hql_span::{data::SpanTree, file::FileId};

pub struct FileSpan {
    file: FileId,
    span: hql_span::Span,
}

impl Span for FileSpan {
    type SourceId = FileId;

    fn source(&self) -> &Self::SourceId {
        &self.file
    }

    fn start(&self) -> usize {
        usize::from(self.span.start())
    }

    fn end(&self) -> usize {
        usize::from(self.span.end())
    }
}

impl<E> From<&SpanTree<E>> for FileSpan {
    fn from(span: &SpanTree<E>) -> Self {
        Self {
            file: span.file,
            span: span.span,
        }
    }
}
