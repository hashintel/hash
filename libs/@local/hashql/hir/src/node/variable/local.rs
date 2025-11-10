use core::fmt::Display;

use hashql_core::{intern::Interned, span::Spanned, r#type::TypeId};

use crate::{
    context::SymbolRegistry,
    node::r#let::{Binder, VarId},
};

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
    pub id: Spanned<VarId>,
    pub arguments: Interned<'heap, [Spanned<TypeId>]>,
}

impl<'heap> LocalVariable<'heap> {
    #[must_use]
    pub fn to_binder(self, symbols: &SymbolRegistry<'heap>) -> Binder<'heap> {
        let name = symbols.binder.get(self.id.value);

        Binder {
            id: self.id.value,
            span: self.id.span,
            name,
        }
    }

    #[must_use]
    pub fn name(&self, symbols: &SymbolRegistry<'heap>) -> impl Display + use<'heap> {
        self.to_binder(symbols).mangled()
    }
}
