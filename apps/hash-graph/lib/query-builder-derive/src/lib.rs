use darling::FromDeriveInput;
use proc_macro::TokenStream;
use quote::ToTokens;
use syn::{parse_macro_input, DeriveInput};

use crate::input::QueryBuilderInput;

// Derive macro that implements a query-builder and automatic deserialize implementation
mod input;
mod render;
mod parse;

#[proc_macro_derive(QueryBuilder, attributes(builder))]
pub fn derive_query_builder(stream: TokenStream) -> TokenStream {
    let input = parse_macro_input!(stream as DeriveInput);
    QueryBuilderInput::from_derive_input();

    input.to_tokens()
}

#[cfg(test)]
mod tests {
    #[test]
    fn ui() {
        let t = trybuild::TestCases::new();
        t.compile_fail("tests/ui/fail/*rs");
        t.pass("tests/ui/pass/*rs");
    }
}
