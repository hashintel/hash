use ariadne::Span;
use hql_span::{file::FileId, tree::SpanTree, TextRange};

pub struct FileSpan {
    file: FileId,
    range: TextRange,
}

impl Span for FileSpan {
    type SourceId = FileId;

    fn source(&self) -> &Self::SourceId {
        &self.file
    }

    fn start(&self) -> usize {
        usize::from(self.range.start())
    }

    fn end(&self) -> usize {
        usize::from(self.range.end())
    }
}

impl<E> From<&SpanTree<E>> for FileSpan {
    fn from(span: &SpanTree<E>) -> Self {
        let range = span.absolute();

        Self {
            file: span.file,
            range,
        }
    }
}
