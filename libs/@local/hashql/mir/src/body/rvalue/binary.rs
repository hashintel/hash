use hashql_hir::node::operation::BinOp;

use crate::body::operand::Operand;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Binary<'heap> {
    pub op: BinOp,

    pub left: Operand<'heap>,
    pub right: Operand<'heap>,
}
