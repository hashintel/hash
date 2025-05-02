use core::iter;

use super::{
    Module, ModuleRegistry,
    error::Suggestion,
    item::{Item, ItemKind, Universe},
};
use crate::symbol::InternedSymbol;

#[derive(Debug, Clone, PartialEq)]
pub enum ResolveError<'heap> {
    NotEnoughLengthChangeName,
    ExpectedModule {
        depth: usize,
        found: Option<Universe>,
    },
    ModuleNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<Item<'heap>>>,
    },
    ItemNotFound {
        depth: usize,
        suggestions: Vec<Suggestion<Item<'heap>>>,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ResolverMode {
    Single(Universe),
    Glob,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ResolverOptions {
    mode: ResolverMode,
    suggestions: bool,
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

    fn resolve_single(
        &self,
        module: Module<'heap>,
        universe: Universe,
        name: InternedSymbol<'heap>,
        depth: usize,
    ) -> Result<impl IntoIterator<Item = Item<'heap>>, ResolveError<'heap>> {
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

    fn resolve_glob(
        &self,
        module: Module<'heap>,
        name: InternedSymbol<'heap>,
        depth: usize,
    ) -> Result<impl IntoIterator<Item = Item<'heap>>, ResolveError<'heap>> {
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

        Ok(self
            .registry
            .modules
            .index(module)
            .items
            .into_iter()
            .copied())
    }

    pub(crate) fn resolve(
        &self,
        mut module: Module<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>>,
    ) -> Result<impl IntoIterator<Item = Item<'heap>>, ResolveError<'heap>> {
        let mut query = query.into_iter().enumerate().peekable();

        // Traverse the entry until we're at the last item
        let (depth, name) = loop {
            let Some((mut depth, name)) = query.next() else {
                return Err(ResolveError::NotEnoughLengthChangeName);
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
                return Err(ResolveError::ExpectedModule {
                    depth,
                    found: item.kind.universe(),
                });
            };

            module = self.registry.modules.index(next);
        };

        let mut iter_single = None;
        let mut iter_glob = None;

        match self.options.mode {
            ResolverMode::Single(universe) => {
                iter_single = Some(self.resolve_single(module, universe, name, depth)?);
            }
            ResolverMode::Glob => {
                iter_glob = Some(self.resolve_glob(module, name, depth)?);
            }
        }

        // This might look weird, but allows us to use a single `Iterator`, without a custom type
        // which is pretty neat!
        Ok(iter_single
            .into_iter()
            .flatten()
            .chain(iter_glob.into_iter().flatten()))
    }
}
