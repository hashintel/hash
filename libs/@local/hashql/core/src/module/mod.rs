//! Module system for HashQL language.
//!
//! This module provides the core functionality for defining and resolving modules,
//! managing imports, and maintaining the global registry of available items.
// TODO: This might move into the HIR instead, if required
pub mod import;
pub mod item;
pub mod namespace;
mod std_lib;

use std::sync::Mutex;

use hashbrown::HashMap;

use self::{
    item::{Item, ItemKind},
    std_lib::StandardLibrary,
};
use crate::{
    heap::Heap,
    id::HasId,
    intern::{Decompose, InternMap, InternSet, Interned, Provisioned},
    newtype,
    symbol::InternedSymbol,
    r#type::environment::Environment,
};

newtype!(pub struct ModuleId(u32 is 0..=0xFFFF_FF00));

/// The central registry for all modules and items in a HashQL program.
///
/// The `ModuleRegistry` serves as the global namespace for module resolution.
/// It tracks all available modules and their exported items.
#[derive(Debug)]
pub struct ModuleRegistry<'heap> {
    /// A reference to the global heap used for memory allocation.
    pub heap: &'heap Heap,

    modules: InternMap<'heap, Module<'heap>>,
    items: InternSet<'heap, [Item<'heap>]>,

    root: Mutex<HashMap<InternedSymbol<'heap>, &'heap Item<'heap>, foldhash::fast::RandomState>>,
}

impl<'heap> ModuleRegistry<'heap> {
    /// Creates an empty module registry using the given heap.
    pub fn empty(heap: &'heap Heap) -> Self {
        Self {
            heap,
            modules: InternMap::new(heap),
            items: InternSet::new(heap),
            root: Mutex::new(HashMap::default()),
        }
    }

    /// Creates a new module registry with the standard library pre-loaded.
    ///
    /// This initializes the registry with all the standard modules and items
    /// defined in the standard library.
    pub fn new(env: &Environment<'heap>) -> Self {
        let this = Self::empty(env.heap);

        let std = StandardLibrary::new(env, &this);
        std.register();

        this
    }

    /// Interns a new module into the registry.
    ///
    /// # Panics
    ///
    /// In debug builds, this function will panic if any item in the module has a parent
    /// that doesn't match the module ID.
    pub fn intern_module(
        &self,
        closure: impl FnOnce(Provisioned<ModuleId>) -> PartialModule<'heap>,
    ) -> ModuleId {
        self.modules
            .intern(|id| {
                let module = closure(id);

                if cfg!(debug_assertions) {
                    for item in module.items {
                        assert_eq!(item.parent, Some(id.value()));
                    }
                }

                module
            })
            .id
    }

    /// Interns a slice of items into the registry.
    pub fn intern_items(&self, items: &[Item<'heap>]) -> Interned<'heap, [Item<'heap>]> {
        self.items.intern_slice(items)
    }

    /// Register a new module in the root namespace.
    ///
    /// # Panics
    ///
    /// This function will panic if the internal Mutex is poisoned.
    pub fn register(&self, name: InternedSymbol<'heap>, module: ModuleId) {
        let mut root = self.root.lock().expect("lock should not be poisoned");

        root.insert(
            name,
            self.heap.alloc(Item {
                parent: None,
                name,
                kind: ItemKind::Module(module),
            }),
        );

        drop(root);
    }

    /// Find an item by name in the root namespace.
    ///
    /// # Panics
    ///
    /// This function will panic if the internal Mutex is poisoned.
    pub fn find_by_name(&self, name: InternedSymbol<'heap>) -> Option<&'heap Item<'heap>> {
        let root = self.root.lock().expect("lock should not be poisoned");

        root.get(&name).copied()
    }

    /// Searches for items in the registry using a path-like query.
    ///
    /// This function takes an iterable of symbols representing a path in the module hierarchy
    /// and returns all matching items. The search starts from the root namespace and traverses
    /// the module structure according to the provided query path.
    ///
    /// # Returns
    ///
    /// A vector of matching items, or an empty vector if no matches are found.
    pub fn search(
        &self,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
    ) -> Vec<Item<'heap>> {
        let mut query = query.into_iter();
        let Some(root) = query.next() else {
            return Vec::new();
        };

        let Some(item) = self.find_by_name(root) else {
            return Vec::new();
        };

        item.search(self, query)
    }
}

/// A module in the HashQL language.
///
/// A module represents a namespace containing items such as types, values,
/// and other modules. It forms part of the hierarchical structure of a
/// HashQL program.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Module<'heap> {
    pub id: ModuleId,

    pub items: Interned<'heap, [Item<'heap>]>,
}

impl<'heap> Module<'heap> {
    /// Finds an item within this module by name.
    #[must_use]
    pub fn find(&self, name: InternedSymbol<'heap>) -> impl IntoIterator<Item = Item<'heap>> {
        self.items
            .iter()
            .filter(move |item| (item.name == name))
            .copied()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PartialModule<'heap> {
    items: Interned<'heap, [Item<'heap>]>,
}

impl<'heap> Decompose<'heap> for Module<'heap> {
    type Partial = PartialModule<'heap>;

    fn from_parts(id: Self::Id, partial: Interned<'heap, Self::Partial>) -> Self {
        Self {
            id,
            items: partial.items,
        }
    }
}

impl HasId for Module<'_> {
    type Id = ModuleId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

#[cfg(test)]
mod tests {
    use super::ModuleRegistry;
    use crate::{
        heap::Heap,
        module::item::{IntrinsicItem, ItemKind, Universe},
        span::SpanId,
        r#type::environment::Environment,
    };

    #[test]
    fn search_across_universes() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&env);

        let results = registry.search([
            heap.intern_symbol("kernel"),
            heap.intern_symbol("type"),
            heap.intern_symbol("Dict"),
        ]);

        assert_eq!(results.len(), 2);
        assert_eq!(
            results[0].kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Dict",
                universe: Universe::Type
            })
        );
        assert_eq!(
            results[1].kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Dict",
                universe: Universe::Value
            })
        );
    }
}
