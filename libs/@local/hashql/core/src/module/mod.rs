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
pub mod universe;

use core::slice;
use std::sync::RwLock;

use self::{
    error::{ResolutionError, ResolutionSuggestion},
    item::{Item, ItemKind},
    resolver::{Resolver, ResolverMode, ResolverOptions},
    std_lib::StandardLibrary,
};
pub use self::{resolver::Reference, universe::Universe};
use crate::{
    collections::{FastHashMap, FastHashSet},
    heap::Heap,
    id::{HasId, Id as _, newtype},
    intern::{Decompose, InternMap, InternSet, Interned, Provisioned},
    symbol::Symbol,
    r#type::environment::Environment,
};

newtype! {
    #[id(crate = crate)]
    pub struct ModuleId(u32 is 0..=0xFFFF_FF00)
}

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

        let mut std = StandardLibrary::new(env, &this);
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
    fn suggestions(&self) -> Vec<ResolutionSuggestion<'heap, ModuleId>> {
        let root = self.root.read().expect("lock should not be poisoned");

        let mut results = Vec::with_capacity(root.len());
        for (&key, &module) in &*root {
            results.push(ResolutionSuggestion {
                item: module,
                name: key,
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
            match item {
                Reference::Binding(_) => {
                    unreachable!("Absolute path cannot point to a local binding")
                }
                Reference::Item(item) => Ok(item),
            }
        }
    }

    /// Attempts to resolve a path to an item in the registry.
    ///
    /// This is a simplified version of [`resolve`] that returns `None` instead of
    /// detailed error information. It performs the same resolution logic but:
    /// - Returns `None` if the path cannot be resolved
    /// - Returns `None` if the path resolves to multiple items (ambiguous resolution)
    /// - Returns `Some(item)` only when exactly one item is found
    /// - Does not generate suggestions for failed resolutions
    ///
    /// Use this method when you need a simple "find or not found" lookup without
    /// detailed error reporting. For comprehensive error information and suggestions,
    /// use [`resolve`] instead.
    ///
    /// [`resolve`]: Self::resolve
    pub fn lookup(
        &self,
        path: impl IntoIterator<Item = Symbol<'heap>>,
        universe: Universe,
    ) -> Option<Item<'heap>> {
        let resolver = Resolver {
            registry: self,
            options: ResolverOptions {
                mode: ResolverMode::Single(universe),
                suggestions: false,
            },
        };

        let Ok(mut iter) = resolver.resolve_absolute(path) else {
            return None;
        };

        let item = iter.next().unwrap_or_else(|| {
            unreachable!("ResolveIter guarantees at least one item is returned")
        });

        if iter.next().is_some() {
            None
        } else {
            match item {
                Reference::Binding(_) => {
                    unreachable!("Absolute path cannot point to a local binding")
                }
                Reference::Item(item) => Some(item),
            }
        }
    }

    /// Searches for items with the given name in the specified universe.
    ///
    /// This function performs a depth-first traversal of the module hierarchy, starting from the
    /// root modules, and returns an iterator over all items that match both:
    /// - The exact name provided
    /// - The specified universe
    ///
    /// # Algorithm
    ///
    /// The function implements a non-recursive DFS traversal using:
    /// - A stack to track modules to visit
    /// - A set to prevent revisiting modules (avoiding cycles)
    /// - A stateful iterator for the current module's items
    ///
    /// For each module, it:
    /// 1. Examines all items in the module
    /// 2. Returns matching items as they're found
    /// 3. Adds child modules to the stack for later exploration
    /// 4. After exhausting a module's items, proceeds to the next module from the stack
    ///
    /// # Performance
    ///
    /// This method requires allocation for the traversal state:
    /// - A vector for the module exploration stack
    /// - A hash set for tracking visited modules
    ///
    /// # Panics
    ///
    /// This function will panic if the internal `RwLock` is poisoned.
    pub fn search_by_name(
        &self,
        name: Symbol<'heap>,
        universe: Universe,
    ) -> impl IntoIterator<Item = Item<'heap>> {
        let mut stack: Vec<_> = self
            .root
            .read()
            .expect("lock should not be poisoned")
            .values()
            .copied()
            .collect();

        let mut seen = FastHashSet::with_capacity_and_hasher(
            stack.len(),
            foldhash::fast::RandomState::default(),
        );
        let mut current: slice::Iter<'heap, Item<'heap>> = [].iter();

        core::iter::from_fn(move || {
            'outer: loop {
                // Process all items in the current module, before continuing to the next module
                for &item in current.by_ref() {
                    if item.name == name && item.kind.universe() == Some(universe) {
                        return Some(item);
                    }

                    if let ItemKind::Module(child) = item.kind
                        && !seen.contains(&child)
                    {
                        stack.push(child);
                    }
                }

                // Current module is exhausted, try to get the next module from the stack
                while let Some(id) = stack.pop() {
                    if seen.contains(&id) {
                        continue;
                    }

                    seen.insert(id);

                    let module = self.modules.index(id);
                    current = module.items.into_iter();

                    // Jump back to processing items in this new module
                    continue 'outer;
                }

                // We have exhausted all modules and all items, therefore we are done
                break;
            }

            None
        })
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
        mut select: impl FnMut(&Item<'heap>) -> bool,
    ) -> Vec<ResolutionSuggestion<'heap, Item<'heap>>> {
        let mut similarities = Vec::with_capacity(self.items.len());

        for &item in self.items {
            if !select(&item) {
                continue;
            }

            similarities.push(ResolutionSuggestion {
                item,
                name: item.name,
            });
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
