//! Module system for HashQL language.
//!
//! This module provides the core functionality for defining and resolving modules,
//! managing imports, and maintaining the global registry of available items.
// TODO: This might move into the HIR instead, if required
pub mod error;
pub mod import;
pub mod item;
pub mod namespace;
mod resolver;
mod std_lib;

use std::sync::Mutex;

use strsim::jaro_winkler;

use self::{
    error::Suggestion,
    item::{Item, ItemKind},
    std_lib::StandardLibrary,
};
use crate::{
    collection::FastHashMap,
    heap::Heap,
    id::{HasId, Id as _},
    intern::{Decompose, InternMap, InternSet, Interned, Provisioned},
    newtype,
    symbol::InternedSymbol,
    r#type::environment::Environment,
};

newtype!(pub struct ModuleId(u32 is 0..=0xFFFF_FF00));

impl ModuleId {
    pub const ROOT: Self = Self::MAX;
}

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

    root: Mutex<FastHashMap<InternedSymbol<'heap>, ModuleId>>,
}

impl<'heap> ModuleRegistry<'heap> {
    /// Creates an empty module registry using the given heap.
    pub fn empty(heap: &'heap Heap) -> Self {
        Self {
            heap,
            modules: InternMap::new(heap),
            items: InternSet::new(heap),
            root: Mutex::default(),
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
                        assert_eq!(item.module, id.value());

                        // check for modules if the parent is also set *correctly* to our module
                        if let ItemKind::Module(module) = item.kind {
                            let module = self.modules.index(module);

                            assert_eq!(module.parent, id.value());
                            assert_eq!(module.name, item.name);
                        }
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
    pub fn register(&self, module: ModuleId) {
        let module = self.modules.index(module);

        if cfg!(debug_assertions) {
            assert_eq!(module.parent, ModuleId::ROOT);
        }

        let mut root = self.root.lock().expect("lock should not be poisoned");
        root.insert(module.name, module.id);
        drop(root);
    }

    /// Find an item by name in the root namespace.
    ///
    /// # Panics
    ///
    /// This function will panic if the internal Mutex is poisoned.
    fn find_by_name(&self, name: InternedSymbol<'heap>) -> Option<Module<'heap>> {
        let root = self.root.lock().expect("lock should not be poisoned");

        let id = root.get(&name).copied()?;
        drop(root);

        let module = self.modules.index(id);

        Some(module)
    }

    fn suggestions(&self, name: InternedSymbol<'heap>) -> Vec<Suggestion<ModuleId>> {
        let root = self.root.lock().expect("lock should not be poisoned");

        let mut results = Vec::with_capacity(root.len());
        for (&key, &module) in &*root {
            let score = jaro_winkler(key.as_str(), name.as_str());
            results.push(Suggestion {
                item: module,
                score,
            });
        }
        drop(root);

        results
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

        let Some(module) = self.find_by_name(root) else {
            return Vec::new();
        };

        let item = Item {
            module: module.parent,
            name: root,
            kind: ItemKind::Module(module.id),
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
    pub name: InternedSymbol<'heap>,

    pub parent: ModuleId,

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

    fn suggestions(
        &self,
        name: InternedSymbol<'heap>,
        mut select: impl FnMut(&Item<'heap>) -> bool,
    ) -> Vec<Suggestion<Item<'heap>>> {
        let mut similarities = Vec::with_capacity(self.items.len());

        for &item in self.items {
            if !select(&item) {
                continue;
            }

            let score = jaro_winkler(item.name.as_str(), name.as_str());
            similarities.push(Suggestion { item, score });
        }

        similarities
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PartialModule<'heap> {
    name: InternedSymbol<'heap>,
    parent: ModuleId,
    items: Interned<'heap, [Item<'heap>]>,
}

impl<'heap> Decompose<'heap> for Module<'heap> {
    type Partial = PartialModule<'heap>;

    fn from_parts(id: Self::Id, partial: Interned<'heap, Self::Partial>) -> Self {
        Self {
            id,
            name: partial.name,
            parent: partial.parent,
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
