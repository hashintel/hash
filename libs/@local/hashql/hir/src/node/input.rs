use hashql_core::{span::SpanId, symbol::Ident, r#type::TypeId};

use super::Node;

/// An input parameter declaration in the HashQL HIR.
///
/// Represents a named input parameter with associated type and optional default value.
/// Input parameters define external values that can be provided to a query,
/// similar to function parameters but specifically for query entry points.
///
/// When a default value is provided, it will be used if no explicit value is supplied
/// for this parameter when executing the query. The default value must be compatible
/// with the specified type and is evaluated at query execution time, not during
/// compilation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Input<'heap> {
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub r#type: TypeId,
    pub default: Option<Node<'heap>>,
}
