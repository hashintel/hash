use hashql_core::literal::LiteralKind;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Constant<'heap>(LiteralKind<'heap>);
