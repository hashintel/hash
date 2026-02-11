//! Namespace management for the HashQL module system.

use ena::snapshot_vec::{Snapshot, SnapshotVec};

use super::{
    ModuleId, ModuleRegistry, Universe,
    error::ResolutionError,
    import::{Import, ImportDelegate, ImportReference},
    item::{Item, ItemKind},
    resolver::{Reference, ResolveIter},
};
use crate::{
    collections::FastHashSet,
    module::resolver::{Resolver, ResolverMode, ResolverOptions},
    symbol::Symbol,
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
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
    registry: &'env ModuleRegistry<'heap>,
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

    #[must_use]
    pub const fn registry(&self) -> &'env ModuleRegistry<'heap> {
        self.registry
    }

    fn import_commit(&mut self, name: Symbol<'heap>, glob: bool, iter: ResolveIter<'heap>) {
        // The resolver guarantees that the iterator is non-empty if the query was found
        for item in iter {
            let name = if glob { item.name() } else { name };

            self.imports.push(Import {
                name,
                item: ImportReference::from_reference(item),
            });
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
    fn import_absolute(
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
    fn import_relative(
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

    /// Push a local import to the namespace.
    ///
    /// This prevents imports from being resolved in the specified universe to the specific item.
    pub fn local(&mut self, name: Symbol<'heap>, universe: Universe) {
        self.imports.push(Import {
            name,
            item: ImportReference::Binding(universe),
        });
    }

    /// Return all the locals that have been registered so far.
    #[must_use]
    pub fn locals(&self, universe: Universe) -> FastHashSet<Symbol<'heap>> {
        self.imports
            .iter()
            .filter_map(|import| match import.item {
                ImportReference::Binding(binding_universe) if binding_universe == universe => {
                    Some(import.name)
                }
                ImportReference::Binding(_) | ImportReference::Item(_) => None,
            })
            .collect()
    }

    fn import_absolute_static(
        &mut self,
        name: &'static str,
        query: impl IntoIterator<Item = &'static str, IntoIter: Clone>,
    ) -> bool {
        let name = self.registry.heap.intern_symbol(name);
        let query = query
            .into_iter()
            .map(|symbol| self.registry.heap.intern_symbol(symbol));

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
    fn resolve_relative(
        &self,
        query: impl IntoIterator<Item = Symbol<'heap>>,
        ResolveOptions { universe, mode }: ResolveOptions,
    ) -> Result<Reference<'heap>, ResolutionError<'heap>> {
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
    fn resolve_absolute(
        &self,
        query: impl IntoIterator<Item = Symbol<'heap>>,
        ResolveOptions { universe, mode }: ResolveOptions,
    ) -> Result<Reference<'heap>, ResolutionError<'heap>> {
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
    ) -> Result<Reference<'heap>, ResolutionError<'heap>> {
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
                item: ImportReference::Item(Item {
                    module: ModuleId::ROOT,
                    name,
                    kind: ItemKind::Module(module),
                }),
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
    #[expect(clippy::non_ascii_literal)]
    pub fn import_prelude(&mut self) {
        self.import_modules();

        let mut successful = true;

        // Special Forms
        successful &= self.import_absolute_static("if", ["kernel", "special_form", "if"]);
        successful &= self.import_absolute_static("as", ["kernel", "special_form", "as"]);
        successful &= self.import_absolute_static("let", ["kernel", "special_form", "let"]);
        successful &= self.import_absolute_static("type", ["kernel", "special_form", "type"]);
        successful &= self.import_absolute_static("newtype", ["kernel", "special_form", "newtype"]);
        successful &= self.import_absolute_static("use", ["kernel", "special_form", "use"]);
        successful &= self.import_absolute_static("fn", ["kernel", "special_form", "fn"]);
        successful &= self.import_absolute_static("input", ["kernel", "special_form", "input"]);

        successful &= self.import_absolute_static(".", ["kernel", "special_form", "access"]);
        successful &= self.import_absolute_static("access", ["kernel", "special_form", "access"]);

        successful &= self.import_absolute_static("[]", ["kernel", "special_form", "index"]);
        successful &= self.import_absolute_static("index", ["kernel", "special_form", "index"]);

        // Type definitions
        successful &= self.import_absolute_static("Boolean", ["kernel", "type", "Boolean"]);

        successful &= self.import_absolute_static("Number", ["kernel", "type", "Number"]);
        successful &= self.import_absolute_static("Integer", ["kernel", "type", "Integer"]);

        successful &= self.import_absolute_static("String", ["kernel", "type", "String"]);

        successful &= self.import_absolute_static("List", ["kernel", "type", "List"]);
        successful &= self.import_absolute_static("Dict", ["kernel", "type", "Dict"]);

        successful &= self.import_absolute_static("Null", ["kernel", "type", "Null"]);

        successful &= self.import_absolute_static("?", ["kernel", "type", "Unknown"]);
        successful &= self.import_absolute_static("Unknown", ["kernel", "type", "Unknown"]);

        successful &= self.import_absolute_static("!", ["kernel", "type", "Never"]);
        successful &= self.import_absolute_static("Never", ["kernel", "type", "Never"]);

        successful &= self.import_absolute_static("Url", ["core", "url", "Url"]);

        successful &= self.import_absolute_static("None", ["core", "option", "None"]);
        successful &= self.import_absolute_static("Some", ["core", "option", "Some"]);
        successful &= self.import_absolute_static("Option", ["core", "option", "Option"]);

        successful &= self.import_absolute_static("Ok", ["core", "result", "Ok"]);
        successful &= self.import_absolute_static("Err", ["core", "result", "Err"]);
        successful &= self.import_absolute_static("Result", ["core", "result", "Result"]);

        // Math operators
        successful &= self.import_absolute_static("+", ["core", "math", "add"]);
        successful &= self.import_absolute_static("-", ["core", "math", "sub"]);
        successful &= self.import_absolute_static("*", ["core", "math", "mul"]);
        successful &= self.import_absolute_static("/", ["core", "math", "div"]);
        successful &= self.import_absolute_static("%", ["core", "math", "rem"]);
        successful &= self.import_absolute_static("mod", ["core", "math", "mod"]);
        successful &= self.import_absolute_static("**", ["core", "math", "pow"]);
        successful &= self.import_absolute_static("↑", ["core", "math", "pow"]);
        successful &= self.import_absolute_static("sqrt", ["core", "math", "sqrt"]);
        successful &= self.import_absolute_static("√", ["core", "math", "sqrt"]);
        successful &= self.import_absolute_static("cbrt", ["core", "math", "cbrt"]);
        successful &= self.import_absolute_static("∛", ["core", "math", "cbrt"]);

        // Bitwise operators
        successful &= self.import_absolute_static("&", ["core", "bits", "and"]);
        successful &= self.import_absolute_static("|", ["core", "bits", "or"]);
        successful &= self.import_absolute_static("^", ["core", "bits", "xor"]);
        successful &= self.import_absolute_static("~", ["core", "bits", "not"]);
        successful &= self.import_absolute_static("<<", ["core", "bits", "shl"]);
        successful &= self.import_absolute_static(">>", ["core", "bits", "shr"]);

        // Comparison operators
        successful &= self.import_absolute_static(">", ["core", "cmp", "gt"]);
        successful &= self.import_absolute_static("<", ["core", "cmp", "lt"]);
        successful &= self.import_absolute_static(">=", ["core", "cmp", "gte"]);
        successful &= self.import_absolute_static("<=", ["core", "cmp", "lte"]);
        successful &= self.import_absolute_static("==", ["core", "cmp", "eq"]);
        successful &= self.import_absolute_static("!=", ["core", "cmp", "ne"]);

        // Logical operators
        successful &= self.import_absolute_static("!", ["core", "bool", "not"]);
        successful &= self.import_absolute_static("&&", ["core", "bool", "and"]);
        successful &= self.import_absolute_static("||", ["core", "bool", "or"]);

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
    #![coverage(off)]
    use core::assert_matches;

    use super::ModuleNamespace;
    use crate::{
        heap::Heap,
        module::{
            ModuleId, ModuleRegistry, PartialModule, Reference, Universe,
            error::ResolutionError,
            item::{IntrinsicItem, IntrinsicTypeItem, IntrinsicValueItem, Item, ItemKind},
            namespace::{ImportOptions, ResolutionMode, ResolveOptions},
        },
        r#type::environment::Environment,
    };

    #[test]
    fn resolve_relative_value() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let item = namespace
            .resolve_relative(
                [heap.intern_symbol("+")],
                ResolveOptions {
                    mode: ResolutionMode::Relative,
                    universe: Universe::Value,
                },
            )
            .expect("import should exist")
            .expect_item();

        assert_eq!(item.name.as_str(), "add");
        assert_eq!(item.kind.universe(), Some(Universe::Value));

        assert_matches!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem::Value(IntrinsicValueItem {
                name: "::core::math::add",
                r#type: _
            }))
        );
    }

    #[test]
    fn resolve_relative_type() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
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
            .expect("import should exist")
            .expect_item();

        assert_eq!(item.name.as_str(), "Dict");
        assert_eq!(item.kind.universe(), Some(Universe::Type));

        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem::Type(IntrinsicTypeItem {
                name: "::kernel::type::Dict",
            }))
        );
    }

    #[test]
    fn resolve_absolute_value() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let item = namespace
            .resolve_absolute(
                [
                    heap.intern_symbol("kernel"),
                    heap.intern_symbol("special_form"),
                    heap.intern_symbol("let"),
                ],
                ResolveOptions {
                    mode: ResolutionMode::Absolute,
                    universe: Universe::Value,
                },
            )
            .expect("import should exist")
            .expect_item();

        assert_eq!(item.name.as_str(), "let");
        assert_eq!(item.kind.universe(), Some(Universe::Value));

        assert_matches!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem::Value(IntrinsicValueItem {
                name: "::kernel::special_form::let",
                r#type: _
            }))
        );
    }

    #[test]
    fn resolve_absolute_type() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
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
            .expect("import should exist")
            .expect_item();

        assert_eq!(item.name.as_str(), "Dict");
        assert_eq!(item.kind.universe(), Some(Universe::Type));

        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem::Type(IntrinsicTypeItem {
                name: "::kernel::type::Dict",
            }))
        );
    }

    #[test]
    fn resolve_relative_nested() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        namespace
            .import_absolute(
                heap.intern_symbol("special_form"),
                [
                    heap.intern_symbol("kernel"),
                    heap.intern_symbol("special_form"),
                ],
                ImportOptions {
                    glob: false,
                    mode: ResolutionMode::Absolute,
                    suggestions: false,
                },
            )
            .expect("import should exist");

        let item = namespace
            .resolve_relative(
                [
                    heap.intern_symbol("special_form"),
                    heap.intern_symbol("let"),
                ],
                ResolveOptions {
                    universe: Universe::Value,
                    mode: ResolutionMode::Relative,
                },
            )
            .expect("import should exist")
            .expect_item();

        assert_eq!(item.name.as_str(), "let");
        assert_eq!(item.kind.universe(), Some(Universe::Value));

        assert_matches!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem::Value(IntrinsicValueItem {
                name: "::kernel::special_form::let",
                r#type: _
            }))
        );
    }

    #[test]
    fn shadowed_import() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let module = registry.intern_module(|id| PartialModule {
            parent: ModuleId::ROOT,
            name: heap.intern_symbol("foo"),

            items: registry.intern_items(&[Item {
                module: id.value(),
                name: heap.intern_symbol("bar"),
                kind: ItemKind::Intrinsic(IntrinsicItem::Type(IntrinsicTypeItem {
                    name: "::foo::bar",
                })),
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
            .expect("import should exist")
            .expect_item();

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.kind.universe(), Some(Universe::Type));

        assert_eq!(
            import.kind,
            ItemKind::Intrinsic(IntrinsicItem::Type(IntrinsicTypeItem {
                name: "::kernel::type::Dict",
            }))
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
            .expect("import should exist")
            .expect_item();

        assert_eq!(import.name.as_str(), "bar");
        assert_eq!(import.kind.universe(), Some(Universe::Type));

        assert_eq!(
            import.kind,
            ItemKind::Intrinsic(IntrinsicItem::Type(IntrinsicTypeItem {
                name: "::foo::bar"
            }))
        );
    }

    #[test]
    fn relative_import() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
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
            .expect("import should exist")
            .expect_item();

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.kind.universe(), Some(Universe::Type));
    }

    #[test]
    fn relative_import_renamed() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
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
        let environment = Environment::new(&heap);
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
            .expect("import should exist")
            .expect_item();

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.kind.universe(), Some(Universe::Type));
    }

    #[test]
    fn import_glob_does_not_exist() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
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
                name: _,
                suggestions
            } if suggestions.is_empty()
        );
    }

    #[test]
    fn import_local() {
        let heap = Heap::new();
        let environment = Environment::new(&heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        namespace.local(heap.intern_symbol("+"), Universe::Value);

        assert_eq!(
            namespace
                .locals(Universe::Value)
                .into_iter()
                .collect::<Vec<_>>(),
            [heap.intern_symbol("+")]
        );
        assert_eq!(
            namespace
                .locals(Universe::Type)
                .into_iter()
                .collect::<Vec<_>>(),
            []
        );

        let item = namespace
            .resolve_relative(
                [heap.intern_symbol("+")],
                ResolveOptions {
                    universe: Universe::Value,
                    mode: ResolutionMode::Relative,
                },
            )
            .expect("should be able to resolve symbol");

        assert_matches!(item, Reference::Binding(_));
    }
}
