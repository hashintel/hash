use alloc::vec::Vec;

use proc_macro2::{Ident, TokenStream};
use quote::{quote, quote_spanned};
use unsynn::{ToTokenIter as _, ToTokens as _};

use self::grammar::{SymbolEntry, SymbolModule};
use crate::emit_error;

/// Returns the string content of an identifier, stripping any `r#` raw prefix.
#[expect(clippy::option_if_let_else)]
fn ident_string_value(ident: &Ident) -> String {
    let raw = ident.to_string();

    match raw.strip_prefix("r#") {
        Some(stripped) => stripped.to_owned(),
        None => raw,
    }
}

fn collect_symbol_values(entry: &SymbolEntry, values: &mut Vec<TokenStream>) {
    match entry {
        SymbolEntry::Module { entries, .. } => {
            for inner in &*entries.content.0 {
                collect_symbol_values(&inner.value, values);
            }
        }
        SymbolEntry::Explicit { value, .. } => {
            values.push(value.to_token_stream());
        }
        SymbolEntry::Implicit(name) => {
            let string_value = ident_string_value(name);
            values.push(quote!(#string_value));
        }
    }
}

fn generate_entry_constants(entry: &SymbolEntry, counter: &mut usize, output: &mut TokenStream) {
    match entry {
        SymbolEntry::Module { name, entries, .. } => {
            let mut inner_output = TokenStream::new();

            for inner in &*entries.content.0 {
                generate_entry_constants(&inner.value, counter, &mut inner_output);
            }

            output.extend(quote_spanned! { name.span() =>
                pub mod #name {
                    use crate::symbol::{Symbol, sym::SYMBOLS};

                    #inner_output
                }
            });
        }
        SymbolEntry::Explicit { name, value, .. } => {
            let doc = format!("The symbol `{}`", value.as_str());
            let value_tokens = value.to_token_stream();

            output.extend(quote_spanned! {name.span() =>
                const _: () = { assert!(SYMBOLS[#counter] == #value_tokens) };
                #[doc = #doc]
                pub const #name: Symbol<'static> = Symbol::from_constant(#name::CONST);
                pub mod #name {
                    use crate::symbol::ConstantSymbol;

                    pub const CONST: ConstantSymbol = ConstantSymbol::new_unchecked(#counter);
                }
            });
            *counter += 1;
        }
        SymbolEntry::Implicit(name) => {
            let string_value = ident_string_value(name);
            let doc = format!("The symbol `{string_value}`");

            output.extend(quote_spanned! {name.span() =>
                const _: () = { assert!(SYMBOLS[#counter] == #string_value) };
                #[doc = #doc]
                pub const #name: Symbol<'static> = Symbol::from_constant(#name::CONST);
                pub mod #name {
                    use crate::symbol::ConstantSymbol;

                    pub const CONST: ConstantSymbol = ConstantSymbol::new_unchecked(#counter);
                }
            });
            *counter += 1;
        }
    }
}

fn build_path(module_path: &[&Ident], name: &Ident) -> TokenStream {
    quote_spanned!(name.span() => self #(:: #module_path)* :: #name)
}

fn generate_lookup_entry<'entry>(
    entry: &'entry SymbolEntry,
    module_path: &mut Vec<&'entry Ident>,
    lookup: &mut Vec<TokenStream>,
) {
    match entry {
        SymbolEntry::Module { name, entries, .. } => {
            module_path.push(name);
            for inner in &*entries.content.0 {
                generate_lookup_entry(&inner.value, module_path, lookup);
            }
            module_path.pop();
        }
        SymbolEntry::Explicit { name, value, .. } => {
            let path = build_path(module_path, name);
            let value_tokens = value.to_token_stream();
            lookup.push(quote_spanned!(name.span() => (#value_tokens, #path.into_repr())));
        }
        SymbolEntry::Implicit(name) => {
            let path = build_path(module_path, name);
            let string_value = ident_string_value(name);
            lookup.push(quote_spanned!(name.span() => (#string_value, #path.into_repr())));
        }
    }
}

#[expect(
    clippy::result_large_err,
    reason = "macro parsing returns unsynn::Error directly"
)]
fn parse(item: TokenStream) -> Result<Vec<SymbolEntry>, unsynn::Error> {
    let mut tokens = item.to_token_iter();

    let parsed: SymbolModule = unsynn::Parse::parse_all(&mut tokens)?;

    Ok(parsed.0.into())
}

fn generate(entries: &[SymbolEntry]) -> TokenStream {
    let mut output = TokenStream::new();

    // 1. SYMBOLS array and compile-time uniqueness check over rustc-decoded string values
    let mut symbol_values = Vec::new();
    for entry in entries {
        collect_symbol_values(entry, &mut symbol_values);
    }

    let num_symbols = symbol_values.len();
    output.extend(quote! {
        pub(crate) static SYMBOLS: [&str; #num_symbols] = [
            #(#symbol_values),*
        ];

        const _: () = {
            let mut __first = 0;
            while __first + 1 < SYMBOLS.len() {
                let mut __second = __first + 1;
                while __second < SYMBOLS.len() {
                    assert!(
                        !SYMBOLS[__first].as_bytes().eq(SYMBOLS[__second].as_bytes()),
                        "duplicate symbol value in define_symbols!"
                    );
                    __second += 1;
                }
                __first += 1;
            }
        };
    });

    // 2. Constants and modules
    let mut counter = 0;
    for entry in entries {
        generate_entry_constants(entry, &mut counter, &mut output);
    }

    // 3. LOOKUP (used only by tests to verify every predefined symbol resolves statically)
    let mut lookup_entries = Vec::new();
    let mut module_path = Vec::new();
    for entry in entries {
        generate_lookup_entry(entry, &mut module_path, &mut lookup_entries);
    }

    output.extend(quote! {
        #[cfg(test)]
        pub(crate) static LOOKUP: &[(&'static str, super::repr::Repr)] = &[
            #(#lookup_entries),*
        ];
    });

    output
}

pub(crate) fn expand(item: TokenStream) -> TokenStream {
    let entries = match parse(item) {
        Ok(entries) => entries,
        Err(error) => {
            if let Some(token) = error.failed_at() {
                emit_error(token.span().unwrap(), error);

                return TokenStream::new();
            }

            let message = error.to_string();
            return quote!(compile_error!(#message));
        }
    };

    generate(&entries)
}

mod grammar {
    #![expect(
        clippy::result_large_err,
        reason = "unsynn::Parser returns unsynn::Error directly"
    )]
    use unsynn::{BraceGroupContaining, Colon, CommaDelimitedVec, Ident, LiteralString, unsynn};

    unsynn! {
        pub(super) struct SymbolModule(pub CommaDelimitedVec<SymbolEntry>);

        pub(super) enum SymbolEntry {
            Module {
                name: Ident,
                _colon: Colon,
                entries: BraceGroupContaining<SymbolModule>
            },
            Explicit {
                name: Ident,
                _colon: Colon,
                value: LiteralString
            },
            Implicit(Ident)
        }
    }
}
