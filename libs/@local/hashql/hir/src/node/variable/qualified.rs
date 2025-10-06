use core::fmt::Display;

use hashql_core::{
    intern::Interned,
    span::{SpanId, Spanned},
    r#type::TypeId,
};

use crate::path::QualifiedPath;

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
