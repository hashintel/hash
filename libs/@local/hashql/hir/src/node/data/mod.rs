pub mod literal;

use hashql_core::span::SpanId;

use self::literal::Literal;
use super::NodeId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataKind<'heap> {
    Struct,
    Dict,
    Tuple,
    List,
    Literal(Literal<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Data<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: DataKind<'heap>,
}
