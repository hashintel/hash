use core::{fmt::Debug, iter};

use super::{
    Module, ModuleId, ModuleRegistry, Universe,
    error::{ResolutionError, ResolutionSuggestion},
    import::Import,
    item::{Item, ItemKind},
    locals::LocalBinding,
};
use crate::{module::import::ImportReference, symbol::Symbol};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Reference<'heap> {
    Binding(LocalBinding<'heap, Universe>),
    Item(Item<'heap>),
}

impl<'heap> Reference<'heap> {
    #[must_use]
    pub const fn name(&self) -> Symbol<'heap> {
        match self {
            Self::Binding(binding) => binding.name,
            Self::Item(item) => item.name,
        }
    }

    #[must_use]
    pub const fn universe(&self) -> Option<Universe> {
        match self {
            Self::Binding(binding) => Some(binding.value),
            Self::Item(item) => item.kind.universe(),
        }
    }
}

pub(crate) type ModuleItemIterator<'heap> = impl ExactSizeIterator<Item = Reference<'heap>> + Debug;
pub(crate) type MultiResolveItemIterator<'heap> = impl Iterator<Item = Reference<'heap>> + Debug;
pub(crate) type MultiResolveImportIterator<'heap> = impl Iterator<Item = Reference<'heap>> + Debug;

#[derive(Debug)]
pub(crate) enum ResolveIter<'heap> {
    Single(iter::Once<Reference<'heap>>),
    MultiResolve(MultiResolveItemIterator<'heap>),
    MultiImport(MultiResolveImportIterator<'heap>),
    Glob(ModuleItemIterator<'heap>),
}

impl<'heap> Iterator for ResolveIter<'heap> {
    type Item = Reference<'heap>;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            ResolveIter::Single(iter) => iter.next(),
            ResolveIter::MultiResolve(iter) => iter.next(),
            ResolveIter::MultiImport(iter) => iter.next(),
            ResolveIter::Glob(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            ResolveIter::Single(iter) => iter.size_hint(),
            ResolveIter::MultiResolve(iter) => iter.size_hint(),
            ResolveIter::MultiImport(iter) => iter.size_hint(),
            ResolveIter::Glob(iter) => iter.size_hint(),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ResolverMode {
    Single(Universe),
    Multi,
    Glob,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ResolverOptions {
    pub mode: ResolverMode,
    pub suggestions: bool,
}

pub(crate) struct Resolver<'env, 'heap> {
    pub registry: &'env ModuleRegistry<'heap>,
    pub options: ResolverOptions,
}

impl<'heap> Resolver<'_, 'heap> {
    fn suggest<T>(
        &self,
        call: impl FnOnce() -> Vec<ResolutionSuggestion<'heap, T>>,
    ) -> Vec<ResolutionSuggestion<'heap, T>> {
        if self.options.suggestions {
            call()
        } else {
            Vec::new()
        }
    }

    fn resolve_single(
        &self,
        module: Module<'heap>,
        universe: Universe,
        name: Symbol<'heap>,
        depth: usize,
    ) -> Result<iter::Once<Reference<'heap>>, ResolutionError<'heap>> {
        let item = module
            .items
            .iter()
            .copied()
            .find(|item| item.name == name && item.kind.universe() == Some(universe));

        let Some(item) = item else {
            return Err(ResolutionError::ItemNotFound {
                depth,
                name,
                suggestions: self
                    .suggest(|| module.suggestions(|item| item.kind.universe() == Some(universe))),
            });
        };

        Ok(iter::once(Reference::Item(item)))
    }

    #[define_opaque(MultiResolveItemIterator)]
    fn resolve_multi(
        &self,
        module: Module<'heap>,
        name: Symbol<'heap>,
        depth: usize,
    ) -> Result<MultiResolveItemIterator<'heap>, ResolutionError<'heap>> {
        let mut item = module
            .items
            .into_iter()
            .copied()
            .filter(move |item| item.name == name)
            .map(Reference::Item)
            .peekable();

        if item.peek().is_none() {
            return Err(ResolutionError::ItemNotFound {
                depth,
                name,
                suggestions: self.suggest(|| module.suggestions(|_| true)),
            });
        }

        Ok(item)
    }

    #[define_opaque(ModuleItemIterator)]
    fn resolve_glob(
        &self,
        module: Module<'heap>,
        name: Symbol<'heap>,
        depth: usize,
    ) -> Result<ModuleItemIterator<'heap>, ResolutionError<'heap>> {
        let candidate = module
            .items
            .iter()
            .copied()
            .find_map(|item| match item.kind {
                ItemKind::Module(module) if item.name == name => Some(module),
                ItemKind::Module(_)
                | ItemKind::Type(_)
                | ItemKind::Constructor(_)
                | ItemKind::Intrinsic(_) => None,
            });

        let Some(module) = candidate else {
            return Err(ResolutionError::ModuleNotFound {
                depth,
                name,
                suggestions: self.suggest(|| {
                    module.suggestions(|item| matches!(item.kind, ItemKind::Module(_)))
                }),
            });
        };

        let module = self.registry.modules.index(module);

        if module.items.is_empty() {
            return Err(ResolutionError::ModuleEmpty { depth });
        }

        Ok(module.items.into_iter().copied().map(Reference::Item))
    }

    #[define_opaque(ModuleItemIterator)]
    fn resolve_impl(
        &self,
        query: impl IntoIterator<Item = Symbol<'heap>>,
        mut module: Module<'heap>,
    ) -> Result<ResolveIter<'heap>, ResolutionError<'heap>> {
        let mut query = query.into_iter().enumerate().peekable();

        // In case that we're in glob mode and the query is empty (which is only valid in glob
        // mode), return all items
        if query.peek().is_none() && self.options.mode == ResolverMode::Glob {
            if module.items.is_empty() {
                return Err(ResolutionError::ModuleEmpty { depth: 0 });
            }

            return Ok(ResolveIter::Glob(
                module.items.into_iter().copied().map(Reference::Item),
            ));
        }

        // Traverse the entry until we're at the last item
        let (depth, name) = loop {
            let Some((mut depth, name)) = query.next() else {
                return Err(ResolutionError::InvalidQueryLength { expected: 2 });
            };

            // We start at 1, because the entry (the one we're starting at) is selected by the user
            depth += 1;

            if query.peek().is_none() {
                // The last item is the entry we're trying to resolve to
                break (depth, name);
            }

            let Some(&item) = module.items.iter().find(|item| item.name == name) else {
                return Err(ResolutionError::ModuleNotFound {
                    depth,
                    name,
                    suggestions: self.suggest(|| {
                        module.suggestions(|item| matches!(item.kind, ItemKind::Module(_)))
                    }),
                });
            };

            // Because we're not at the last item, the item needs to be a module
            let ItemKind::Module(next) = item.kind else {
                return Err(ResolutionError::ModuleRequired {
                    depth,
                    found: item.kind.universe(),
                });
            };

            module = self.registry.modules.index(next);
        };

        match self.options.mode {
            ResolverMode::Single(universe) => self
                .resolve_single(module, universe, name, depth)
                .map(ResolveIter::Single),
            ResolverMode::Multi => self
                .resolve_multi(module, name, depth)
                .map(ResolveIter::MultiResolve),
            ResolverMode::Glob => self
                .resolve_glob(module, name, depth)
                .map(ResolveIter::Glob),
        }
    }

    pub(crate) fn resolve_absolute(
        &self,
        query: impl IntoIterator<Item = Symbol<'heap>>,
    ) -> Result<ResolveIter<'heap>, ResolutionError<'heap>> {
        let mut query = query.into_iter();

        let Some(name) = query.next() else {
            return Err(ResolutionError::InvalidQueryLength { expected: 2 });
        };

        let Some(module) = self.registry.find_by_name(name) else {
            return Err(ResolutionError::PackageNotFound {
                depth: 0,
                name,
                suggestions: self.suggest(|| self.registry.suggestions()),
            });
        };

        self.resolve_impl(query, module)
    }

    fn resolve_import_single(
        &self,
        name: Symbol<'heap>,
        imports: &[Import<'heap>],
        universe: Universe,
    ) -> Result<iter::Once<Reference<'heap>>, ResolutionError<'heap>> {
        let import = imports
            .iter()
            .rev()
            .find(|import| import.name == name && import.item.universe() == Some(universe));

        let Some(import) = import else {
            return Err(ResolutionError::ImportNotFound {
                depth: 0,
                name,
                suggestions: self.suggest(|| {
                    imports
                        .iter()
                        .filter(|import| import.item.universe() == Some(universe))
                        .map(|&import| ResolutionSuggestion {
                            item: import,
                            name: import.name,
                        })
                        .collect()
                }),
            });
        };

        Ok(iter::once(import.into_reference()))
    }

    #[define_opaque(MultiResolveImportIterator)]
    fn resolve_import_multi(
        &self,
        name: Symbol<'heap>,
        imports: &[Import<'heap>],
    ) -> Result<MultiResolveImportIterator<'heap>, ResolutionError<'heap>> {
        let mut base = imports
            .iter()
            .rev()
            .copied()
            .filter(|import| import.name == name);

        // try to import one of every type
        let value = base
            .clone()
            .find(|import| import.item.universe() == Some(Universe::Value));

        let r#type = base
            .clone()
            .find(|import| import.item.universe() == Some(Universe::Type));

        let module = base.find(|import| {
            matches!(
                import.item,
                ImportReference::Item(Item {
                    kind: ItemKind::Module(_),
                    module: _,
                    name: _
                })
            )
        });

        if value.is_none() && r#type.is_none() && module.is_none() {
            return Err(ResolutionError::ImportNotFound {
                depth: 0,
                name,
                suggestions: self.suggest(|| {
                    imports
                        .iter()
                        .map(|&import| ResolutionSuggestion {
                            item: import,
                            name: import.name,
                        })
                        .collect()
                }),
            });
        }

        Ok(value
            .into_iter()
            .chain(r#type)
            .chain(module)
            .map(Import::into_reference))
    }

    fn find_module_from_imports(
        name: Symbol<'heap>,
        imports: &[Import<'heap>],
    ) -> Option<ModuleId> {
        imports.iter().rev().find_map(|import| match import.item {
            ImportReference::Item(Item {
                kind: ItemKind::Module(module),
                module: _,
                name: _,
            }) if import.name == name => Some(module),
            ImportReference::Item(Item {
                kind:
                    ItemKind::Module(_)
                    | ItemKind::Type(_)
                    | ItemKind::Constructor(_)
                    | ItemKind::Intrinsic(_),
                module: _,
                name: _,
            })
            | ImportReference::Binding(_) => None,
        })
    }

    #[define_opaque(ModuleItemIterator)]
    fn resolve_import_glob(
        &self,
        name: Symbol<'heap>,
        imports: &[Import<'heap>],
    ) -> Result<ModuleItemIterator<'heap>, ResolutionError<'heap>> {
        let module = Self::find_module_from_imports(name, imports);

        let Some(module) = module else {
            return Err(ResolutionError::ModuleRequired {
                depth: 0,
                found: None,
            });
        };

        let module = self.registry.modules.index(module);

        if module.items.is_empty() {
            return Err(ResolutionError::ModuleEmpty { depth: 0 });
        }

        Ok(module.items.into_iter().copied().map(Reference::Item))
    }

    #[expect(clippy::panic_in_result_fn, reason = "sanity check")]
    pub(crate) fn resolve_relative(
        &self,
        query: impl IntoIterator<Item = Symbol<'heap>>,
        imports: &[Import<'heap>],
    ) -> Result<ResolveIter<'heap>, ResolutionError<'heap>> {
        let mut query = query.into_iter().peekable();

        let Some(name) = query.next() else {
            return Err(ResolutionError::InvalidQueryLength { expected: 1 });
        };

        let has_next = query.peek().is_some();

        if has_next {
            let module = Self::find_module_from_imports(name, imports);

            let Some(module) = module else {
                return Err(ResolutionError::ModuleNotFound {
                    depth: 0,
                    name,
                    suggestions: self.suggest(|| {
                        // take every unique name from the imports (that are modules)
                        let mut names: Vec<_> = imports
                            .iter()
                            .filter_map(|import| import.into_item().map(|item| (import.name, item)))
                            .filter(|(_, item)| matches!(item.kind, ItemKind::Module(_)))
                            .map(|(name, item)| ResolutionSuggestion { item, name })
                            .collect();

                        names.sort_unstable_by_key(|ResolutionSuggestion { item: _, name }| *name);
                        names.dedup_by_key(|ResolutionSuggestion { item: _, name }| *name);

                        names
                    }),
                });
            };

            let module = self.registry.modules.index(module);
            return self.resolve_impl(query, module);
        }

        assert_eq!(query.next(), None);

        match self.options.mode {
            ResolverMode::Single(universe) => self
                .resolve_import_single(name, imports, universe)
                .map(ResolveIter::Single),
            ResolverMode::Multi => self
                .resolve_import_multi(name, imports)
                .map(ResolveIter::MultiImport),
            ResolverMode::Glob => self
                .resolve_import_glob(name, imports)
                .map(ResolveIter::Glob),
        }
    }
}

#[cfg(test)]
mod test {
    #![coverage(off)]
    use core::assert_matches::assert_matches;

    use super::{Reference, ResolutionError};
    use crate::{
        heap::Heap,
        module::{
            ModuleId, ModuleRegistry, PartialModule, Universe,
            item::Item,
            namespace::{ImportOptions, ModuleNamespace, ResolutionMode},
            resolver::{Resolver, ResolverMode, ResolverOptions},
        },
        r#type::environment::Environment,
    };

    impl<'heap> Reference<'heap> {
        #[track_caller]
        pub(crate) fn expect_item(self) -> Item<'heap> {
            match self {
                Self::Binding(_) => panic!("Expected an item, received a binding"),
                Self::Item(item) => item,
            }
        }
    }

    #[test]
    fn single_mode_resolve_type() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Single(Universe::Type),
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_absolute([
                heap.intern_symbol("kernel"),
                heap.intern_symbol("type"),
                heap.intern_symbol("Dict"),
            ])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 1);

        let item = items[0].expect_item();
        assert_eq!(item.name.as_str(), "Dict");
        assert_eq!(item.kind.universe(), Some(Universe::Type));
    }

    #[test]
    fn single_mode_resolve_value() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Single(Universe::Value),
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_absolute([
                heap.intern_symbol("core"),
                heap.intern_symbol("url"),
                heap.intern_symbol("Url"),
            ])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 1);

        let item = items[0].expect_item();
        assert_eq!(item.name.as_str(), "Url");
        assert_eq!(item.kind.universe(), Some(Universe::Value));
    }

    #[test]
    fn single_mode_item_not_found() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Single(Universe::Type),
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_absolute([
                heap.intern_symbol("kernel"),
                heap.intern_symbol("type"),
                heap.intern_symbol("NonExistentType"),
            ])
            .expect_err("Resolution should fail for non-existent item");

        assert_matches!(error, ResolutionError::ItemNotFound { depth: 2, name: _, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn multi_mode_resolution() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Multi,
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_absolute([
                heap.intern_symbol("core"),
                heap.intern_symbol("url"),
                heap.intern_symbol("Url"),
            ])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 2);

        // Verify we have both Type and Value universes
        assert!(
            items
                .iter()
                .any(|item| item.universe() == Some(Universe::Type))
        );

        assert!(
            items
                .iter()
                .any(|item| item.universe() == Some(Universe::Value))
        );
    }

    #[test]
    fn multi_mode_single_universe_item() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Multi,
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_absolute([
                heap.intern_symbol("core"),
                heap.intern_symbol("math"),
                heap.intern_symbol("add"),
            ])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 1);

        let item = items[0].expect_item();
        assert_eq!(item.kind.universe(), Some(Universe::Value));
    }

    #[test]
    fn glob_mode_resolution() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Glob,
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_absolute([heap.intern_symbol("kernel"), heap.intern_symbol("type")])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert!(!items.is_empty());

        // Check for some known items in the "type" module
        assert!(items.iter().any(|item| item.name().as_str() == "Dict"));
        assert!(items.iter().any(|item| item.name().as_str() == "Boolean"));
        assert!(items.iter().any(|item| item.name().as_str() == "Never"));
    }

    #[test]
    fn glob_mode_first_level() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Glob,
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_absolute([heap.intern_symbol("kernel")])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert!(!items.is_empty());

        // Check for some known items in the "type" module
        assert!(items.iter().any(|item| item.name().as_str() == "type"));
        assert!(
            items
                .iter()
                .any(|item| item.name().as_str() == "special_form")
        );
    }

    #[test]
    fn glob_mode_module_not_found() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Glob,
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_absolute([
                heap.intern_symbol("kernel"),
                heap.intern_symbol("nonexistent_module"),
            ])
            .expect_err("Resolution should fail for non-existent module");

        assert_matches!(error, ResolutionError::ModuleNotFound { depth: 1, name: _, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn invalid_query_length_absolute() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Multi,
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_absolute([])
            .expect_err("Resolution should fail for empty query");

        assert_matches!(error, ResolutionError::InvalidQueryLength { expected: 2 });

        let error = resolver
            .resolve_absolute([heap.intern_symbol("kernel")])
            .expect_err("Resolution should fail for empty query");

        assert_matches!(error, ResolutionError::InvalidQueryLength { expected: 2 });
    }

    #[test]
    fn invalid_query_length_relative() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Glob,
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_relative([], &[])
            .expect_err("Resolution should fail for empty query");

        assert_matches!(error, ResolutionError::InvalidQueryLength { expected: 1 });
    }

    #[test]
    fn package_not_found() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Glob,
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_absolute([heap.intern_symbol("nonexistent_package")])
            .expect_err("Resolution should fail for non-existent package");

        assert_matches!(error, ResolutionError::PackageNotFound { depth: 0, name: _, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn module_required_error() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Glob,
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_absolute([
                heap.intern_symbol("core"),
                heap.intern_symbol("math"),
                heap.intern_symbol("add"), // This is a value, not a module
                heap.intern_symbol("anything"),
            ])
            .expect_err("Resolution should fail for non-module item");

        assert_matches!(
            error,
            ResolutionError::ModuleRequired {
                depth: 2,
                found: Some(Universe::Value)
            }
        );
    }

    #[test]
    fn module_empty_error() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        // Create an empty module and register it
        let empty_module_id = registry.intern_module(|_| {
            PartialModule {
                name: heap.intern_symbol("empty_module"),
                parent: ModuleId::ROOT,
                items: registry.intern_items(&[]), // No items
            }
        });

        registry.register(empty_module_id);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Glob,
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_absolute([heap.intern_symbol("empty_module")])
            .expect_err("Resolution should fail for empty module");

        assert_matches!(error, ResolutionError::ModuleEmpty { depth: 0 });
    }

    #[test]
    fn absolute_module_not_found() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Single(Universe::Type),
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_absolute([
                heap.intern_symbol("kernel"),
                heap.intern_symbol("nonexistent_module"), // This module doesn't exist
                heap.intern_symbol("anything"),
            ])
            .expect_err("Resolution should fail for non-existent module");

        assert_matches!(error, ResolutionError::ModuleNotFound { depth: 1, name: _, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn relative_single_resolution() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        // import type under a new alias
        namespace
            .import(
                heap.intern_symbol("foo"),
                [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("Import should succeed");

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Single(Universe::Type),
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_relative(
                [heap.intern_symbol("foo"), heap.intern_symbol("Dict")],
                namespace.imports_as_slice(),
            )
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name().as_str(), "Dict");
        assert_eq!(items[0].universe(), Some(Universe::Type));
    }

    #[test]
    fn relative_multi_resolution() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        // import type under a new alias
        namespace
            .import(
                heap.intern_symbol("foo"),
                [heap.intern_symbol("core"), heap.intern_symbol("url")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("Import should succeed");

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Multi,
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_relative(
                [heap.intern_symbol("foo"), heap.intern_symbol("Url")],
                namespace.imports_as_slice(),
            )
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 2);

        // Verify we have both Type and Value universes
        assert!(
            items
                .iter()
                .any(|item| item.universe() == Some(Universe::Type))
        );
        assert!(
            items
                .iter()
                .any(|item| item.universe() == Some(Universe::Value))
        );

        let result = resolver
            .resolve_relative([heap.intern_symbol("Url")], namespace.imports_as_slice())
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 2);

        // Verify we have both Type and Value universes
        assert!(
            items
                .iter()
                .any(|item| item.universe() == Some(Universe::Type))
        );
        assert!(
            items
                .iter()
                .any(|item| item.universe() == Some(Universe::Value))
        );
    }

    #[test]
    fn relative_module_not_found() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        namespace
            .import(
                heap.intern_symbol("type"),
                [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("Import should succeed");

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Single(Universe::Type),
                suggestions: false,
            },
        };

        let error = resolver
            .resolve_relative(
                [
                    heap.intern_symbol("type"),
                    heap.intern_symbol("nonexistent_module"), // This module doesn't exist
                    heap.intern_symbol("anything"),
                ],
                namespace.imports_as_slice(),
            )
            .expect_err("Resolution should fail for non-existent module");

        assert_matches!(error, ResolutionError::ModuleNotFound { depth: 1, name: _, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn relative_glob_mode_first_level() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let registry = ModuleRegistry::new(&env);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        namespace
            .import(
                heap.intern_symbol("type"),
                [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("Import should succeed");

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Glob,
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_relative([heap.intern_symbol("type")], namespace.imports_as_slice())
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert!(!items.is_empty());

        // Check for some known items in the "type" module
        assert!(items.iter().any(|item| item.name().as_str() == "Dict"));
        assert!(items.iter().any(|item| item.name().as_str() == "Never"));
    }
}
