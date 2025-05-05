use core::{fmt::Debug, iter};

use strsim::jaro_winkler;

use super::{
    Module, ModuleRegistry,
    error::{ResolutionError, ResolutionSuggestion},
    import::Import,
    item::{Item, ItemKind, Universe},
};
use crate::symbol::Symbol;

pub(crate) type ModuleItemIterator<'heap> = impl ExactSizeIterator<Item = Item<'heap>> + Debug;
pub(crate) type MultiResolveItemIterator<'heap> = impl Iterator<Item = Item<'heap>> + Debug;
pub(crate) type MultiResolveImportIterator<'heap> = impl Iterator<Item = Item<'heap>> + Debug;

#[derive(Debug)]
pub(crate) enum ResolveIter<'heap> {
    Single(iter::Once<Item<'heap>>),
    MultiResolve(MultiResolveItemIterator<'heap>),
    MultiImport(MultiResolveImportIterator<'heap>),
    Glob(ModuleItemIterator<'heap>),
}

impl<'heap> Iterator for ResolveIter<'heap> {
    type Item = Item<'heap>;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            ResolveIter::Single(iter) => iter.next(),
            ResolveIter::MultiResolve(iter) => iter.next(),
            ResolveIter::MultiImport(iter) => iter.next(),
            ResolveIter::Glob(iter) => iter.next(),
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
        call: impl FnOnce() -> Vec<ResolutionSuggestion<T>>,
    ) -> Vec<ResolutionSuggestion<T>> {
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
    ) -> Result<iter::Once<Item<'heap>>, ResolutionError<'heap>> {
        let item = module
            .items
            .iter()
            .copied()
            .find(|item| item.name == name && item.kind.universe() == Some(universe));

        let Some(item) = item else {
            return Err(ResolutionError::ItemNotFound {
                depth,
                suggestions: self.suggest(|| {
                    module.suggestions(name, |item| item.kind.universe() == Some(universe))
                }),
            });
        };

        Ok(iter::once(item))
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
            .peekable();

        if item.peek().is_none() {
            return Err(ResolutionError::ItemNotFound {
                depth,
                suggestions: self.suggest(|| module.suggestions(name, |_| true)),
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
                _ => None,
            });

        let Some(module) = candidate else {
            return Err(ResolutionError::ModuleNotFound {
                depth,
                suggestions: self.suggest(|| {
                    module.suggestions(name, |item| matches!(item.kind, ItemKind::Module(_)))
                }),
            });
        };

        let module = self.registry.modules.index(module);

        if module.items.is_empty() {
            return Err(ResolutionError::ModuleEmpty { depth });
        }

        Ok(module.items.into_iter().copied())
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

            return Ok(ResolveIter::Glob(module.items.into_iter().copied()));
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
                    suggestions: self.suggest(|| {
                        module.suggestions(name, |item| matches!(item.kind, ItemKind::Module(_)))
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
                suggestions: self.suggest(|| self.registry.suggestions(name)),
            });
        };

        self.resolve_impl(query, module)
    }

    fn resolve_import_single(
        &self,
        name: Symbol<'heap>,
        imports: &[Import<'heap>],
        universe: Universe,
    ) -> Result<iter::Once<Item<'heap>>, ResolutionError<'heap>> {
        let import = imports
            .iter()
            .rev()
            .find(|import| import.name == name && import.item.kind.universe() == Some(universe));

        let Some(import) = import else {
            return Err(ResolutionError::ImportNotFound {
                depth: 0,
                suggestions: self.suggest(|| {
                    imports
                        .iter()
                        .filter(|import| import.item.kind.universe() == Some(universe))
                        .map(|&import| {
                            let score = jaro_winkler(import.name.as_str(), name.as_str());
                            ResolutionSuggestion {
                                item: import,
                                score,
                            }
                        })
                        .collect()
                }),
            });
        };

        Ok(iter::once(import.item))
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
            .find(|import| import.item.kind.universe() == Some(Universe::Value));

        let r#type = base
            .clone()
            .find(|import| import.item.kind.universe() == Some(Universe::Type));

        let module = base.find(|import| matches!(import.item.kind, ItemKind::Module(_)));

        if value.is_none() && r#type.is_none() && module.is_none() {
            return Err(ResolutionError::ImportNotFound {
                depth: 0,
                suggestions: self.suggest(|| {
                    imports
                        .iter()
                        .map(|&import| {
                            let score = jaro_winkler(import.name.as_str(), name.as_str());
                            ResolutionSuggestion {
                                item: import,
                                score,
                            }
                        })
                        .collect()
                }),
            });
        }

        Ok(value
            .into_iter()
            .chain(r#type)
            .chain(module)
            .map(|import| import.item))
    }

    #[define_opaque(ModuleItemIterator)]
    fn resolve_import_glob(
        &self,
        name: Symbol<'heap>,
        imports: &[Import<'heap>],
    ) -> Result<ModuleItemIterator<'heap>, ResolutionError<'heap>> {
        let module = imports
            .iter()
            .rev()
            .find_map(|import| match import.item.kind {
                ItemKind::Module(module) if import.name == name => Some(module),
                _ => None,
            });

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

        Ok(module.items.into_iter().copied())
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
            let module = imports
                .iter()
                .rev()
                .find_map(|import| match import.item.kind {
                    ItemKind::Module(module) if import.name == name => Some(module),
                    _ => None,
                });

            let Some(module) = module else {
                return Err(ResolutionError::ModuleNotFound {
                    depth: 0,
                    suggestions: self.suggest(|| {
                        // take every unique name from the imports (that are modules)
                        let mut names: Vec<_> = imports
                            .iter()
                            .filter(|import| matches!(import.item.kind, ItemKind::Module(_)))
                            .map(|import| ResolutionSuggestion {
                                item: import.item,
                                score: jaro_winkler(import.item.name.as_str(), name.as_str()),
                            })
                            .collect();

                        names.sort_unstable_by_key(|ResolutionSuggestion { item, score: _ }| {
                            item.name
                        });
                        names.dedup_by_key(|ResolutionSuggestion { item, score: _ }| item.name);

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
    use core::assert_matches::assert_matches;

    use super::ResolutionError;
    use crate::{
        heap::Heap,
        module::{
            ModuleId, ModuleRegistry, PartialModule,
            item::Universe,
            namespace::{ImportOptions, ModuleNamespace, ResolutionMode},
            resolver::{Resolver, ResolverMode, ResolverOptions},
        },
        span::SpanId,
        r#type::environment::Environment,
    };

    #[test]
    fn single_mode_resolve_type() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
        assert_eq!(items[0].name.as_str(), "Dict",);
        assert_eq!(items[0].kind.universe(), Some(Universe::Type),);
    }

    #[test]
    fn single_mode_resolve_value() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
                heap.intern_symbol("kernel"),
                heap.intern_symbol("type"),
                heap.intern_symbol("Dict"),
            ])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name.as_str(), "Dict",);
        assert_eq!(items[0].kind.universe(), Some(Universe::Value));
    }

    #[test]
    fn single_mode_item_not_found() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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

        assert_matches!(error, ResolutionError::ItemNotFound { depth: 2, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn multi_mode_resolution() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
                heap.intern_symbol("kernel"),
                heap.intern_symbol("type"),
                heap.intern_symbol("Dict"),
            ])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 2);

        // Verify we have both Type and Value universes
        assert!(
            items
                .iter()
                .any(|item| item.kind.universe() == Some(Universe::Type))
        );

        assert!(
            items
                .iter()
                .any(|item| item.kind.universe() == Some(Universe::Value))
        );
    }

    #[test]
    fn multi_mode_single_universe_item() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&env);

        let resolver = Resolver {
            registry: &registry,
            options: ResolverOptions {
                mode: ResolverMode::Multi,
                suggestions: false,
            },
        };

        let result = resolver
            .resolve_absolute([heap.intern_symbol("math"), heap.intern_symbol("add")])
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind.universe(), Some(Universe::Value));
    }

    #[test]
    fn glob_mode_resolution() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
        assert!(items.iter().any(|item| item.name.as_str() == "Dict"));
        assert!(items.iter().any(|item| item.name.as_str() == "Boolean"));
        assert!(items.iter().any(|item| item.name.as_str() == "Union"));
    }

    #[test]
    fn glob_mode_first_level() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
        assert!(items.iter().any(|item| item.name.as_str() == "type"));
        assert!(
            items
                .iter()
                .any(|item| item.name.as_str() == "special_form")
        );
    }

    #[test]
    fn glob_mode_module_not_found() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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

        assert_matches!(error, ResolutionError::ModuleNotFound { depth: 1, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn invalid_query_length_absolute() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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

        assert_matches!(error, ResolutionError::PackageNotFound { depth: 0, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn module_required_error() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
                heap.intern_symbol("math"),
                heap.intern_symbol("add"), // This is a value, not a module
                heap.intern_symbol("anything"),
            ])
            .expect_err("Resolution should fail for non-module item");

        assert_matches!(
            error,
            ResolutionError::ModuleRequired {
                depth: 1,
                found: Some(Universe::Value)
            }
        );
    }

    #[test]
    fn module_empty_error() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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

        assert_matches!(error, ResolutionError::ModuleNotFound { depth: 1, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn relative_single_resolution() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
        assert_eq!(items[0].name.as_str(), "Dict");
        assert_eq!(items[0].kind.universe(), Some(Universe::Type));
    }

    #[test]
    fn relative_multi_resolution() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
                mode: ResolverMode::Multi,
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
        assert_eq!(items.len(), 2);

        // Verify we have both Type and Value universes
        assert!(
            items
                .iter()
                .any(|item| item.kind.universe() == Some(Universe::Type))
        );
        assert!(
            items
                .iter()
                .any(|item| item.kind.universe() == Some(Universe::Value))
        );

        let result = resolver
            .resolve_relative([heap.intern_symbol("Dict")], namespace.imports_as_slice())
            .expect("Resolution should succeed");

        let items: Vec<_> = result.collect();
        assert_eq!(items.len(), 2);

        // Verify we have both Type and Value universes
        assert!(
            items
                .iter()
                .any(|item| item.kind.universe() == Some(Universe::Type))
        );
        assert!(
            items
                .iter()
                .any(|item| item.kind.universe() == Some(Universe::Value))
        );
    }

    #[test]
    fn relative_module_not_found() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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

        assert_matches!(error, ResolutionError::ModuleNotFound { depth: 1, suggestions } if suggestions.is_empty());
    }

    #[test]
    fn relative_glob_mode_first_level() {
        let heap = Heap::new();
        let env = Environment::new(SpanId::SYNTHETIC, &heap);
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
        assert!(items.iter().any(|item| item.name.as_str() == "Dict"));
        assert!(items.iter().any(|item| item.name.as_str() == "Union"));
    }
}
