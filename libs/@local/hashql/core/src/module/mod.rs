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
pub mod std_lib;
pub mod universe;

use core::{alloc::Allocator, num::NonZero, slice};

use self::{
    error::{ResolutionError, ResolutionSuggestion},
    item::{Item, ItemKind},
    resolver::{Resolver, ResolverMode, ResolverOptions},
    std_lib::StandardLibrary,
};
pub use self::{resolver::Reference, universe::Universe};
use crate::{
    collections::{FastHashMap, fast_hash_map_in},
    heap::{BumpAllocator as _, Heap},
    id::{HasId, Id as _, IdSlice, IdVec, bit_vec::DenseBitSet, newtype},
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

pub struct PartialModuleRegistry<'heap, S: Allocator> {
    heap: &'heap Heap,
    modules: IdVec<ModuleId, Option<Module<'heap>>, S>,

    root: FastHashMap<Symbol<'heap>, ModuleId, &'heap Heap>,
}

impl<'heap, S: Allocator> PartialModuleRegistry<'heap, S> {
    pub fn new_in(heap: &'heap Heap, scratch: S) -> Self {
        Self {
            heap,
            modules: IdVec::new_in(scratch),
            root: fast_hash_map_in(heap),
        }
    }

    pub fn provision_module(&mut self) -> ModuleId {
        self.modules.push(None)
    }

    /// Interns a new module into the registry.
    ///
    /// # Panics
    ///
    /// In debug builds, this function will panic if any item in the module has a parent
    /// that doesn't match the module ID.
    pub fn insert_module(&mut self, module: Module<'heap>) {
        #[cfg(debug_assertions)]
        {
            for item in module.items {
                assert_eq!(item.module, module.id);

                // check for modules if the parent is also set *correctly* to our module
                if let ItemKind::Module(child) = item.kind {
                    let child = self
                        .modules
                        .lookup(child)
                        .expect("child modules should be registered before their parents");

                    assert_eq!(child.parent, module.id);
                    assert_eq!(child.depth.get(), module.depth.get() + 1);
                    assert_eq!(child.name, item.name);
                }
            }
        }

        let value = self.modules.insert(module.id, module);
        debug_assert!(value.is_none());
    }

    /// Register a new module in the root namespace.
    ///
    /// # Panics
    ///
    /// This function will panic if the internal `RwLock` is poisoned.
    pub fn register(&mut self, module: ModuleId) {
        let module = self
            .modules
            .lookup(module)
            .expect("module must be inserted to be able to register it");

        debug_assert_eq!(module.parent, ModuleId::ROOT);

        self.root.insert(module.name, module.id);
    }

    #[expect(unsafe_code)]
    pub fn finish(self, heap: &'heap Heap) -> ModuleRegistry<'heap> {
        assert!(
            self.modules.iter().all(Option::is_some),
            "all modules must be inserted to be able to finish the registry"
        );

        let modules = heap.allocate_slice_uninit(self.modules.len());
        for (dst, src) in modules.iter_mut().zip(self.modules.iter()) {
            // SAFETY: We have just verified above that all modules are Some
            unsafe {
                dst.write(src.unwrap_unchecked());
            }
        }

        // SAFETY: We have just written all items into the slice, and have verified above that all
        // modules are Some
        let modules = unsafe { modules.assume_init_ref() };

        ModuleRegistry {
            heap,
            modules: IdSlice::from_raw(modules),
            root: self.root,
        }
    }
}

/// The central registry for all modules and items in a HashQL program.
///
/// The `ModuleRegistry` serves as the global namespace for module resolution.
/// It tracks all available modules and their exported items.
#[derive(Debug)]
pub struct ModuleRegistry<'heap> {
    /// A reference to the global heap used for memory allocation.
    pub heap: &'heap Heap,

    modules: &'heap IdSlice<ModuleId, Module<'heap>>,

    root: FastHashMap<Symbol<'heap>, ModuleId, &'heap Heap>,
}

impl<'heap> ModuleRegistry<'heap> {
    pub fn new_in<S: Allocator + Clone>(env: &Environment<'heap>, scratch: S) -> Self {
        let mut partial = PartialModuleRegistry::new_in(env.heap, scratch.clone());

        let mut std = StandardLibrary::new(env, &mut partial, scratch);
        std.register();

        partial.finish(env.heap)
    }

    /// Find an item by name in the root namespace.
    ///
    /// # Panics
    ///
    /// This function will panic if the internal `RwLock` is poisoned.
    #[must_use]
    pub fn find_by_name(&self, name: Symbol<'heap>) -> Option<Module<'heap>> {
        let id = self.root.get(&name).copied()?;

        Some(self.modules[id])
    }

    /// Finds suggestions for the given name in the root namespace.
    fn suggestions(&self) -> impl ExactSizeIterator<Item = ResolutionSuggestion<'heap, ModuleId>> {
        self.root
            .iter()
            .map(|(&name, &id)| ResolutionSuggestion { item: id, name })
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
    #[must_use]
    pub fn search_by_name(
        &self,
        name: Symbol<'heap>,
        universe: Universe,
    ) -> impl IntoIterator<Item = Item<'heap>> {
        let mut stack: Vec<_> = self.root.values().copied().collect();

        let mut seen = DenseBitSet::new_empty(self.modules.len());
        let mut current: slice::Iter<'heap, Item<'heap>> = [].iter();

        core::iter::from_fn(move || {
            'outer: loop {
                // Process all items in the current module, before continuing to the next module
                for &item in current.by_ref() {
                    if item.name == name && item.kind.universe() == Some(universe) {
                        return Some(item);
                    }

                    if let ItemKind::Module(child) = item.kind
                        && !seen.contains(child)
                    {
                        stack.push(child);
                    }
                }

                // Current module is exhausted, try to get the next module from the stack
                while let Some(id) = stack.pop() {
                    if !seen.insert(id) {
                        continue;
                    }

                    current = self.modules[id].items.iter();

                    // Jump back to processing items in this new module
                    continue 'outer;
                }

                // We have exhausted all modules and all items, therefore we are done
                break;
            }

            None
        })
    }

    #[must_use]
    pub fn module_depth(&self, id: ModuleId) -> u32 {
        if id == ModuleId::ROOT {
            return 0;
        }

        self.modules[id].depth.get()
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
    pub depth: NonZero<u32>,

    pub items: &'heap [Item<'heap>],
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

impl HasId for Module<'_> {
    type Id = ModuleId;

    fn id(&self) -> Self::Id {
        self.id
    }
}
