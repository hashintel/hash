//! Namespace management for the HashQL module system.
use super::{ModuleRegistry, import::Import};
use crate::symbol::InternedSymbol;

/// Represents a lexical scope in HashQL.
///
/// A `Namespace` defines the collection of names that are available within a module.
#[derive(Debug, Clone)]
pub struct Namespace<'env, 'heap> {
    registry: &'env ModuleRegistry<'heap>,
    pub imports: Vec<Import<'heap>>,
}

impl<'env, 'heap> Namespace<'env, 'heap> {
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
    pub fn absolute_import(
        &mut self,
        name: InternedSymbol<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>>,
    ) -> bool {
        let Some(item) = self.registry.search(query) else {
            return false;
        };

        self.imports.push(Import {
            name,
            item: item.id,
            universe: item.kind.universe(),
        });

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
    pub fn relative_import(
        &mut self,
        name: InternedSymbol<'heap>,
        query: impl IntoIterator<Item = InternedSymbol<'heap>> + Clone,
    ) -> bool {
        // first try to find the item as absolute import
        if self.absolute_import(name, query.clone()) {
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

            if let Some(item) = item.search(self.registry, query.clone()) {
                found = Some(item);
                break;
            }
        }

        let Some(found) = found else {
            return false;
        };

        self.imports.push(Import {
            name,
            item: found.id,
            universe: found.kind.universe(),
        });

        true
    }

    fn absolute_import_static(
        &mut self,
        name: &'static str,
        query: impl IntoIterator<Item = &'static str>,
    ) -> bool {
        let name = self.registry.heap.intern_symbol(name);
        let query = query
            .into_iter()
            .map(|symbol| self.registry.heap.intern_symbol(symbol));

        self.absolute_import(name, query)
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
    pub fn prelude(&mut self) {
        let mut successful = true;

        // Special Forms
        successful &= self.absolute_import_static("if", ["kernel", "special_form", "if"]);
        successful &= self.absolute_import_static("is", ["kernel", "special_form", "is"]);
        successful &= self.absolute_import_static("let", ["kernel", "special_form", "let"]);
        successful &= self.absolute_import_static("type", ["kernel", "special_form", "type"]);
        successful &= self.absolute_import_static("newtype", ["kernel", "special_form", "newtype"]);
        successful &= self.absolute_import_static("use", ["kernel", "special_form", "use"]);
        successful &= self.absolute_import_static("fn", ["kernel", "special_form", "fn"]);
        successful &= self.absolute_import_static("input", ["kernel", "special_form", "input"]);

        successful &= self.absolute_import_static(".", ["kernel", "special_form", "access"]);
        successful &= self.absolute_import_static("access", ["kernel", "special_form", "access"]);

        successful &= self.absolute_import_static("[]", ["kernel", "special_form", "index"]);
        successful &= self.absolute_import_static("index", ["kernel", "special_form", "index"]);

        // Type definitions
        successful &= self.absolute_import_static("Boolean", ["kernel", "type", "Boolean"]);

        successful &= self.absolute_import_static("Number", ["kernel", "type", "Number"]);
        successful &= self.absolute_import_static("Integer", ["kernel", "type", "Integer"]);

        successful &= self.absolute_import_static("String", ["kernel", "type", "String"]);
        successful &= self.absolute_import_static("Url", ["kernel", "type", "Url"]);
        successful &= self.absolute_import_static("BaseUrl", ["kernel", "type", "BaseUrl"]);

        successful &= self.absolute_import_static("List", ["kernel", "type", "List"]);
        successful &= self.absolute_import_static("Dict", ["kernel", "type", "Dict"]);

        successful &= self.absolute_import_static("Null", ["kernel", "type", "Null"]);

        successful &= self.absolute_import_static("?", ["kernel", "type", "Unknown"]);
        successful &= self.absolute_import_static("Unknown", ["kernel", "type", "Unknown"]);

        successful &= self.absolute_import_static("!", ["kernel", "type", "Never"]);
        successful &= self.absolute_import_static("Never", ["kernel", "type", "Never"]);

        successful &= self.absolute_import_static("|", ["kernel", "type", "Union"]);
        successful &= self.absolute_import_static("Union", ["kernel", "type", "Union"]);

        successful &= self.absolute_import_static("&", ["kernel", "type", "Intersection"]);
        successful &=
            self.absolute_import_static("Intersection", ["kernel", "type", "Intersection"]);

        successful &= self.absolute_import_static("None", ["kernel", "type", "None"]);
        successful &= self.absolute_import_static("Some", ["kernel", "type", "Some"]);
        successful &= self.absolute_import_static("Option", ["kernel", "type", "Option"]);

        successful &= self.absolute_import_static("Ok", ["kernel", "type", "Ok"]);
        successful &= self.absolute_import_static("Err", ["kernel", "type", "Err"]);
        successful &= self.absolute_import_static("Result", ["kernel", "type", "Result"]);

        // Math operators
        successful &= self.absolute_import_static("+", ["math", "add"]);
        successful &= self.absolute_import_static("-", ["math", "sub"]);
        successful &= self.absolute_import_static("*", ["math", "mul"]);
        successful &= self.absolute_import_static("/", ["math", "div"]);
        successful &= self.absolute_import_static("%", ["math", "mod"]);
        successful &= self.absolute_import_static("^", ["math", "pow"]);

        // Bitwise operators
        successful &= self.absolute_import_static("&", ["math", "bit_and"]);
        successful &= self.absolute_import_static("|", ["math", "bit_or"]);
        successful &= self.absolute_import_static("~", ["math", "bit_not"]);
        successful &= self.absolute_import_static("<<", ["math", "lshift"]);
        successful &= self.absolute_import_static(">>", ["math", "rshift"]);

        // Comparison operators
        successful &= self.absolute_import_static(">", ["math", "gt"]);
        successful &= self.absolute_import_static("<", ["math", "lt"]);
        successful &= self.absolute_import_static(">=", ["math", "gte"]);
        successful &= self.absolute_import_static("<=", ["math", "lte"]);
        successful &= self.absolute_import_static("==", ["math", "eq"]);
        successful &= self.absolute_import_static("!=", ["math", "ne"]);

        // Logical operators
        successful &= self.absolute_import_static("!", ["math", "not"]);
        successful &= self.absolute_import_static("&&", ["math", "and"]);
        successful &= self.absolute_import_static("||", ["math", "or"]);

        debug_assert!(successful);
    }
}
