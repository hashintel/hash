//! Namespace management for the HashQL module system.

use ena::snapshot_vec::{Snapshot, SnapshotVec};

use super::{
    ModuleId, ModuleRegistry,
    error::ResolutionError,
    import::{Import, ImportDelegate},
    item::{Item, ItemKind, Universe},
    resolver::ResolveIter,
};
use crate::{
    module::resolver::{Resolver, ResolverMode, ResolverOptions},
    symbol::{Symbol, sym::T},
};

pub struct ModuleNamespaceSnapshot(Snapshot);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ResolutionMode {
    Absolute,
    Relative,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ImportOptions {
    pub glob: bool,
    pub mode: ResolutionMode,
    pub suggestions: bool,
}

pub struct ResolveOptions {
    pub universe: Universe,
    pub mode: ResolutionMode,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Transaction<T> {
    Commit(T),
    Rollback(T),
}

/// Represents the namespace of a module.
///
/// A `ModuleNamespace` defines the collection of names that are available within a module.
#[derive(Debug, Clone)]
pub struct ModuleNamespace<'env, 'heap> {
    pub registry: &'env ModuleRegistry<'heap>,
    imports: SnapshotVec<ImportDelegate<'heap>>,
}

impl<'env, 'heap> ModuleNamespace<'env, 'heap> {
    /// Create a new module namespace.
    pub fn new(registry: &'env ModuleRegistry<'heap>) -> Self {
        Self {
            registry,
            imports: SnapshotVec::new(),
        }
    }

    fn import_commit(&mut self, name: Symbol<'heap>, glob: bool, iter: ResolveIter<'heap>) {
        // The resolver guarantees that the iterator is non-empty if the query was found
        for item in iter {
            if glob {
                self.imports.push(Import {
                    name: item.name,
                    item,
                });
            } else {
                self.imports.push(Import { name, item });
            }
        }
    }

    /// Attempts to add an absolute import.
    ///
    /// An absolute import directly references an item from the global module registry
    /// using a fully-qualified path.
    ///
    /// # Errors
    ///
    /// Returns a `ResolutionError` if the path cannot be resolved.
    pub fn import_absolute(
        &mut self,
        name: Symbol<'heap>,
        query: impl IntoIterator<Item = Symbol<'heap>>,
        options: ImportOptions,
    ) -> Result<(), ResolutionError<'heap>> {
        debug_assert_eq!(options.mode, ResolutionMode::Absolute);

        let resolver = Resolver {
            registry: self.registry,
            options: ResolverOptions {
                mode: if options.glob {
                    ResolverMode::Glob
                } else {
                    ResolverMode::Multi
                },
                suggestions: options.suggestions,
            },
        };

        let iter = resolver.resolve_absolute(query)?;
        self.import_commit(name, options.glob, iter);

        Ok(())
    }

    /// Attempts to add a relative import.
    ///
    /// A relative import can be resolved either:
    /// 1. As an absolute import if it exists in the global registry
    /// 2. Relative to another import already in scope
    ///
    /// # Errors
    ///
    /// Returns a `ResolutionError` if the path cannot be resolved.
    pub fn import_relative(
        &mut self,
        name: Symbol<'heap>,
        query: impl IntoIterator<Item = Symbol<'heap>>,
        options: ImportOptions,
    ) -> Result<(), ResolutionError<'heap>> {
        debug_assert_eq!(options.mode, ResolutionMode::Relative);

        let resolver = Resolver {
            registry: self.registry,
            options: ResolverOptions {
                mode: if options.glob {
                    ResolverMode::Glob
                } else {
                    ResolverMode::Multi
                },
                suggestions: options.suggestions,
            },
        };

        let iter = resolver.resolve_relative(query, &self.imports)?;
        self.import_commit(name, options.glob, iter);

        Ok(())
    }

    /// Imports a path using the specified resolution mode.
    ///
    /// # Errors
    ///
    /// Returns a `ResolutionError` if the path cannot be resolved.
    pub fn import(
        &mut self,
        name: Symbol<'heap>,
        query: impl IntoIterator<Item = Symbol<'heap>> + Clone,
        options: ImportOptions,
    ) -> Result<(), ResolutionError<'heap>> {
        match options.mode {
            ResolutionMode::Absolute => self.import_absolute(name, query, options),
            ResolutionMode::Relative => self.import_relative(name, query, options),
        }
    }

    fn import_absolute_static(
        &mut self,
        name: Symbol<'heap>,
        query: impl IntoIterator<Item = Symbol<'heap>, IntoIter: Clone>,
    ) -> bool {
        self.import_absolute(
            name,
            query,
            ImportOptions {
                glob: false,
                mode: ResolutionMode::Absolute,
                suggestions: false,
            },
        )
        .is_ok()
    }

    /// Resolves a path relative to the current scope.
    ///
    /// # Errors
    ///
    /// Returns a `ResolutionError` if the path cannot be resolved or if multiple matches are found.
    pub fn resolve_relative(
        &self,
        query: impl IntoIterator<Item = Symbol<'heap>>,
        ResolveOptions { universe, mode }: ResolveOptions,
    ) -> Result<Item<'heap>, ResolutionError<'heap>> {
        debug_assert_eq!(mode, ResolutionMode::Relative);

        let resolver = Resolver {
            registry: self.registry,
            options: ResolverOptions {
                mode: ResolverMode::Single(universe),
                suggestions: true,
            },
        };

        let mut iter = resolver.resolve_relative(query, &self.imports)?;

        let item = iter.next().unwrap_or_else(|| {
            unreachable!("ResolveIter guarantees at least one item is returned")
        });
        if iter.next().is_some() {
            Err(ResolutionError::Ambiguous(item))
        } else {
            Ok(item)
        }
    }

    /// Resolves a path from the absolute scope.
    ///
    /// # Errors
    ///
    /// Returns a `ResolutionError` if the path cannot be resolved or if multiple matches are found.
    pub fn resolve_absolute(
        &self,
        query: impl IntoIterator<Item = Symbol<'heap>>,
        ResolveOptions { universe, mode }: ResolveOptions,
    ) -> Result<Item<'heap>, ResolutionError<'heap>> {
        debug_assert_eq!(mode, ResolutionMode::Absolute);

        let resolver = Resolver {
            registry: self.registry,
            options: ResolverOptions {
                mode: ResolverMode::Single(universe),
                suggestions: true,
            },
        };

        let mut iter = resolver.resolve_absolute(query)?;
        let item = iter.next().unwrap_or_else(|| {
            unreachable!("ResolveIter guarantees at least one item is returned")
        });
        if iter.next().is_some() {
            Err(ResolutionError::Ambiguous(item))
        } else {
            Ok(item)
        }
    }

    /// Resolves a path using the specified resolution mode.
    ///
    /// # Errors
    ///
    /// Returns a `ResolutionError` if the path cannot be resolved or if multiple matches are found.
    pub fn resolve(
        &self,
        query: impl IntoIterator<Item = Symbol<'heap>> + Clone,
        options: ResolveOptions,
    ) -> Result<Item<'heap>, ResolutionError<'heap>> {
        match options.mode {
            ResolutionMode::Absolute => self.resolve_absolute(query, options),
            ResolutionMode::Relative => self.resolve_relative(query, options),
        }
    }

    fn import_modules(&mut self) {
        let root = self
            .registry
            .root
            .read()
            .expect("should be able to lock registry");

        for (&name, &module) in &*root {
            self.imports.push(Import {
                name,
                item: Item {
                    module: ModuleId::ROOT,
                    name,
                    kind: ItemKind::Module(module),
                },
            });
        }

        drop(root);
    }

    /// Imports all standard prelude items and all root modules.
    ///
    /// The prelude includes common types, special forms, and operators that should be
    /// available in every module by default. This includes:
    ///
    /// - Special forms (if, let, fn, etc.)
    /// - Common types (Boolean, Number, String, etc.)
    /// - Mathematical operators (+, -, *, /, etc.)
    /// - Logical operators (&&, ||, !, etc.)
    /// - Comparison operators (==, !=, <, >, etc.)
    ///
    /// In debug builds, this function asserts that all prelude imports are successful.
    pub fn import_prelude(&mut self) {
        self.import_modules();

        let mut successful = true;

        // Special Forms
        successful &= self.import_absolute_static(T![if], T![kernel, special_form, if]);
        successful &= self.import_absolute_static(T![is], T![kernel, special_form, is]);
        successful &= self.import_absolute_static(T![let], T![kernel, special_form, let]);
        successful &= self.import_absolute_static(T![type], T![kernel, special_form, type]);
        successful &= self.import_absolute_static(T![newtype], T![kernel, special_form, newtype]);
        successful &= self.import_absolute_static(T![use], T![kernel, special_form, use]);
        successful &= self.import_absolute_static(T![fn], T![kernel, special_form, fn]);
        successful &= self.import_absolute_static(T![input], T![kernel, special_form, input]);

        successful &= self.import_absolute_static(T![.], T![kernel, special_form, access]);
        successful &= self.import_absolute_static(T![access], T![kernel, special_form, access]);

        successful &= self.import_absolute_static(T![[]], T![kernel, special_form, index]);
        successful &= self.import_absolute_static(T![index], T![kernel, special_form, index]);

        // Type definitions
        successful &= self.import_absolute_static(T![Boolean], T![kernel, type, Boolean]);

        successful &= self.import_absolute_static(T![Number], T![kernel, type, Number]);
        successful &= self.import_absolute_static(T![Integer], T![kernel, type, Integer]);

        successful &= self.import_absolute_static(T![String], T![kernel, type, String]);
        successful &= self.import_absolute_static(T![Url], T![kernel, type, Url]);
        successful &= self.import_absolute_static(T![BaseUrl], T![kernel, type, BaseUrl]);

        successful &= self.import_absolute_static(T![List], T![kernel, type, List]);
        successful &= self.import_absolute_static(T![Dict], T![kernel, type, Dict]);

        successful &= self.import_absolute_static(T![Null], T![kernel, type, Null]);

        successful &= self.import_absolute_static(T![?], T![kernel, type, Unknown]);
        successful &= self.import_absolute_static(T![Unknown], T![kernel, type, Unknown]);

        successful &= self.import_absolute_static(T![!], T![kernel, type, Never]);
        successful &= self.import_absolute_static(T![Never], T![kernel, type, Never]);

        successful &= self.import_absolute_static(T![|], T![kernel, type, Union]);
        successful &= self.import_absolute_static(T![Union], T![kernel, type, Union]);

        successful &= self.import_absolute_static(T![&], T![kernel, type, Intersection]);
        successful &= self.import_absolute_static(T![Intersection], T![kernel, type, Intersection]);

        successful &= self.import_absolute_static(T![None], T![kernel, type, None]);
        successful &= self.import_absolute_static(T![Some], T![kernel, type, Some]);
        successful &= self.import_absolute_static(T![Option], T![kernel, type, Option]);

        successful &= self.import_absolute_static(T![Ok], T![kernel, type, Ok]);
        successful &= self.import_absolute_static(T![Err], T![kernel, type, Err]);
        successful &= self.import_absolute_static(T![Result], T![kernel, type, Result]);

        // Math operators
        successful &= self.import_absolute_static(T![+], T![math, add]);
        successful &= self.import_absolute_static(T![-], T![math, sub]);
        successful &= self.import_absolute_static(T![*], T![math, mul]);
        successful &= self.import_absolute_static(T![/], T![math, div]);
        successful &= self.import_absolute_static(T![%], T![math, mod]);
        successful &= self.import_absolute_static(T![^], T![math, pow]);

        // Bitwise operators
        successful &= self.import_absolute_static(T![&], T![math, bit_and]);
        successful &= self.import_absolute_static(T![|], T![math, bit_or]);
        successful &= self.import_absolute_static(T![~], T![math, bit_not]);
        successful &= self.import_absolute_static(T![<<], T![math, bit_shl]);
        successful &= self.import_absolute_static(T![>>], T![math, bit_shr]);

        // Comparison operators
        successful &= self.import_absolute_static(T![>], T![math, gt]);
        successful &= self.import_absolute_static(T![<], T![math, lt]);
        successful &= self.import_absolute_static(T![>=], T![math, gte]);
        successful &= self.import_absolute_static(T![<=], T![math, lte]);
        successful &= self.import_absolute_static(T![==], T![math, eq]);
        successful &= self.import_absolute_static(T![!=], T![math, ne]);

        // Logical operators
        successful &= self.import_absolute_static(T![!], T![math, not]);
        successful &= self.import_absolute_static(T![&&], T![math, and]);
        successful &= self.import_absolute_static(T![||], T![math, or]);

        // TODO: graph operations, these are excluded for now as we don't have them in the std

        debug_assert!(successful);
    }

    pub fn snapshot(&mut self) -> ModuleNamespaceSnapshot {
        ModuleNamespaceSnapshot(self.imports.start_snapshot())
    }

    pub fn commit(&mut self, snapshot: ModuleNamespaceSnapshot) {
        self.imports.commit(snapshot.0);
    }

    pub fn rollback_to(&mut self, snapshot: ModuleNamespaceSnapshot) {
        self.imports.rollback_to(snapshot.0);
    }

    pub fn in_transaction<T>(&mut self, closure: impl FnOnce(&mut Self) -> Transaction<T>) -> T {
        let snapshot = self.imports.start_snapshot();

        let transaction = closure(self);

        match transaction {
            Transaction::Commit(value) => {
                self.imports.commit(snapshot);

                value
            }
            Transaction::Rollback(value) => {
                self.imports.rollback_to(snapshot);

                value
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn imports_as_slice(&self) -> &[Import<'heap>] {
        &self.imports
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches::assert_matches;

    use super::ModuleNamespace;
    use crate::{
        heap::Heap,
        module::{
            ModuleId, ModuleRegistry, PartialModule,
            error::ResolutionError,
            item::{IntrinsicItem, Item, ItemKind, Universe},
            namespace::{ImportOptions, ResolutionMode, ResolveOptions},
        },
        span::SpanId,
        r#type::environment::Environment,
    };

    #[test]
    fn resolve_relative_value() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let item = namespace
            .resolve_relative(
                [heap.intern_symbol("Union")],
                ResolveOptions {
                    mode: ResolutionMode::Relative,
                    universe: Universe::Value,
                },
            )
            .expect("import should exist");

        assert_eq!(item.name.as_str(), "Union");
        assert_eq!(item.kind.universe(), Some(Universe::Value));

        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Union",
                universe: Universe::Value
            })
        );
    }

    #[test]
    fn resolve_relative_type() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let item = namespace
            .resolve_relative(
                [heap.intern_symbol("Dict")],
                ResolveOptions {
                    mode: ResolutionMode::Relative,
                    universe: Universe::Type,
                },
            )
            .expect("import should exist");

        assert_eq!(item.name.as_str(), "Dict");
        assert_eq!(item.kind.universe(), Some(Universe::Type));

        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Dict",
                universe: Universe::Type
            })
        );
    }

    #[test]
    fn resolve_absolute_value() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let item = namespace
            .resolve_absolute(
                [
                    heap.intern_symbol("kernel"),
                    heap.intern_symbol("type"),
                    heap.intern_symbol("Union"),
                ],
                ResolveOptions {
                    mode: ResolutionMode::Absolute,
                    universe: Universe::Value,
                },
            )
            .expect("import should exist");

        assert_eq!(item.name.as_str(), "Union");
        assert_eq!(item.kind.universe(), Some(Universe::Value));

        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Union",
                universe: Universe::Value
            })
        );
    }

    #[test]
    fn resolve_absolute_type() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let item = namespace
            .resolve_absolute(
                [
                    heap.intern_symbol("kernel"),
                    heap.intern_symbol("type"),
                    heap.intern_symbol("Dict"),
                ],
                ResolveOptions {
                    mode: ResolutionMode::Absolute,
                    universe: Universe::Type,
                },
            )
            .expect("import should exist");

        assert_eq!(item.name.as_str(), "Dict");
        assert_eq!(item.kind.universe(), Some(Universe::Type));

        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Dict",
                universe: Universe::Type
            })
        );
    }

    #[test]
    fn resolve_relative_nested() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        namespace
            .import_absolute(
                heap.intern_symbol("type"),
                [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("import should exist");

        let item = namespace
            .resolve_relative(
                [heap.intern_symbol("type"), heap.intern_symbol("Union")],
                ResolveOptions {
                    universe: Universe::Value,
                    mode: ResolutionMode::Relative,
                },
            )
            .expect("import should exist");

        assert_eq!(item.name.as_str(), "Union");
        assert_eq!(item.kind.universe(), Some(Universe::Value));

        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Union",
                universe: Universe::Value
            })
        );
    }

    #[test]
    fn shadowed_import() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let module = registry.intern_module(|id| PartialModule {
            parent: ModuleId::ROOT,
            name: heap.intern_symbol("foo"),

            items: registry.intern_items(&[Item {
                module: id.value(),
                name: heap.intern_symbol("bar"),
                kind: ItemKind::Intrinsic(IntrinsicItem {
                    name: "::foo::bar",
                    universe: Universe::Type,
                }),
            }]),
        });
        registry.register(module);

        let import = namespace
            .resolve_relative(
                [heap.intern_symbol("Dict")],
                ResolveOptions {
                    universe: Universe::Type,
                    mode: ResolutionMode::Relative,
                },
            )
            .expect("import should exist");

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.kind.universe(), Some(Universe::Type));

        assert_eq!(
            import.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Dict",
                universe: Universe::Type
            })
        );

        namespace
            .import_absolute(
                heap.intern_symbol("Dict"),
                [heap.intern_symbol("foo"), heap.intern_symbol("bar")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("should be able to import");

        let import = namespace
            .resolve_relative(
                [heap.intern_symbol("Dict")],
                ResolveOptions {
                    universe: Universe::Type,
                    mode: ResolutionMode::Relative,
                },
            )
            .expect("import should exist");

        assert_eq!(import.name.as_str(), "bar");
        assert_eq!(import.kind.universe(), Some(Universe::Type));

        assert_eq!(
            import.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::foo::bar",
                universe: Universe::Type
            })
        );
    }

    #[test]
    fn relative_import() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);

        // first import the type module as a module
        namespace
            .import_absolute(
                heap.intern_symbol("type"),
                [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("should be able to import");

        // import `Dict` relative from type (now that it is imported)
        namespace
            .import_relative(
                heap.intern_symbol("Dict"),
                [heap.intern_symbol("type"), heap.intern_symbol("Dict")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Relative,
                    suggestions: false,
                },
            )
            .expect("should be able to import");

        // We should be able to import `Dict` now
        let import = namespace
            .resolve_relative(
                [heap.intern_symbol("Dict")],
                ResolveOptions {
                    universe: Universe::Type,
                    mode: ResolutionMode::Relative,
                },
            )
            .expect("import should exist");

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.kind.universe(), Some(Universe::Type));
    }

    #[test]
    fn relative_import_renamed() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);

        // first import the type module as a module
        namespace
            .import_absolute(
                heap.intern_symbol("foo"),
                [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("should be able to import");

        // import `Dict` relative from type (now that it is imported)
        namespace
            .import_relative(
                heap.intern_symbol("Dict"),
                [heap.intern_symbol("foo"), heap.intern_symbol("Dict")],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Relative,
                    suggestions: false,
                },
            )
            .expect("should be able to import");
    }

    #[test]
    fn import_glob() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);

        // First import the type module as a module
        namespace
            .import_absolute(
                heap.intern_symbol("*"),
                [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
                ImportOptions {
                    glob: true,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("should be able to import glob from absolute");

        // We should be able to import `Dict` now
        let import = namespace
            .resolve_relative(
                [heap.intern_symbol("Dict")],
                ResolveOptions {
                    universe: Universe::Type,
                    mode: ResolutionMode::Relative,
                },
            )
            .expect("import should exist");

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.kind.universe(), Some(Universe::Type));
    }

    #[test]
    fn import_glob_does_not_exist() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);

        let error = namespace
            .import_absolute(
                heap.intern_symbol("*"),
                [heap.intern_symbol("kernel"), heap.intern_symbol("foo")],
                ImportOptions {
                    glob: true,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect_err("should be unable to import non-existent glob");

        assert_matches!(
            error,
            ResolutionError::ModuleNotFound {
                depth: 1,
                suggestions
            } if suggestions.is_empty()
        );
    }
}
