//! Module system for HashQL language.
//!
//! This module provides the core functionality for defining and resolving modules,
//! managing imports, and maintaining the global registry of available items.
// TODO: This might move into the HIR instead, if required
pub mod error;
pub mod import;
pub mod item;
pub mod locals;
pub mod namespace;
mod resolver;
mod std_lib;

use std::sync::RwLock;

use strsim::jaro_winkler;

use self::{
    error::{ResolutionError, ResolutionSuggestion},
    item::{Item, ItemKind, Universe},
    resolver::{Resolver, ResolverMode, ResolverOptions},
    std_lib::StandardLibrary,
};
use crate::{
    collection::FastHashMap,
    heap::Heap,
    id::{HasId, Id as _},
    intern::{Decompose, InternMap, InternSet, Interned, Provisioned},
    newtype,
    symbol::Symbol,
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

    pub modules: InternMap<'heap, Module<'heap>>,
    items: InternSet<'heap, [Item<'heap>]>,

    root: RwLock<FastHashMap<Symbol<'heap>, ModuleId>>,
}

impl<'heap> ModuleRegistry<'heap> {
    /// Creates an empty module registry using the given heap.
    pub fn empty(heap: &'heap Heap) -> Self {
        Self {
            heap,
            modules: InternMap::new(heap),
            items: InternSet::new(heap),
            root: RwLock::default(),
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
    /// This function will panic if the internal `RwLock` is poisoned.
    pub fn register(&self, module: ModuleId) {
        let module = self.modules.index(module);

        if cfg!(debug_assertions) {
            assert_eq!(module.parent, ModuleId::ROOT);
        }

        let mut root = self.root.write().expect("lock should not be poisoned");
        root.insert(module.name, module.id);
        drop(root);
    }

    /// Find an item by name in the root namespace.
    ///
    /// # Panics
    ///
    /// This function will panic if the internal `RwLock` is poisoned.
    fn find_by_name(&self, name: Symbol<'heap>) -> Option<Module<'heap>> {
        let root = self.root.read().expect("lock should not be poisoned");

        let id = root.get(&name).copied()?;
        drop(root);

        let module = self.modules.index(id);

        Some(module)
    }

    /// Finds suggestions for the given name in the root namespace.
    fn suggestions(&self, name: Symbol<'heap>) -> Vec<ResolutionSuggestion<ModuleId>> {
        let root = self.root.read().expect("lock should not be poisoned");

        let mut results = Vec::with_capacity(root.len());
        for (&key, &module) in &*root {
            let score = jaro_winkler(key.as_str(), name.as_str());
            results.push(ResolutionSuggestion {
                item: module,
                score,
            });
        }
        drop(root);

        results
    }

    /// Resolves a path to an item in the registry.
    ///
    /// # Errors
    ///
    /// Returns a `ResolutionError` if:
    /// - The path cannot be resolved to any item
    /// - The path resolves to multiple items (ambiguous resolution)
    /// - Any part of the path fails to resolve correctly
    pub fn resolve(
        &self,
        path: impl IntoIterator<Item = Symbol<'heap>>,
        universe: Universe,
    ) -> Result<Item<'heap>, ResolutionError<'heap>> {
        let resolver = Resolver {
            registry: self,
            options: ResolverOptions {
                mode: ResolverMode::Single(universe),
                suggestions: true,
            },
        };

        let mut iter = resolver.resolve_absolute(path)?;
        let item = iter.next().unwrap_or_else(|| {
            unreachable!("ResolveIter guarantees at least one item is returned")
        });

        if iter.next().is_some() {
            Err(ResolutionError::Ambiguous(item))
        } else {
            Ok(item)
        }
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
    pub name: Symbol<'heap>,

    pub parent: ModuleId,

    pub items: Interned<'heap, [Item<'heap>]>,
}

impl<'heap> Module<'heap> {
    fn suggestions(
        &self,
        name: Symbol<'heap>,
        mut select: impl FnMut(&Item<'heap>) -> bool,
    ) -> Vec<ResolutionSuggestion<Item<'heap>>> {
        let mut similarities = Vec::with_capacity(self.items.len());

        for &item in self.items {
            if !select(&item) {
                continue;
            }

            let score = jaro_winkler(item.name.as_str(), name.as_str());
            similarities.push(ResolutionSuggestion { item, score });
        }

        similarities
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PartialModule<'heap> {
    name: Symbol<'heap>,
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
