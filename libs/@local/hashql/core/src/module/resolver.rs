use core::iter;

use strsim::jaro_winkler;

use super::{
    Module, ModuleId, ModuleRegistry,
    error::Suggestion,
    import::Import,
    item::{Item, ItemKind, Universe},
};
use crate::symbol::InternedSymbol;

pub(crate) type ModuleItemIterator<'heap> = impl ExactSizeIterator<Item = Item<'heap>>;
pub(crate) type MultiResolveItemIterator<'heap> = impl Iterator<Item = Item<'heap>>;
pub(crate) type MultiResolveImportIterator<'heap> = impl Iterator<Item = Item<'heap>>;

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

#[derive(Debug, Clone, PartialEq)]
pub enum ResolveError<'heap> {
    InvalidQueryLength {
        expected: usize,
    },
    ModuleRequired {
        depth: usize,
        found: Option<Universe>,
    },

    PackageNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<ModuleId>>,
    },
    ImportNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<Import<'heap>>>,
    },

    ModuleNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<Item<'heap>>>,
    },

    ItemNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<Item<'heap>>>,
    },

    Ambiguous(Item<'heap>),

    ModuleEmpty {
        depth: usize,
    },
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
    fn suggest<T>(&self, call: impl FnOnce() -> Vec<Suggestion<T>>) -> Vec<Suggestion<T>> {
        if self.options.suggestions {
            call()
        } else {
            Vec::new()
        }
    }

    fn with_suggestions<T>(&mut self, enable: bool, closure: impl FnOnce(&mut Self) -> T) -> T {
        let current = self.options.suggestions;
        self.options.suggestions = enable;

        let result = closure(self);

        self.options.suggestions = current;
        result
    }

    fn resolve_single(
        &self,
        module: Module<'heap>,
        universe: Universe,
        name: InternedSymbol<'heap>,
        depth: usize,
    ) -> Result<iter::Once<Item<'heap>>, ResolveError<'heap>> {
        let item = module
            .items
            .iter()
            .copied()
            .find(|item| item.name == name && item.kind.universe() == Some(universe));

        let Some(item) = item else {
            return Err(ResolveError::ItemNotFound {
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
        name: InternedSymbol<'heap>,
        depth: usize,
    ) -> Result<MultiResolveItemIterator<'heap>, ResolveError<'heap>> {
        let mut item = module
            .items
            .into_iter()
            .copied()
            .filter(move |item| item.name == name)
            .peekable();

        if item.peek().is_none() {
            return Err(ResolveError::ItemNotFound {
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
        name: InternedSymbol<'heap>,
        depth: usize,
    ) -> Result<ModuleItemIterator<'heap>, ResolveError<'heap>> {
        let candidate = module
            .items
            .iter()
            .copied()
            .find_map(|item| match item.kind {
                ItemKind::Module(module) if item.name == name => Some(module),
                _ => None,
            });

        let Some(module) = candidate else {
            return Err(ResolveError::ModuleNotFound {
                depth,
                suggestions: self.suggest(|| {
                    module.suggestions(name, |item| matches!(item.kind, ItemKind::Module(_)))
                }),
            });
        };

        let module = self.registry.modules.index(module);

        if module.items.is_empty() {
            return Err(ResolveError::ModuleEmpty { depth });
        }

        Ok(module.items.into_iter().copied())
    }

    fn resolve_impl(
        &self,
        query: impl IntoIterator<Item = InternedSymbol<'heap>>,
        mut module: Module<'heap>,
    ) -> Result<ResolveIter<'heap>, ResolveError<'heap>> {
        let mut query = query.into_iter().enumerate().peekable();

        // Traverse the entry until we're at the last item
        let (depth, name) = loop {
            let Some((mut depth, name)) = query.next() else {
                return Err(ResolveError::InvalidQueryLength { expected: 2 });
            };

            // We start at 1, because the entry (the one we're starting at) is selected by the user
            depth += 1;

            if query.peek().is_none() {
                // The last item is the entry we're trying to resolve to
                break (depth, name);
            }

            let Some(&item) = module.items.iter().find(|item| item.name == name) else {
                return Err(ResolveError::ModuleNotFound {
                    depth,
                    suggestions: self.suggest(|| {
                        module.suggestions(name, |item| matches!(item.kind, ItemKind::Module(_)))
                    }),
                });
            };

            // Because we're not at the last item, the item needs to be a module
            let ItemKind::Module(next) = item.kind else {
                return Err(ResolveError::ModuleRequired {
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
        query: impl IntoIterator<Item = InternedSymbol<'heap>>,
    ) -> Result<ResolveIter<'heap>, ResolveError<'heap>> {
        let mut query = query.into_iter();

        let Some(name) = query.next() else {
            return Err(ResolveError::InvalidQueryLength { expected: 2 });
        };

        let Some(module) = self.registry.find_by_name(name) else {
            return Err(ResolveError::PackageNotFound {
                depth: 0,
                suggestions: self.suggest(|| self.registry.suggestions(name)),
            });
        };

        self.resolve_impl(query, module)
    }

    fn resolve_import_single(
        &self,
        name: InternedSymbol<'heap>,
        imports: &[Import<'heap>],
        universe: Universe,
    ) -> Result<iter::Once<Item<'heap>>, ResolveError<'heap>> {
        let import = imports
            .iter()
            .rev()
            .find(|import| import.name == name && import.item.kind.universe() == Some(universe));

        let Some(import) = import else {
            return Err(ResolveError::ImportNotFound {
                depth: 0,
                suggestions: self.suggest(|| {
                    imports
                        .iter()
                        .filter(|import| import.item.kind.universe() == Some(universe))
                        .map(|&import| {
                            let score = jaro_winkler(import.name.as_str(), name.as_str());
                            Suggestion {
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
        name: InternedSymbol<'heap>,
        imports: &[Import<'heap>],
    ) -> Result<MultiResolveImportIterator<'heap>, ResolveError<'heap>> {
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
            return Err(ResolveError::ImportNotFound {
                depth: 0,
                suggestions: self.suggest(|| {
                    imports
                        .iter()
                        .map(|&import| {
                            let score = jaro_winkler(import.name.as_str(), name.as_str());
                            Suggestion {
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
        name: InternedSymbol<'heap>,
        imports: &[Import<'heap>],
    ) -> Result<ModuleItemIterator<'heap>, ResolveError<'heap>> {
        let module = imports
            .iter()
            .rev()
            .find_map(|import| match import.item.kind {
                ItemKind::Module(module) if import.name == name => Some(module),
                _ => None,
            });

        let Some(module) = module else {
            return Err(ResolveError::ModuleRequired {
                depth: 0,
                found: None,
            });
        };

        let module = self.registry.modules.index(module);

        if module.items.is_empty() {
            return Err(ResolveError::ModuleEmpty { depth: 0 });
        }

        Ok(module.items.into_iter().copied())
    }

    #[expect(clippy::panic_in_result_fn, reason = "sanity check")]
    pub(crate) fn resolve_relative(
        &mut self,
        query: impl IntoIterator<Item = InternedSymbol<'heap>> + Clone,
        imports: &[Import<'heap>],
    ) -> Result<ResolveIter<'heap>, ResolveError<'heap>> {
        // first check if we can import the module via it's absolute path, do not record
        // suggestions, as that is unnecessarily slow
        if let Ok(iter) = self.with_suggestions(false, |this| this.resolve_absolute(query.clone()))
        {
            return Ok(iter);
        }

        let mut query = query.into_iter().peekable();

        let Some(name) = query.next() else {
            return Err(ResolveError::InvalidQueryLength { expected: 1 });
        };

        // This does *not* work, as it depends on the type, what we're going to import :/
        let Some(&import) = imports.iter().find(|import| import.name == name) else {
            return Err(ResolveError::ImportNotFound {
                depth: 0,
                suggestions: self.suggest(|| {
                    imports
                        .iter()
                        .map(|&import| {
                            let score = jaro_winkler(import.name.as_str(), name.as_str());
                            Suggestion {
                                item: import,
                                score,
                            }
                        })
                        .collect()
                }),
            });
        };

        let has_next = query.peek().is_none();

        if has_next {
            let module = imports
                .iter()
                .rev()
                .find_map(|import| match import.item.kind {
                    ItemKind::Module(module) if import.name == name => Some(module),
                    _ => None,
                });

            let Some(module) = module else {
                return Err(ResolveError::ModuleRequired {
                    depth: 0,
                    found: import.item.kind.universe(),
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
