use proc_macro2::TokenStream;
use quote::quote;

use super::Definition;
use crate::id::attr::DisplayAttribute;

pub(super) fn scalar(
    definition @ Definition {
        name,
        generics,
        attributes,
        storage,
        ..
    }: &Definition,
) -> TokenStream {
    if generics.is_empty() {
        return TokenStream::new();
    }

    let konst = &attributes.r#const;
    let parameters = generics.parameters();
    let value = definition.value();
    let other = storage.read(quote!(other._internal_do_not_use));
    let hasher = generics.fresh_ident("__HashqlHasher");

    // Standard derives bind every type parameter, including non-owning phantom parameters.
    quote! {
        #[automatically_derived]
        impl #parameters ::core::marker::Copy for #name #generics {}

        #[automatically_derived]
        impl #parameters ::core::clone::Clone for #name #generics {
            #[inline]
            fn clone(&self) -> Self { *self }
        }

        #[automatically_derived]
        #konst impl #parameters ::core::cmp::PartialEq for #name #generics {
            #[inline]
            fn eq(&self, other: &Self) -> bool { #value == #other }
        }

        #[automatically_derived]
        #konst impl #parameters ::core::cmp::Eq for #name #generics {}

        #[automatically_derived]
        #konst impl #parameters ::core::cmp::PartialOrd for #name #generics {
            #[inline]
            fn partial_cmp(&self, other: &Self) -> ::core::option::Option<::core::cmp::Ordering> {
                ::core::option::Option::Some(::core::cmp::Ord::cmp(self, other))
            }
        }

        #[automatically_derived]
        #konst impl #parameters ::core::cmp::Ord for #name #generics {
            #[inline]
            fn cmp(&self, other: &Self) -> ::core::cmp::Ordering {
                ::core::cmp::Ord::cmp(&#value, &#other)
            }
        }

        #[automatically_derived]
        impl #parameters ::core::hash::Hash for #name #generics {
            fn hash<#hasher: ::core::hash::Hasher>(&self, state: &mut #hasher) {
                ::core::hash::Hash::hash(&#value, state);
            }
        }
    }
}

pub(super) fn formatting(
    definition @ Definition {
        name,
        generics,
        attributes,
        ..
    }: &Definition,
) -> TokenStream {
    let value = definition.value();
    let parameters = generics.parameters();

    let mut output = quote! {
        impl #parameters ::core::fmt::Debug for #name #generics {
            fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                fmt.debug_tuple(stringify!(#name)).field(&#value).finish()
            }
        }
    };

    let display = match &attributes.display {
        DisplayAttribute::None => return output,
        DisplayAttribute::Format(format) => quote!(fmt.write_fmt(format_args!(#format, #value))),
        DisplayAttribute::Auto => quote!(::core::fmt::Display::fmt(&#value, fmt)),
    };

    output.extend(quote! {
        #[automatically_derived]
        impl #parameters ::core::fmt::Display for #name #generics {
            fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                #display
            }
        }
    });
    output
}

pub(super) fn step(
    Definition {
        name,
        generics,
        attributes,
        ..
    }: &Definition,
) -> TokenStream {
    let krate = &attributes.krate;
    let parameters = generics.static_parameters();

    quote! {
        #[automatically_derived]
        impl #parameters ::core::iter::Step for #name #generics {
            #[inline]
            fn steps_between(start: &Self, end: &Self) -> (usize, ::core::option::Option<usize>) {
                <usize as ::core::iter::Step>::steps_between(
                    &#krate::id::Id::as_usize(*start),
                    &#krate::id::Id::as_usize(*end),
                )
            }

            #[inline]
            fn forward_checked(start: Self, count: usize) -> ::core::option::Option<Self> {
                #krate::id::Id::as_usize(start)
                    .checked_add(count)
                    .and_then(|value| Self::try_from(value).ok())
            }

            #[inline]
            fn backward_checked(start: Self, count: usize) -> ::core::option::Option<Self> {
                #krate::id::Id::as_usize(start)
                    .checked_sub(count)
                    .and_then(|value| Self::try_from(value).ok())
            }

            #[inline]
            fn forward_overflowing(start: Self, count: usize) -> (Self, bool) {
                // On overflow the returned value is unspecified, but it must still be a valid instance of Self.
                match <Self as ::core::iter::Step>::forward_checked(start, count) {
                    ::core::option::Option::Some(value) => (value, false),
                    ::core::option::Option::None => (start, true),
                }
            }

            #[inline]
            fn backward_overflowing(start: Self, count: usize) -> (Self, bool) {
                match <Self as ::core::iter::Step>::backward_checked(start, count) {
                    ::core::option::Option::Some(value) => (value, false),
                    ::core::option::Option::None => (start, true),
                }
            }
        }
    }
}
