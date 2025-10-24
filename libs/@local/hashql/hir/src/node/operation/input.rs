use hashql_core::{span::Spanned, symbol::Ident};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum InputOp {
    Exists,
    Load { required: bool },
}

/// Represents an external input parameter for a query or function.
///
/// Input parameters define values that can be provided externally
/// to parameterize queries, with optional type constraints and default values.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct InputOperation<'heap> {
    pub op: Spanned<InputOp>,
    pub name: Ident<'heap>,
}
