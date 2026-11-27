use core::alloc::Allocator;

use hashql_ast::lower::ExtractedTypes;
use hashql_core::{
    collections::{FastHashMap, HashMapExt as _, fast_hash_map_in},
    symbol::{Ident, Symbol},
};

use crate::{
    context::HirContext,
    node::r#let::{Binder, VarId},
};

#[derive(Debug)]
pub(super) struct BinderScope<'heap, A: Allocator> {
    locals: FastHashMap<Symbol<'heap>, VarId, A>,
}

impl<'heap, A: Allocator> BinderScope<'heap, A> {
    pub(super) fn new_in(
        types: &ExtractedTypes<'heap>,
        context: &mut HirContext<'_, 'heap>,
        alloc: A,
    ) -> Self {
        // Pre-populate the scope with local type names so constructor calls can resolve them
        // before `ConvertTypeConstructor` replaces those references.
        let mut locals = fast_hash_map_in(alloc);
        for local in types.locals.iter() {
            let id = context.counter.var.next();
            locals.insert_unique(local.name, id);
            context.symbols.binder.insert(id, local.name);
        }

        Self { locals }
    }

    pub(super) fn bind(
        &mut self,
        name: Ident<'heap>,
        context: &mut HirContext<'_, 'heap>,
    ) -> Binder<'heap> {
        let id = context.counter.var.next();
        // Name mangling guarantees every local binding name is unique within the program.
        self.locals.insert_unique(name.value, id);
        context.symbols.binder.insert(id, name.value);

        Binder {
            id,
            span: name.span,
            name: Some(name.value),
        }
    }

    pub(super) fn unbind(&mut self, name: Symbol<'heap>) {
        self.locals.remove(&name);
    }

    pub(super) fn resolve(&self, name: Symbol<'heap>) -> VarId {
        // Undeclared variables are caught during AST import resolution.
        self.locals[&name]
    }
}
