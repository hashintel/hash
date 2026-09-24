use quote::quote;

use super::{grammar::Parsed, parse};

#[test]
fn parameters_plain() {
    for (input, expected) in [
        (quote!(struct Index(u32)), 0),
        (quote!(pub(crate) struct Index<T>(u32)), 1),
        (quote!(struct Index<T, U>(u32 is 1..=9)), 2),
        (quote!(struct Index<T,>(u32)), 1),
    ] {
        let Parsed::Struct(parsed) = parse(input).expect("valid struct syntax") else {
            panic!("expected a struct");
        };
        assert_eq!(
            parsed
                .parameters
                .map_or(0, |parameters| parameters.names.len()),
            expected
        );
    }
}

#[test]
fn parameters_unsupported() {
    for input in [
        quote!(struct Index<>(u32)),
        quote!(struct Index<T: Copy>(u32)),
        quote!(struct Index<T = ()>(u32)),
        quote!(struct Index<'domain>(u32)),
        quote!(struct Index<const N: usize>(u32)),
        quote!(struct Index<T> where T: Copy (u32)),
        quote!(struct Index<T>(u32) where T: Copy),
        quote!(struct Index<T U>(u32)),
    ] {
        let _error = parse(input)
            .map(|_| ())
            .expect_err("unsupported parameter syntax");
    }
}
