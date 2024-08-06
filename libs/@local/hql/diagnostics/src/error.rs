use hql_span::SpanId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ResolveError {
    #[error("unknown span {id:?}")]
    UnknownSpan { id: SpanId },
}
