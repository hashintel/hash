use alloc::{collections::BTreeSet, vec::Vec};
use core::hash::{BuildHasher as _, Hasher as _};

use foldhash::fast::FixedState;
use proc_macro2::{Ident, Span, TokenStream};
use quote::{quote, quote_spanned};
use unsynn::{ToTokenIter as _, ToTokens as _};

use self::grammar::{SymbolEntry, SymbolModule};
use crate::emit_error;

mod grammar {
    #![expect(clippy::result_large_err)]
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

const SEED_STRIDE: u64 = 0x9E37_79B9_7F4A_7C15;

/// Hashes `bytes` with `seed` via `foldhash::fast::FixedState`.
///
/// Must match `hashql_core::symbol::table::hash_symbol_bytes`.
fn hash_symbol_bytes(bytes: &[u8], seed: u64) -> u64 {
    let mut hasher = FixedState::with_seed(seed).build_hasher();
    hasher.write(bytes);
    hasher.finish()
}

struct StaticTable {
    seed: u64,
    bucket_mask: usize,
    tags: Vec<u64>,
    indices: Vec<[u16; 4]>,
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "hash bits and verified u16 symbol indices intentionally truncate"
)]
fn try_pack_buckets(
    symbols: &[(String, Span)],
    num_buckets: usize,
    seed: u64,
) -> Option<StaticTable> {
    let bucket_mask = num_buckets - 1;
    let mut counts = vec![0_usize; num_buckets];
    let mut tags = vec![0_u64; num_buckets];
    let mut indices = vec![[0_u16; 4]; num_buckets];

    for (symbol_index, (symbol_text, _)) in symbols.iter().enumerate() {
        let hash = hash_symbol_bytes(symbol_text.as_bytes(), seed);

        let bucket = (hash as usize) & bucket_mask;
        let lane = counts[bucket];
        if lane >= 4 {
            return None;
        }

        let tag16 = ((hash >> 48) as u16) | 1;
        let existing_tags = tags[bucket];

        for previous in 0..lane {
            if ((existing_tags >> (previous * 16)) as u16) == tag16 {
                return None;
            }
        }

        tags[bucket] = existing_tags | (u64::from(tag16) << (lane * 16));
        indices[bucket][lane] = symbol_index as u16;
        counts[bucket] = lane + 1;
    }

    Some(StaticTable {
        seed,
        bucket_mask,
        tags,
        indices,
    })
}

fn build_static_table(symbols: &[(String, Span)]) -> Result<StaticTable, (Span, String)> {
    if u16::try_from(symbols.len()).is_err() {
        return Err((
            Span::call_site(),
            String::from("define_symbols! supports at most 65535 constant symbols"),
        ));
    }

    let mut visited = BTreeSet::new();
    for (symbol_text, span) in symbols {
        if !visited.insert(symbol_text.as_str()) {
            return Err((*span, format!("duplicate symbol value `{symbol_text}`")));
        }
    }

    let mut num_buckets = (symbols.len() >> 1).max(16).next_power_of_two();
    loop {
        for attempt in 0_u64..8192 {
            let seed = attempt.wrapping_add(1).wrapping_mul(SEED_STRIDE);
            if let Some(table) = try_pack_buckets(symbols, num_buckets, seed) {
                return Ok(table);
            }
        }

        num_buckets *= 2;
    }
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

#[expect(clippy::result_large_err)]
fn parse(item: TokenStream) -> Result<Vec<SymbolEntry>, unsynn::Error> {
    let mut tokens = item.to_token_iter();

    let parsed: SymbolModule = unsynn::Parse::parse_all(&mut tokens)?;

    Ok(parsed.0.into())
}

/// Returns the string content of an identifier, stripping any `r#` raw prefix.
#[expect(clippy::option_if_let_else)]
fn ident_string_value(ident: &Ident) -> String {
    let raw = ident.to_string();

    match raw.strip_prefix("r#") {
        Some(stripped) => stripped.to_owned(),
        None => raw,
    }
}

fn generate(entries: &[SymbolEntry]) -> TokenStream {
    let mut output = TokenStream::new();

    // 1. SYMBOLS array
    let mut symbol_values = Vec::new();
    let mut symbol_strings = Vec::new();
    for entry in entries {
        collect_symbol_values(entry, &mut symbol_values, &mut symbol_strings);
    }

    let num_symbols = symbol_values.len();
    output.extend(quote! {
        pub(crate) static SYMBOLS: [&str; #num_symbols] = [
            #(#symbol_values),*
        ];
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
        // Used by `symbol::table::tests` to verify static constant lookup.
        #[cfg(test)]
        pub(crate) static LOOKUP: &[(&'static str, super::repr::Repr)] = &[
            #(#lookup_entries),*
        ];
    });

    // 4. Compile-time 4-way SWAR static lookup table (zero runtime priming)
    let StaticTable {
        seed,
        bucket_mask,
        tags,
        indices,
    } = match build_static_table(&symbol_strings) {
        Ok(table) => table,
        Err((span, message)) => {
            emit_error(span.unwrap(), message);
            return TokenStream::new();
        }
    };

    let num_buckets = tags.len();
    let index_rows = indices
        .iter()
        .map(|[lane0, lane1, lane2, lane3]| quote!([#lane0, #lane1, #lane2, #lane3]));

    output.extend(quote! {
        pub(crate) const STATIC_SEED: u64 = #seed;
        pub(crate) const STATIC_BUCKET_MASK: usize = #bucket_mask;
        pub(crate) static STATIC_TAGS: [u64; #num_buckets] = [
            #(#tags),*
        ];
        pub(crate) static STATIC_INDICES: [[u16; 4]; #num_buckets] = [
            #(#index_rows),*
        ];
    });

    output
}

fn collect_symbol_values(
    entry: &SymbolEntry,
    values: &mut Vec<TokenStream>,
    strings: &mut Vec<(String, Span)>,
) {
    match entry {
        SymbolEntry::Module { entries, .. } => {
            for inner in &*entries.content.0 {
                collect_symbol_values(&inner.value, values, strings);
            }
        }
        SymbolEntry::Explicit { name, value, .. } => {
            strings.push((value.as_str().to_owned(), name.span()));
            values.push(value.to_token_stream());
        }
        SymbolEntry::Implicit(name) => {
            let string_value = ident_string_value(name);
            strings.push((string_value.clone(), name.span()));
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

fn generate_lookup_entry<'a>(
    entry: &'a SymbolEntry,
    module_path: &mut Vec<&'a Ident>,
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

fn build_path(module_path: &[&Ident], name: &Ident) -> TokenStream {
    quote_spanned!(name.span() => self #(:: #module_path)* :: #name)
}
