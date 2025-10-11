use hashql_hir::node::operation::UnOp;

use crate::body::operand::Operand;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Unary<'heap> {
    pub op: UnOp,

    pub operand: Operand<'heap>,
}
