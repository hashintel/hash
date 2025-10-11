pub mod assign;

use hashql_core::span::SpanId;

pub use self::assign::Assign;
use super::local::Local;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Statement<'heap> {
    pub span: SpanId,

    pub kind: StatementKind<'heap>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum StatementKind<'heap> {
    Assign(Assign<'heap>),
    Nop,
    StorageLive(Local),
    StorageDead(Local),
}
