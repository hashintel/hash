#![expect(
    unreachable_pub,
    reason = "This is a proc but as we want to document this crate as well this should be a \
              warning instead"
)]

/// Derive macro that implements a query-builder and automatic deserialize implementation
use proc_macro::TokenStream;

use crate::parse::parse;

mod input;
mod parse;
mod render;

#[proc_macro_derive(QueryBuilder, attributes(builder))]
pub fn derive_query_builder(stream: TokenStream) -> TokenStream {
    parse(stream).unwrap_or_else(virtue::Error::into_token_stream)
}

#[cfg(test)]
mod tests {
    #[test]
    fn ui() {
        let test_cases = trybuild::TestCases::new();
        test_cases.compile_fail("tests/ui/fail/*rs");
        test_cases.pass("tests/ui/pass/*rs");
    }
}
