use hashql_core::{literal::LiteralKind, span::SpanId};

/// A literal value in the HashQL HIR.
///
/// Represents a constant value directly expressed in the source code.
/// Literals are the most basic form of expressions and produce a value
/// without any computation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Literal<'heap> {
    pub span: SpanId,

    pub kind: LiteralKind<'heap>,
}
