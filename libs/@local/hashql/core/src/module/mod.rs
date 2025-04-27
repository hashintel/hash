//! Module system for HashQL language.
//!
//! This module provides the core functionality for defining and resolving modules,
//! managing imports, and maintaining the global registry of available items.
//!
//! Key components:
//!
//! - `ModuleRegistry`: The central registry for all modules and items
//! - `Module`: A container for related items
//! - `Namespace`: A collection of imports that define the available names in a scope
//! - `Import`: An individual imported item with its name and metadata
// TODO: This might move into the HIR instead, if required
pub mod import;
pub mod item;
pub mod namespace;
mod std_lib;

use std::sync::Mutex;

use hashbrown::HashMap;

use self::{
    item::{Item, ItemId, ItemKind},
    std_lib::StandardLibrary,
};
use crate::{
    arena::concurrent::ConcurrentArena, heap::Heap, id::HasId, newtype, symbol::InternedSymbol,
    r#type::environment::Environment,
};

newtype!(pub struct ModuleId(u32 is 0..=0xFFFF_FF00));

/// The central registry for all modules and items in a HashQL program.
///
/// The `ModuleRegistry` serves as the global namespace for module resolution.
/// It tracks all available modules and their exported items.
#[derive(Debug)]
pub struct ModuleRegistry<'heap> {
    heap: &'heap Heap,

    // TODO: intern instead, that means we can get rid of at least `ItemId`, and maybe even
    // `ModuleId`
    // see: https://linear.app/hash/issue/H-4409/hashql-intern-types
    modules: ConcurrentArena<Module<'heap>>,
    items: ConcurrentArena<Item<'heap>>,

    tree: Mutex<HashMap<InternedSymbol<'heap>, ItemId, foldhash::fast::RandomState>>,
}

impl<'heap> ModuleRegistry<'heap> {
    /// Creates an empty module registry using the given heap.
    pub fn empty(heap: &'heap Heap) -> Self {
        Self {
            heap,
            modules: ConcurrentArena::new(),
            items: ConcurrentArena::new(),
            tree: Mutex::new(HashMap::default()),
        }
    }

    /// Creates a new module registry with the standard library pre-loaded.
    ///
    /// This initializes the registry with all the standard modules and items
    /// defined in the HashQL standard library.
    pub fn new(env: &Environment<'heap>) -> Self {
        let this = Self::empty(env.heap);

        let std = StandardLibrary::new(env, &this);
        std.register();

        this
    }

    pub fn alloc_module(&self, closure: impl FnOnce(ModuleId) -> Module<'heap>) -> ModuleId {
        self.modules.push_with(closure)
    }

    pub fn alloc_item(&self, closure: impl FnOnce(ItemId) -> Item<'heap>) -> ItemId {
        self.items.push_with(closure)
    }

    pub fn alloc_items(&self, items: &[ItemId]) -> &'heap [ItemId] {
        self.heap.slice(items)
    }

    #[inline]
    fn lock_tree<T>(
        &self,
        closure: impl FnOnce(
            &mut HashMap<InternedSymbol<'heap>, ItemId, foldhash::fast::RandomState>,
        ) -> T,
    ) -> T {
        closure(&mut self.tree.lock().expect("lock should not be poisoned"))
    }

    pub fn register(&self, name: InternedSymbol<'heap>, module: ModuleId) {
        self.lock_tree(|modules| {
            modules.insert(
                name,
                self.items.push_with(|id| Item {
                    id,
                    parent: None,
                    name,
                    kind: ItemKind::Module(module),
                }),
            )
        });
    }

    pub fn find_by_name(&self, name: InternedSymbol<'heap>) -> Option<Item<'heap>> {
        let id = self.lock_tree(|modules| modules.get(&name).copied())?;

        Some(self.items[id].copied())
    }

    pub fn find_by_id(&self, id: ItemId) -> Option<Item<'heap>> {
        self.lock_tree(|items| {
            items
                .values()
                .find_map(|&item_id| (item_id == id).then(|| self.items[item_id].copied()))
        })
    }

    pub fn search(
        &self,
        query: impl IntoIterator<Item = InternedSymbol<'heap>>,
    ) -> Option<Item<'heap>> {
        let mut query = query.into_iter();
        let root = query.next()?;

        let item = self.find_by_name(root)?;
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

    pub items: &'heap [ItemId],
}

impl<'heap> Module<'heap> {
    /// Finds an item within this module by name.
    pub fn find(
        &self,
        registry: &ModuleRegistry<'heap>,
        name: InternedSymbol<'heap>,
    ) -> Option<Item<'heap>> {
        for &item in self.items {
            let item = registry.items[item].copied();
            if item.name == name {
                return Some(item);
            }
        }

        None
    }
}

impl HasId for Module<'_> {
    type Id = ModuleId;

    fn id(&self) -> Self::Id {
        self.id
    }
}
