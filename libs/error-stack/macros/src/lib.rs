#![doc = include_str!("../README.md")]

use proc_macro::TokenStream;
use syn::{parse_macro_input, DeriveInput};

mod attributes;
mod context;

#[proc_macro_derive(ThinContext, attributes(display, error_stack))]
pub fn derive_thin_context(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    match context::derive(&input) {
        Ok(result) => result.into(),
        Err(e) => e.to_compile_error().into(),
    }
}
