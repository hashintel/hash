use proc_macro2::TokenStream;
use quote::quote;
use syn::{Data, DeriveInput, Error, Fields};

use crate::attributes::Attributes;

pub(crate) fn derive(input: &DeriveInput) -> Result<TokenStream, Error> {
    let ctx = &input.ident;
    let attributes = Attributes::parse(input)?;
    match &input.data {
        Data::Struct(data_struct) => {
            if !matches!(data_struct.fields, Fields::Unit) {
                return Err(Error::new_spanned(
                    &input.ident,
                    "struct must be a zero-sized-type to implement `ThinContext`",
                ));
            }
        }
        Data::Enum(_) => {
            return Err(Error::new_spanned(
                &input.ident,
                "enum `ThinContext` derives are currently unsupported",
            ));
        }
        Data::Union(_) => {
            return Err(Error::new_spanned(
                &input.ident,
                "union `ThinContext` derives are currently unsupported",
            ));
        }
    }

    let error_stack = attributes.crate_path;
    Ok(quote! {

        impl std::error::Error for #ctx {}
        impl ::core::fmt::Debug for #ctx {
            fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
                f.write_str(stringify!(#ctx))
            }
        }
        impl ::core::fmt::Display for #ctx {
            fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
                f.write_str(stringify!(#ctx))
            }
        }
        impl #error_stack::context::ThinContext for #ctx {
            const VALUE: Self = #ctx;
        }
    })
}
