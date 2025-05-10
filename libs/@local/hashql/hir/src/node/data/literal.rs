use hashql_core::{literal::LiteralKind, span::SpanId};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Literal<'heap> {
    pub span: SpanId,

    pub kind: LiteralKind<'heap>,
}
