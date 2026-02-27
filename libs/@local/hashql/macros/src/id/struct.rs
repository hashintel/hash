use proc_macro::TokenStream;
use unsynn::{ToTokens as _, quote};

use super::grammar;
use crate::{grammar::Bridge, id::attr::Attributes};

fn expand_struct(
    additional_attributes: Vec<grammar::IdAttribute>,
    grammar::ParsedStruct {
        attributes,
        visibility,
        _struct: _,
        name,
        body,
    }: grammar::ParsedStruct,
) -> TokenStream {
    let attributes = Attributes::parse(additional_attributes, attributes);

    let mut output = TokenStream::new();

    let inner_type = body.content.r#type;
    let min = body.content.start;
    let op = body.content.op;
    let max = body.content.end;

    let assert_message = Bridge(format!(
        "ID value must be between the range of {}{}{}",
        min.to_token_stream(),
        op.to_token_stream(),
        max.to_token_stream()
    ));

    let max_cmp = match op {
        grammar::RangeOp::Exclusive(_) => quote!(<),
        grammar::RangeOp::Inclusive(_) => quote!(<=),
    };

    output.extend(attributes.extra);
    output.extend(quote! {
        #[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        #visibility struct #name {
            _internal_do_not_use: #inner_type
        }
    });

    // Inherent impl
    output.extend(quote! {
        impl #name {
            #[must_use]
            #visibility const fn new(value: #inner_type) -> Self {
                assert!(value >= #min && value #max_cmp #max, #assert_message);
                Self { _internal_do_not_use: value }
            }

            #[inline]
            #visibility const unsafe fn new_unchecked(value: #inner_type) -> Self {
                Self { _internal_do_not_use: value }
            }
        }
    });

    // Id trait
    let (vc32, bc32, cc32) = scalar_casts(&inner_type, &param_scalar("u32"));
    let (vc64, bc64, cc64) = scalar_casts(&inner_type, &param_scalar("u64"));
    let (vcus, bcus, ccus) = scalar_casts(&inner_type, &param_scalar("usize"));

    output.extend(quote! {
        #[automatically_derived]
        #[expect(clippy::allow_attributes, reason = "automatically generated")]
        #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
        impl #konst #krate::id::Id for #name {
            const MIN: Self = Self::new(#min);
            const MAX: Self = Self::new(#max);

            fn from_u32(value: u32) -> Self {
                assert!((value #vc32) >= (#min #bc32) && (value #vc32) #max_cmp (#max #bc32), #assert_message);
                Self { _internal_do_not_use: value #cc32 }
            }
            fn from_u64(value: u64) -> Self {
                assert!((value #vc64) >= (#min #bc64) && (value #vc64) #max_cmp (#max #bc64), #assert_message);
                Self { _internal_do_not_use: value #cc64 }
            }
            fn from_usize(value: usize) -> Self {
                assert!((value #vcus) >= (#min #bcus) && (value #vcus) #max_cmp (#max #bcus), #assert_message);
                Self { _internal_do_not_use: value #ccus }
            }

            #[inline] fn as_u32(self) -> u32 { self._internal_do_not_use as u32 }
            #[inline] fn as_u64(self) -> u64 { self._internal_do_not_use as u64 }
            #[inline] fn as_usize(self) -> usize { self._internal_do_not_use as usize }

            #[inline]
            fn prev(self) -> ::core::option::Option<Self> {
                if self._internal_do_not_use == #min {
                    ::core::option::Option::None
                } else {
                    ::core::option::Option::Some(unsafe { Self::new_unchecked(self._internal_do_not_use - 1) })
                }
            }
        }
    });

    // TryFrom impls
    for (param_name, value_cast, bounds_cast, construct_cast) in [
        ("u32", &vc32, &bc32, &cc32),
        ("u64", &vc64, &bc64, &cc64),
        ("usize", &vcus, &bcus, &ccus),
    ] {
        let param_ty: TokenStream = param_name.parse().unwrap();
        // For the error report, always widen to u64
        let err_value_cast = if param_name == "u64" {
            TokenStream::new()
        } else {
            quote!(as u64)
        };

        output.extend(quote! {
            #[automatically_derived]
            #[expect(clippy::allow_attributes, reason = "automatically generated")]
            #[allow(clippy::cast_possible_truncation, clippy::cast_lossless, clippy::checked_conversions)]
            impl ::core::convert::TryFrom<#param_ty> for #name {
                type Error = #krate::id::IdError;
                fn try_from(value: #param_ty) -> ::core::result::Result<Self, Self::Error> {
                    if (value #value_cast) >= (#min #bounds_cast) && (value #value_cast) #max_cmp (#max #bounds_cast) {
                        ::core::result::Result::Ok(Self { _internal_do_not_use: value #construct_cast })
                    } else {
                        ::core::result::Result::Err(#krate::id::IdError::OutOfRange {
                            value: value #err_value_cast, min: #min as u64, max: #max as u64,
                        })
                    }
                }
            }
        });
    }

    // HasId
    output.extend(quote! {
        impl #krate::id::HasId for #name {
            type Id = #name;
            fn id(&self) -> Self::Id { *self }
        }
    });

    // Display
    let display_attr = id_attributes.iter().find_map(|attr| match attr {
        grammar::IdAttribute::Display { format, .. } => Some(format),
        _ => None,
    });

    match display_attr {
        Some(grammar::IdDisplay::None(_)) => {}
        Some(grammar::IdDisplay::Format(format)) => {
            output.extend(quote! {
                impl ::core::fmt::Display for #name {
                    fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                        fmt.write_fmt(format_args!(#format, self._internal_do_not_use))
                    }
                }
            });
        }
        None => {
            output.extend(quote! {
                impl ::core::fmt::Display for #name {
                    fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                        ::core::fmt::Display::fmt(&self._internal_do_not_use, fmt)
                    }
                }
            });
        }
    }

    // Debug
    output.extend(quote! {
        impl ::core::fmt::Debug for #name {
            fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                fmt.debug_tuple(stringify!(#name))
                    .field(&self._internal_do_not_use)
                    .finish()
            }
        }
    });

    // Step
    let has_step = id_attributes.iter().any(|attr| {
        matches!(attr, grammar::IdAttribute::Derive { traits, .. }
            if traits.content.iter().any(|delimited| matches!(delimited.value, grammar::IdDerive::Step(_))))
    });

    if has_step {
        output.extend(quote! {
            impl ::core::iter::Step for #name {
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
                        .map(#krate::id::Id::from_usize)
                }

                #[inline]
                fn backward_checked(start: Self, count: usize) -> ::core::option::Option<Self> {
                    #krate::id::Id::as_usize(start)
                        .checked_sub(count)
                        .map(#krate::id::Id::from_usize)
                }
            }
        });
    }

    output
}

/// Given the inner scalar type and a parameter type (u32/u64/usize), returns
/// `(value_cast, bounds_cast, construct_cast)`:
///
/// - `value_cast`: applied to `value` in comparisons when it's narrower than inner
/// - `bounds_cast`: applied to `min`/`max` in comparisons when they're narrower than param
/// - `construct_cast`: applied to `value` when constructing the inner field
///
/// When inner and param are the same width, all three are empty.
fn scalar_casts(
    inner: &grammar::StructScalar,
    param: &grammar::StructScalar,
) -> (TokenStream, TokenStream, TokenStream) {
    let inner_rank = scalar_rank(inner);
    let param_rank = scalar_rank(param);

    if inner_rank == param_rank {
        // Same width, no casts needed
        (TokenStream::new(), TokenStream::new(), TokenStream::new())
    } else if inner_rank > param_rank {
        // Inner is wider; widen value to inner for comparison, cast value to inner for construct
        let inner_ts = inner.to_token_stream();
        (
            quote!(as #inner_ts),
            TokenStream::new(),
            quote!(as #inner_ts),
        )
    } else {
        // Param is wider; widen min/max to param for comparison, narrow value to inner for
        // construct
        let param_ts = param.to_token_stream();
        let inner_ts = inner.to_token_stream();
        (
            TokenStream::new(),
            quote!(as #param_ts),
            quote!(as #inner_ts),
        )
    }
}
