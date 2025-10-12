use hashql_core::literal::LiteralKind;

use crate::def::DefId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Constant<'heap> {
    Primitive(LiteralKind<'heap>),
    FnPtr(DefId),
}
