use super::{
    ModuleRegistry,
    item::{ItemId, Universe},
};
use crate::symbol::InternedSymbol;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Import<'heap> {
    pub name: InternedSymbol<'heap>,

    pub item: ItemId,
    pub universe: Option<Universe>,
}

#[derive(Debug, Clone)]
pub struct ImportMap<'env, 'heap> {
    registry: &'env ModuleRegistry<'heap>,
    pub imports: Vec<Import<'heap>>,
}

impl<'env, 'heap> ImportMap<'env, 'heap> {
    pub const fn new(registry: &'env ModuleRegistry<'heap>) -> Self {
        Self {
            registry,
            imports: Vec::new(),
        }
    }

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
        for import in &self.imports {
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
