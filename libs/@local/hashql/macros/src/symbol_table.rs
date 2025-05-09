use core::{iter::Peekable, str::FromStr as _};

use proc_macro::{
    Delimiter, Group, Ident, Literal, Span, TokenStream, TokenTree, quote, token_stream::IntoIter,
};

struct CategoryIter(Peekable<IntoIter>);

impl Iterator for CategoryIter {
    type Item = Option<(Ident, Group)>;

    fn next(&mut self) -> Option<Self::Item> {
        // Trailing `,`
        let _: Option<_> = self
            .0
            .next_if(|tree| matches!(tree, TokenTree::Punct(punct) if punct.as_char() == ','));

        // Categories have the form `category: { ..items }`
        let output = match self.0.next_chunk::<3>() {
            Ok([category, colon, items]) => {
                let category = if let TokenTree::Ident(ident) = category {
                    Some(ident)
                } else {
                    category
                        .span()
                        .error("Expected an identifier for category")
                        .emit();

                    None
                };

                if !matches!(&colon, TokenTree::Punct(punct) if punct.as_char() == ':') {
                    colon.span().error("Expected a colon").emit();
                }

                let items_span = items.span();
                let items = if let TokenTree::Group(group) = items
                    && group.delimiter() == Delimiter::Brace
                {
                    Some(group)
                } else {
                    items_span
                        .error("Expected a brace-delimited list of items")
                        .emit();

                    None
                };

                let Some((category, items)) = Option::zip(category, items) else {
                    return Some(None);
                };

                (category, items)
            }
            Err(mut iterator) => {
                match iterator.len() {
                    // empty, nothing is missing
                    0 => {}
                    1 => {
                        // `: items` is missing
                        iterator
                            .next()
                            .unwrap_or_else(|| unreachable!())
                            .span()
                            .error("Expected a colon after category")
                            .emit();
                    }
                    2 => {
                        // `items` is missing
                        let _: Option<_> = iterator.next();

                        iterator
                            .next()
                            .unwrap_or_else(|| unreachable!())
                            .span()
                            .error("Expected a brace-delimited list of items after colon")
                            .emit();
                    }
                    _ => unreachable!(),
                }

                return None;
            }
        };

        Some(Some(output))
    }
}

struct ItemsIterator(Peekable<IntoIter>);

impl Iterator for ItemsIterator {
    type Item = Option<(Ident, (Span, String))>;

    fn next(&mut self) -> Option<Self::Item> {
        // Trailing `,`
        let _: Option<_> = self
            .0
            .next_if(|tree| matches!(tree, TokenTree::Punct(punct) if punct.as_char() == ','));

        // Items have the form `name $(: $value:literal)?`
        let name = self.0.next()?;

        let TokenTree::Ident(name) = name else {
            name.span().error("Expected an identifier").emit();
            return Some(None);
        };

        let colon = self
            .0
            .next_if(|tree| matches!(tree, TokenTree::Punct(punct) if punct.as_char() == ':'));

        let value = if let Some(colon) = colon {
            let Some(value) = self.0.next() else {
                colon.span().error("Expected a value after colon").emit();
                return Some(None);
            };

            if let TokenTree::Literal(literal) = value {
                let Ok(value) = literal.str_value() else {
                    literal.span().error("Expected a string value").emit();
                    return Some(None);
                };

                (literal.span(), value)
            } else {
                value
                    .span()
                    .error("Expected a string literal value after colon")
                    .emit();

                return Some(None);
            }
        } else {
            let name_span = name.span();
            let name = name.to_string();

            // The value is the identifier
            let name = name
                .strip_prefix("r#")
                .map_or_else(|| name.clone(), ToOwned::to_owned);

            (name_span, name)
        };

        Some(Some((name, value)))
    }
}

// A symbol table has the following format:
// $(category: { item })*,
pub(crate) fn symbol_table_impl(input: TokenStream) -> TokenStream {
    // We need to create these separately to escape macro-hygiene
    let tables_const = Ident::new("TABLES", Span::call_site());
    let krate = Ident::new("crate", Span::call_site());
    let new_unchecked_ident = Ident::new("new_unchecked", Span::call_site());
    let t_ident = Ident::new("T", Span::call_site());

    let mut lookup = Vec::new();
    let mut modules = Vec::new();

    let categories = CategoryIter(input.into_iter().peekable());

    for category in categories {
        // This is none in the case that the value is malformed, but still have enough items
        let Some((category, items)) = category else {
            continue;
        };

        let mut module_items = Vec::new();

        let items = ItemsIterator(items.stream().into_iter().peekable());
        for item in items {
            // This is none in the case that the value is malformed, but still have enough items
            let Some((name, value)) = item else {
                continue;
            };

            lookup.push((category.clone(), name.clone(), value.1.clone()));
            module_items.push((name, value));
        }

        modules.push((category, module_items));
    }

    let mut output = TokenStream::new();

    // Create a new module structure which is:
    // `mod name` where we have items that look like this:
    // `static __NAME: &str = <value>;`
    // `pub const NAME: InternedSymbol<'static> = InternedSymbol::new_unchecked(__NAME)`

    // Additionally we then create one table with *all* the items and a lookup macro
    for (module, items) in modules {
        let mut module_contents = TokenStream::new();
        let mut macro_arms = TokenStream::new();

        for (name, (value_span, value)) in items {
            let mut value = Literal::string(&value);
            value.set_span(value_span);

            module_contents.extend(quote!(
                pub static $name: $krate::symbol::Symbol<'static> = $krate::symbol::Symbol::$new_unchecked_ident($value);
            ));

            macro_arms.extend(quote!(
                ($name) => { $$crate::symbol::sym::$module::$name };
            ));
        }

        output.extend(quote!(
            pub mod $module {
                $module_contents

                #[macro_export]
                macro_rules! $module {
                    $macro_arms
                }

                pub use $module;
            }
        ));
    }

    let mut lookup_table_contents = TokenStream::new();
    for (module, name, _) in &lookup {
        lookup_table_contents.extend(quote!(
            &$module::$name,
        ));
    }
    output.extend(quote!(
        pub static $tables_const: &[&$krate::symbol::Symbol<'static>] = &[
            $lookup_table_contents
        ];
    ));

    let mut match_arms = TokenStream::new();
    for (module, name, value) in lookup {
        // First we try to take the value and convert it into a TokenStream (e.g. parse it), this is
        // in addition to the macro rules of the different modules
        if let Ok(stream) = TokenStream::from_str(&value) {
            match_arms.extend(quote!(
                ($stream) => { $$crate::symbol::sym::$module::$name };
            ));
        } else {
            name.span()
                .warning(
                    "Unable to convert the value into a rust stream and won't therefore be able \
                     to add it to the match arms",
                )
                .emit();
        }
    }

    // Now the "meat" of the thing, we now create a proc-macro that takes the input and generates a
    // lookup table
    output.extend(quote!(
        #[macro_export]
        macro_rules! $t_ident {
            $match_arms

            ($$($$value:tt),+) => { [$$($t_ident![$$value]),+] };
        }

        pub use $t_ident;
    ));

    output
}
