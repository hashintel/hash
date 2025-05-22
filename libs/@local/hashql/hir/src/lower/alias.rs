use hashql_core::{module::universe::FastRealmsMap, symbol::Symbol};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AliasReplacement<'heap> {
    scope: FastRealmsMap<Symbol<'heap>, Symbol<'heap>>,
}
