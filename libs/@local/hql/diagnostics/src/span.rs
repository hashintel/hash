use hql_span::{SpanId, TextRange, TextSize, tree::SpanNode};

pub trait TransformSpan<S> {
    fn transform(&mut self, span: &S) -> DiagnosticSpan;
}

impl<F, S> TransformSpan<S> for F
where
    F: FnMut(&S) -> DiagnosticSpan,
{
    fn transform(&mut self, span: &S) -> DiagnosticSpan {
        (self)(span)
    }
}

impl TransformSpan<DiagnosticSpan> for () {
    fn transform(&mut self, span: &DiagnosticSpan) -> DiagnosticSpan {
        *span
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DiagnosticSpan {
    pub range: TextRange,
    pub parent_id: Option<SpanId>,
}

impl hql_span::Span for DiagnosticSpan {
    fn parent_id(&self) -> Option<SpanId> {
        self.parent_id
    }
}

pub(crate) fn absolute_span<S>(
    span: &SpanNode<S>,
    transform: &mut impl TransformSpan<S>,
) -> TextRange {
    let parent_offset = span.parent.as_ref().map_or_else(
        || TextSize::new(0),
        |parent| absolute_span(parent, transform).start(),
    );

    let span = transform.transform(&span.value);
    span.range + parent_offset
}

pub struct AbsoluteDiagnosticSpan {
    range: TextRange,
}

impl AbsoluteDiagnosticSpan {
    pub(crate) fn new<S>(node: &SpanNode<S>, transform: &mut impl TransformSpan<S>) -> Self {
        let range = absolute_span(node, transform);

        Self { range }
    }
}

impl ariadne::Span for AbsoluteDiagnosticSpan {
    type SourceId = ();

    fn source(&self) -> &Self::SourceId {
        &()
    }

    fn start(&self) -> usize {
        self.range.start().into()
    }

    fn end(&self) -> usize {
        self.range.end().into()
    }

    fn len(&self) -> usize {
        self.range.len().into()
    }

    fn is_empty(&self) -> bool {
        self.range.is_empty()
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "Text will never be larger than u32::MAX (4GiB) due to the use of `TextSize`"
    )]
    fn contains(&self, offset: usize) -> bool {
        self.range.contains(TextSize::from(offset as u32))
    }
}
