//! Namespace management for the HashQL module system.
use super::{ModuleRegistry, import::Import, item::Universe};
use crate::symbol::InternedSymbol;

/// Represents the namespace of a module.
///
/// A `ModuleNamespace` defines the collection of names that are available within a module.
#[derive(Debug, Clone)]
pub struct ModuleNamespace<'env, 'heap> {
    registry: &'env ModuleRegistry<'heap>,
    pub imports: Vec<Import<'heap>>,
}

impl<'env, 'heap> ModuleNamespace<'env, 'heap> {
    pub const fn new(registry: &'env ModuleRegistry<'heap>) -> Self {
        Self {
            registry,
            imports: Vec::new(),
        }
    }

    /// Attempts to add an absolute import.
    ///
    /// An absolute import directly references an item from the global module registry
    /// using a fully-qualified path.
    ///
    /// # Returns
    ///
    /// `bool` - `true` if the import was successful, `false` if the item wasn't found.
    pub fn import_absolute(
        &mut self,
        name: InternedSymbol<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone>,
    ) -> bool {
        let results = self.registry.search(query);
        if results.is_empty() {
            return false;
        }

        for result in results {
            self.imports.push(Import {
                name,
                item: result.id,
                universe: result.kind.universe(),
            });
        }

        true
    }

    /// Attempts to add a relative import.
    ///
    /// A relative import can be resolved either:
    /// 1. As an absolute import if it exists in the global registry
    /// 2. Relative to another import already in scope
    ///
    /// # Returns
    ///
    /// `bool` - `true` if the import was successfully resolved, `false` if the item wasn't found.
    #[expect(clippy::needless_pass_by_value)]
    pub fn import_relative(
        &mut self,
        name: InternedSymbol<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>, IntoIter: Clone> + Clone,
    ) -> bool {
        // first try to find the item as absolute import
        if self.import_absolute(name, query.clone()) {
            return true;
        }

        // next find the item as a relative import
        let mut found = None;
        for import in self.imports.iter().rev() {
            if import.universe.is_some() {
                // Only modules don't have a universe, which are the only ones nested, therefore we
                // can easily skip a lookup that isn't required.
                continue;
            }

            let item = self.registry.items[import.item].copied();

            let results = item.search(self.registry, query.clone());

            if !results.is_empty() {
                found = Some(results);
                break;
            }
        }

        let Some(found) = found else {
            return false;
        };

        for found in found {
            self.imports.push(Import {
                name,
                item: found.id,
                universe: found.kind.universe(),
            });
        }

        true
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

        self.import_absolute(name, query)
    }

    #[must_use]
    pub fn lookup_import(
        &self,
        name: InternedSymbol<'heap>,
        universe: Universe,
    ) -> Option<Import<'heap>> {
        for import in self.imports.iter().rev() {
            if Some(universe) != import.universe {
                continue;
            }

            if import.name == name {
                return Some(*import);
            }
        }

        None
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
            Module, ModuleRegistry,
            item::{IntrinsicItem, Item, ItemKind, Universe},
        },
        span::SpanId,
        r#type::environment::Environment,
    };

    #[test]
    fn lookup_prelude_value() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let import = namespace
            .lookup_import(heap.intern_symbol("Union"), Universe::Value)
            .expect("import should exist");

        assert_eq!(import.name.as_str(), "Union");
        assert_eq!(import.universe, Some(Universe::Value));

        let item = registry.items[import.item].copied();
        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Union",
                universe: Universe::Value
            })
        );
    }

    #[test]
    fn lookup_prelude_type() {
        let heap = Heap::new();
        let environment = Environment::new(SpanId::SYNTHETIC, &heap);
        let registry = ModuleRegistry::new(&environment);

        let mut namespace = ModuleNamespace::new(&registry);
        namespace.import_prelude();

        let import = namespace
            .lookup_import(heap.intern_symbol("Dict"), Universe::Type)
            .expect("import should exist");

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.universe, Some(Universe::Type));

        let item = registry.items[import.item].copied();
        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Dict",
                universe: Universe::Type
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

        let module = registry.alloc_module(|id| Module {
            id,
            items: registry.alloc_items(&[registry.alloc_item(|item_id| Item {
                id: item_id,
                parent: Some(id),
                name: heap.intern_symbol("bar"),
                kind: ItemKind::Intrinsic(IntrinsicItem {
                    name: "::foo::bar",
                    universe: Universe::Type,
                }),
            })]),
        });
        registry.register(heap.intern_symbol("foo"), module);

        let import = namespace
            .lookup_import(heap.intern_symbol("Dict"), Universe::Type)
            .expect("import should exist");

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.universe, Some(Universe::Type));

        let item = registry.items[import.item].copied();
        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::kernel::type::Dict",
                universe: Universe::Type
            })
        );

        assert!(namespace.import_absolute(
            heap.intern_symbol("Dict"),
            [heap.intern_symbol("foo"), heap.intern_symbol("bar")]
        ));

        let import = namespace
            .lookup_import(heap.intern_symbol("Dict"), Universe::Type)
            .expect("import should exist");

        assert_eq!(import.name.as_str(), "Dict");
        assert_eq!(import.universe, Some(Universe::Type));

        let item = registry.items[import.item].copied();
        assert_eq!(
            item.kind,
            ItemKind::Intrinsic(IntrinsicItem {
                name: "::foo::bar",
                universe: Universe::Type
            })
        );
    }
}
