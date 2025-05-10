use hashql_core::{intern::Interned, span::SpanId, symbol::Ident};

use super::Node;
use crate::path::QualifiedPath;

/// A reference to a locally defined variable in the HashQL HIR.
///
/// Represents an identifier that refers to a variable defined within the current
/// lexical scope, such as a let-binding, function parameter, or closure parameter.
///
/// The `arguments` field contains type arguments when this variable refers to a
/// generic entity. For non-generic variables, this array will be empty. These arguments
/// allow for specialization of generic types and functions at use sites.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct LocalVariable<'heap> {
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub arguments: Interned<'heap, [Node<'heap>]>,
}

/// A reference to a variable accessed through a qualified path in the HashQL HIR.
///
/// Represents an identifier accessed through a module path, allowing for
/// references to items defined in other modules or in the standard library.
///
/// The `arguments` field contains type arguments when this qualified path refers to
/// a generic entity. For non-generic variables, this array will be empty. These arguments
/// allow for specialization of generic modules and types from external paths.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct QualifiedVariable<'heap> {
    pub span: SpanId,

    pub path: QualifiedPath<'heap>,
    pub arguments: Interned<'heap, [Node<'heap>]>,
}

/// The different kinds of variable references in the HashQL HIR.
///
/// A variable reference can either be local (defined within the current lexical scope)
/// or qualified (accessed through a module path).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum VariableKind<'heap> {
    Local(LocalVariable<'heap>),
    Qualified(QualifiedVariable<'heap>),
}

/// A variable reference node in the HashQL HIR.
///
/// Represents any reference to a named value, which could be a local binding,
/// module import, function parameter, or other named entity. Variables form the
/// basic building blocks for expressions, allowing previously computed values
/// to be referenced by name.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Variable<'heap> {
    pub span: SpanId,

    pub kind: VariableKind<'heap>,
}
