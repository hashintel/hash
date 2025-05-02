//! Namespace management for the HashQL module system.
use ena::snapshot_vec::{Snapshot, SnapshotVec};

use super::{
    ModuleRegistry,
    import::{Import, ImportDelegate},
    item::{Item, ItemKind, Universe},
};
use crate::symbol::InternedSymbol;

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
    pub fn new(registry: &'env ModuleRegistry<'heap>) -> Self {
        Self {
            registry,
            imports: SnapshotVec::new(),
        }
    }

    fn import_glob(&mut self, items: Vec<Item<'heap>>) -> bool {
        if !items
            .iter()
            .any(|item| matches!(item.kind, ItemKind::Module(_)))
        {
            return false;
        }

        for item in items {
            // Import everything if it is a module, otherwise skip it
            let ItemKind::Module(module) = item.kind else {
                continue;
            };

            for &item in self.registry.modules.index(module).items {
                self.imports.push(Import {
                    name: item.name,
                    item,
                });
            }
        }

        true
    }

    fn import_resolve(
        &mut self,
        name: InternedSymbol<'heap>,
        items: Vec<Item<'heap>>,
        ImportOptions { glob, mode: _ }: ImportOptions,
    ) -> bool {
        if items.is_empty() {
            return false;
        }

        if glob {
            return self.import_glob(items);
        }

        for item in items {
            self.imports.push(Import { name, item });
        }

        true
    }

    pub fn import(
        &mut self,
        name: InternedSymbol<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
        options: ImportOptions,
    ) -> bool {
        match options.mode {
            ResolutionMode::Absolute => self.import_absolute(name, query, options),
            ResolutionMode::Relative => self.import_relative(name, query, options),
        }
    }

    /// Attempts to add an absolute import.
    ///
    /// An absolute import directly references an item from the global module registry
    /// using a fully-qualified path.
    ///
    /// # Returns
    ///
    /// `true` if the import was successful, `false` if the item wasn't found.
    pub fn import_absolute(
        &mut self,
        name: InternedSymbol<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
        options: ImportOptions,
    ) -> bool {
        debug_assert_eq!(options.mode, ResolutionMode::Absolute);

        let results = self.registry.search(query);

        self.import_resolve(name, results, options)
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

    /// Attempts to add a relative import.
    ///
    /// A relative import can be resolved either:
    /// 1. As an absolute import if it exists in the global registry
    /// 2. Relative to another import already in scope
    ///
    /// # Returns
    ///
    /// `true` if the import was successfully resolved, `false` if the item wasn't found.
    pub fn import_relative(
        &mut self,
        name: InternedSymbol<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
        options: ImportOptions,
    ) -> bool {
        debug_assert_eq!(options.mode, ResolutionMode::Relative);

        let mut query = query.into_iter();

        // First try to find the item as absolute import
        if self.import_absolute(
            name,
            query.clone(),
            ImportOptions {
                glob: options.glob,
                mode: ResolutionMode::Absolute,
            },
        ) {
            return true;
        }

        let Some(entry) = query.next() else {
            return false;
        };

        // Next find the item as a relative import
        let mut found = None;
        for import in self.imports.iter().rev() {
            let universe = import.item.kind.universe();

            if universe.is_some() {
                // Only modules don't have a universe, which are the only ones nested, therefore we
                // can easily skip a lookup that isn't required.
                continue;
            }

            if import.name != entry {
                continue;
            }

            let results = import.item.search(self.registry, query.clone());

            if !results.is_empty() {
                found = Some(results);
                break;
            }
        }

        let Some(found) = found else {
            return false;
        };

        self.import_resolve(name, found, options)
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
            },
        )
    }

    pub fn resolve_relative_import(
        &self,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
        ResolveOptions { universe, mode }: ResolveOptions,
    ) -> Option<Item<'heap>> {
        debug_assert_eq!(mode, ResolutionMode::Relative);

        let mut query = query.into_iter();

        let entry = query.next()?;

        for import in self.imports.iter().rev() {
            if import.name != entry {
                continue;
            }

            let items = import.item.search(self.registry, query.clone());

            for item in items {
                if item.kind.universe() == Some(universe) {
                    return Some(item);
                }
            }
        }

        None
    }

    pub fn resolve_absolute_import(
        &self,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
        ResolveOptions { universe, mode }: ResolveOptions,
    ) -> Option<Item<'heap>> {
        debug_assert_eq!(mode, ResolutionMode::Absolute);

        let items = self.registry.search(query);

        items
            .into_iter()
            .find(|&item| item.kind.universe() == Some(universe))
    }

    pub fn resolve(
        &self,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
        options: ResolveOptions,
    ) -> Option<Item<'heap>> {
        match options.mode {
            ResolutionMode::Absolute => self.resolve_absolute_import(query, options),
            ResolutionMode::Relative => self.resolve_relative_import(query, options),
        }
    }

    /// Imports all standard prelude items.
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
        let mut successful = true;

        // Special Forms
        successful &= self.import_absolute_static("if", ["kernel", "special_form", "if"]);
        successful &= self.import_absolute_static("is", ["kernel", "special_form", "is"]);
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
        successful &= self.import_absolute_static("Url", ["kernel", "type", "Url"]);
        successful &= self.import_absolute_static("BaseUrl", ["kernel", "type", "BaseUrl"]);

        successful &= self.import_absolute_static("List", ["kernel", "type", "List"]);
        successful &= self.import_absolute_static("Dict", ["kernel", "type", "Dict"]);

        successful &= self.import_absolute_static("Null", ["kernel", "type", "Null"]);

        successful &= self.import_absolute_static("?", ["kernel", "type", "Unknown"]);
        successful &= self.import_absolute_static("Unknown", ["kernel", "type", "Unknown"]);

        successful &= self.import_absolute_static("!", ["kernel", "type", "Never"]);
        successful &= self.import_absolute_static("Never", ["kernel", "type", "Never"]);

        successful &= self.import_absolute_static("|", ["kernel", "type", "Union"]);
        successful &= self.import_absolute_static("Union", ["kernel", "type", "Union"]);

        successful &= self.import_absolute_static("&", ["kernel", "type", "Intersection"]);
        successful &=
            self.import_absolute_static("Intersection", ["kernel", "type", "Intersection"]);

        successful &= self.import_absolute_static("None", ["kernel", "type", "None"]);
        successful &= self.import_absolute_static("Some", ["kernel", "type", "Some"]);
        successful &= self.import_absolute_static("Option", ["kernel", "type", "Option"]);

        successful &= self.import_absolute_static("Ok", ["kernel", "type", "Ok"]);
        successful &= self.import_absolute_static("Err", ["kernel", "type", "Err"]);
        successful &= self.import_absolute_static("Result", ["kernel", "type", "Result"]);

        // Math operators
        successful &= self.import_absolute_static("+", ["math", "add"]);
        successful &= self.import_absolute_static("-", ["math", "sub"]);
        successful &= self.import_absolute_static("*", ["math", "mul"]);
        successful &= self.import_absolute_static("/", ["math", "div"]);
        successful &= self.import_absolute_static("%", ["math", "mod"]);
        successful &= self.import_absolute_static("^", ["math", "pow"]);

        // Bitwise operators
        successful &= self.import_absolute_static("&", ["math", "bit_and"]);
        successful &= self.import_absolute_static("|", ["math", "bit_or"]);
        successful &= self.import_absolute_static("~", ["math", "bit_not"]);
        successful &= self.import_absolute_static("<<", ["math", "lshift"]);
        successful &= self.import_absolute_static(">>", ["math", "rshift"]);

        // Comparison operators
        successful &= self.import_absolute_static(">", ["math", "gt"]);
        successful &= self.import_absolute_static("<", ["math", "lt"]);
        successful &= self.import_absolute_static(">=", ["math", "gte"]);
        successful &= self.import_absolute_static("<=", ["math", "lte"]);
        successful &= self.import_absolute_static("==", ["math", "eq"]);
        successful &= self.import_absolute_static("!=", ["math", "ne"]);

        // Logical operators
        successful &= self.import_absolute_static("!", ["math", "not"]);
        successful &= self.import_absolute_static("&&", ["math", "and"]);
        successful &= self.import_absolute_static("||", ["math", "or"]);

        // TODO: graph operations, these are excluded for now as we don't have them in the std

        debug_assert!(successful);
    }
}

#[cfg(test)]
mod tests {
    use super::ModuleNamespace;
    use crate::{
        heap::Heap,
        module::{
            ModuleId, ModuleRegistry, PartialModule,
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
            .resolve_relative_import(
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
            .resolve_relative_import(
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
            .resolve_absolute_import(
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
            .resolve_absolute_import(
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

        let success = namespace.import_absolute(
            heap.intern_symbol("type"),
            [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
            ImportOptions {
                glob: false,
                mode: ResolutionMode::Absolute,
            },
        );
        assert!(success);

        let item = namespace
            .resolve_relative_import(
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
            .resolve_relative_import(
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

        assert!(namespace.import_absolute(
            heap.intern_symbol("Dict"),
            [heap.intern_symbol("foo"), heap.intern_symbol("bar")],
            ImportOptions {
                glob: false,
                mode: ResolutionMode::Absolute
            }
        ));

        let import = namespace
            .resolve_relative_import(
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
        let success = namespace.import_absolute(
            heap.intern_symbol("type"),
            [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
            ImportOptions {
                glob: false,
                mode: ResolutionMode::Absolute,
            },
        );
        assert!(success);

        // import `Dict` relative from type (now that it is imported)
        let success = namespace.import_relative(
            heap.intern_symbol("Dict"),
            [heap.intern_symbol("type"), heap.intern_symbol("Dict")],
            ImportOptions {
                glob: false,
                mode: ResolutionMode::Relative,
            },
        );
        assert!(success);

        // We should be able to import `Dict` now
        let import = namespace
            .resolve_relative_import(
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
        let success = namespace.import_absolute(
            heap.intern_symbol("foo"),
            [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
            ImportOptions {
                glob: false,
                mode: ResolutionMode::Absolute,
            },
        );
        assert!(success);

        // import `Dict` relative from type (now that it is imported)
        let success = namespace.import_relative(
            heap.intern_symbol("Dict"),
            [heap.intern_symbol("foo"), heap.intern_symbol("Dict")],
            ImportOptions {
                glob: false,
                mode: ResolutionMode::Relative,
            },
        );
        assert!(success);

        // // We should be able to import `Dict` now
        // let import = namespace
        //     .resolve_relative_import(
        //         [heap.intern_symbol("Dict")],
        //         ResolveOptions {
        //             universe: Universe::Type,
        //             mode: ResolutionMode::Relative,
        //         },
        //     )
        //     .expect("import should exist");

        // assert_eq!(import.name.as_str(), "Dict");
        // assert_eq!(import.kind.universe(), Some(Universe::Type));
    }

    #[test]
    fn import_glob() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);

        // First import the type module as a module
        let success = namespace.import_absolute(
            heap.intern_symbol("*"),
            [heap.intern_symbol("kernel"), heap.intern_symbol("type")],
            ImportOptions {
                glob: true,
                mode: ResolutionMode::Absolute,
            },
        );
        assert!(success);

        // We should be able to import `Dict` now
        let import = namespace
            .resolve_relative_import(
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

        let success = namespace.import_absolute(
            heap.intern_symbol("*"),
            [heap.intern_symbol("kernel"), heap.intern_symbol("foo")],
            ImportOptions {
                glob: true,
                mode: ResolutionMode::Absolute,
            },
        );
        assert!(!success);
    }
}
