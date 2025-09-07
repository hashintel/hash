use core::fmt::{self, Display};

use hashql_core::{
    intern::Interned,
    span::{SpanId, Spanned},
    symbol::Ident,
    r#type::TypeId,
};

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
    pub arguments: Interned<'heap, [Spanned<TypeId>]>,
}

impl LocalVariable<'_> {
    #[must_use]
    pub fn name(&self) -> impl Display {
        self.name.value.demangle()
    }
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
    pub arguments: Interned<'heap, [Spanned<TypeId>]>,
}

impl QualifiedVariable<'_> {
    #[must_use]
    pub fn name(&self) -> impl Display {
        &self.path
    }
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

impl<'heap> Variable<'heap> {
    #[must_use]
    pub fn name(&self) -> impl Display {
        enum DisplayName<L, Q> {
            Local(L),
            Qualified(Q),
        }

        impl<L, Q> Display for DisplayName<L, Q>
        where
            L: Display,
            Q: Display,
        {
            fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                match self {
                    Self::Local(local) => local.fmt(fmt),
                    Self::Qualified(qualified) => qualified.fmt(fmt),
                }
            }
        }

        match &self.kind {
            VariableKind::Local(local) => DisplayName::Local(local.name()),
            VariableKind::Qualified(qualified) => DisplayName::Qualified(qualified.name()),
        }
    }

    #[must_use]
    pub const fn arguments(&self) -> Interned<'heap, [Spanned<TypeId>]> {
        match &self.kind {
            VariableKind::Local(local) => local.arguments,
            VariableKind::Qualified(qualified) => qualified.arguments,
        }
    }
}
