#![feature(
    iter_next_chunk,
    proc_macro_diagnostic,
    proc_macro_value,
    proc_macro_quote,
    proc_macro_def_site
)]
use proc_macro::TokenStream;

use self::symbol_table::symbol_table_impl;

mod symbol_table;

#[proc_macro]
pub fn symbol_table(input: TokenStream) -> TokenStream {
    symbol_table_impl(input)
}
