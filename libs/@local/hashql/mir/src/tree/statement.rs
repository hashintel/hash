use hashql_core::span::SpanId;

pub struct Statement<'heap> {
    pub span: SpanId,
}
