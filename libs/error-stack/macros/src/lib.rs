#![doc = include_str!("../README.md")]

use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

mod attributes;
mod context;

#[proc_macro_derive(ThinContext, attributes(display, bigerror))]
pub fn derive_thin_context(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    match context::derive(&input) {
        Ok(result) => result.into(),
        Err(e) => e.to_compile_error().into(),
    }
}

#[proc_macro_attribute]
pub fn derive_ctx(_attr: TokenStream, input: TokenStream) -> TokenStream {
    let input: proc_macro2::TokenStream = input.into();
    let output = quote! {
        #[derive(crate::ThinContext)]
        #[bigerror(crate)]
        #input
    };
    output.into()
}
