use hashql_core::{heap::Heap, id::Id as _, module::ModuleRegistry, symbol::SymbolTable};

use crate::{intern::Interner, node::r#let::VarId};

pub type BinderSymbolTable<'heap> = SymbolTable<'heap, VarId>;

#[derive(Debug)]
pub struct SymbolRegistry<'heap> {
    pub binder: BinderSymbolTable<'heap>,
}

impl SymbolRegistry<'_> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            binder: BinderSymbolTable::dense(),
        }
    }
}

impl Default for SymbolRegistry<'_> {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub struct Counter {
    pub var: VarId,
}

impl Counter {
    const fn new() -> Self {
        Self { var: VarId::MIN }
    }
}

impl Default for Counter {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub struct HirContext<'env, 'heap> {
    pub heap: &'heap Heap,
    pub symbols: SymbolRegistry<'heap>,
    pub interner: &'env Interner<'heap>,
    pub modules: &'env ModuleRegistry<'heap>,
    pub counter: Counter,
}

impl<'env, 'heap> HirContext<'env, 'heap> {
    pub const fn new(
        interner: &'env Interner<'heap>,
        modules: &'env ModuleRegistry<'heap>,
    ) -> Self {
        Self {
            heap: modules.heap,
            symbols: SymbolRegistry::new(),
            interner,
            modules,
            counter: Counter::new(),
        }
    }
}
