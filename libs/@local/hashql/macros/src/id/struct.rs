use core::cmp;

use proc_macro2::{Ident, TokenStream};
use quote::{format_ident, quote};
use unsynn::ToTokens as _;

use super::grammar::{self, StructBody, StructScalar};
use crate::id::{
    attr::{Attributes, DisplayAttribute, Trait},
    common::IntegerScalar,
};

impl From<StructScalar> for IntegerScalar {
    fn from(scalar: StructScalar) -> Self {
        match scalar {
            StructScalar::U8(_) => Self::U8,
            StructScalar::U16(_) => Self::U16,
            StructScalar::U32(_) => Self::U32,
            StructScalar::U64(_) => Self::U64,
            StructScalar::U128(_) => Self::U128,
        }
    }
}

enum RangeKind {
    Inclusive,
    Exclusive,
}

impl From<grammar::RangeOp> for RangeKind {
    fn from(op: grammar::RangeOp) -> Self {
        match op {
            grammar::RangeOp::Inclusive(_) => Self::Inclusive,
            grammar::RangeOp::Exclusive(_) => Self::Exclusive,
        }
    }
}

struct Constraint {
    scalar: IntegerScalar,

    min: TokenStream,
    max: TokenStream,

    kind: RangeKind,
}

impl Constraint {
    fn message(&self) -> String {
        let op = match self.kind {
            RangeKind::Inclusive => "<=",
            RangeKind::Exclusive => "<",
        };

        format!("id value must be between {}{op}{}", self.min, self.max)
    }

    fn comparison(&self, ident: &Ident, ident_scalar: IntegerScalar) -> TokenStream {
        let width = cmp::max(self.scalar, ident_scalar);
        let min = &self.min;
        let max = &self.max;

        match self.kind {
            RangeKind::Inclusive => quote! {
                (#ident as #width) >= (#min as #width) &&
                (#ident as #width) <= (#max as #width)
            },
            RangeKind::Exclusive => quote! {
                (#ident as #width) >= (#min as #width) &&
                (#ident as #width) < (#max as #width)
            },
        }
    }

    fn assertion(&self, ident: &Ident, ident_scalar: IntegerScalar) -> TokenStream {
        let comparison = self.comparison(ident, ident_scalar);
        let message = self.message();

        quote! {
            assert!((#comparison), #message);
        }
    }
}

impl From<StructBody> for Constraint {
    fn from(
        StructBody {
            r#type,
            _is,
            start,
            op,
            end,
        }: StructBody,
    ) -> Self {
        Self {
            scalar: r#type.into(),
            min: start.into_token_stream(),
            max: end.into_token_stream(),
            kind: op.into(),
        }
    }
}

#[expect(
    clippy::too_many_lines,
    reason = "mostly mechanical quote! blocks with minimal logic; splitting would require \
              threading many local variables for no clarity gain"
)]
pub(super) fn expand_struct(
    grammar::ParsedStruct {
        attributes,
        visibility,
        _struct: r#struct,
        name,
        body,
    }: grammar::ParsedStruct,
) -> TokenStream {
    let mut output = TokenStream::new();
    let Attributes {
        krate,
        r#const: konst,
        display,
        traits,
        extra,
    } = Attributes::parse(attributes);
    let vis = visibility.into_token_stream();

    let int = body.content.r#type.to_token_stream();

    let constraint = Constraint::from(body.content);
    let scalar = constraint.scalar;

    let value_ident = format_ident!("value");
    let new_assertion = constraint.assertion(&value_ident, scalar);
    let u32_assertion = constraint.assertion(&value_ident, IntegerScalar::U32);
    let u64_assertion = constraint.assertion(&value_ident, IntegerScalar::U64);
    let usize_assertion = constraint.assertion(&value_ident, IntegerScalar::U64); // u64 to be safe, even on 32-bit systems

    let min = &constraint.min;
    let max = &constraint.max;

    let max_value = match constraint.kind {
        RangeKind::Inclusive => quote! { #max },
        RangeKind::Exclusive => quote! { #max - 1 },
    };

    let range_assertion = match constraint.kind {
        RangeKind::Inclusive => quote! {
            const _: () = assert!((#min as #scalar) <= (#max as #scalar), "inclusive range requires min <= max");
        },
        RangeKind::Exclusive => quote! {
            const _: () = assert!((#min as #scalar) < (#max as #scalar), "exclusive range requires min < max");
        },
    };

    let range_end = match constraint.kind {
        RangeKind::Inclusive => format!("{max}]"),
        RangeKind::Exclusive => format!("{max})"),
    };
    let new_panic_doc = format!("Panics if `value` is not in `[{min}, {range_end}`.");
    let unchecked_safety_doc =
        format!("The caller must ensure that `value` is in `[{min}, {range_end}`.");

    let kw = r#struct.into_token_stream();

    output.extend(quote! {
        #extra
        #[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        #vis #kw #name {
            #[doc(hidden)]
            _internal_do_not_use: #int
        }

        impl #name {
            /// Creates a new id from a raw scalar value.
            ///
            /// # Panics
            ///
            #[doc = #new_panic_doc]
            #[must_use]
            #[inline]
            #vis const fn new(value: #scalar) -> Self {
                #new_assertion

                Self { _internal_do_not_use: value }
            }

            /// Creates a new id from a raw scalar value without bounds checking.
            ///
            /// # Safety
            ///
            #[doc = #unchecked_safety_doc]
            #[must_use]
            #[inline]
            #vis const unsafe fn new_unchecked(value: #scalar) -> Self {
                Self { _internal_do_not_use: value }
            }
        }

        #range_assertion

        #[automatically_derived]
        #[expect(clippy::cast_possible_truncation, clippy::cast_lossless)]
        impl #konst #krate::id::Id for #name {
            const MIN: Self = Self::new(#min);
            const MAX: Self = Self::new(#max_value);

            fn from_u32(value: u32) -> Self {
                #u32_assertion

                Self { _internal_do_not_use: value as #scalar }
            }

            fn from_u64(value: u64) -> Self {
                #u64_assertion

                Self { _internal_do_not_use: value as #scalar }
            }

            fn from_usize(value: usize) -> Self {
                #usize_assertion

                Self { _internal_do_not_use: value as #scalar }
            }

            #[inline]
            fn as_u32(self) -> u32 {
                self._internal_do_not_use as u32
            }

            #[inline]
            fn as_u64(self) -> u64 {
                self._internal_do_not_use as u64
            }

            #[inline]
            fn as_usize(self) -> usize {
                self._internal_do_not_use as usize
            }

            #[inline]
            fn prev(self) -> ::core::option::Option<Self> {
                if self._internal_do_not_use == #min {
                    ::core::option::Option::None
                } else {
                    ::core::option::Option::Some(Self { _internal_do_not_use: self._internal_do_not_use - 1 })
                }
            }
        }

        #[automatically_derived]
        impl #krate::id::HasId for #name {
            type Id = Self;

            #[inline]
            fn id(&self) -> Self::Id {
                *self
            }
        }
    });

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

    // TryFrom
    for (param, param_scalar) in [
        (quote!(u32), IntegerScalar::U32),
        (quote!(u64), IntegerScalar::U64),
        (quote!(usize), IntegerScalar::U64), // u64 to be safe on 32-bit
    ] {
        let comparison = constraint.comparison(&value_ident, param_scalar);

        output.extend(quote! {
            #[automatically_derived]
            impl ::core::convert::TryFrom<#param> for #name {
                type Error = #krate::id::IdError;

                fn try_from(value: #param) -> ::core::result::Result<Self, Self::Error> {
                    if #comparison {
                        ::core::result::Result::Ok(Self { _internal_do_not_use: value as #scalar })
                    } else {
                        ::core::result::Result::Err(#krate::id::IdError::OutOfRange {
                            value: value as u64,
                            min: #min as u64,
                            max: (#max_value) as u64,
                        })
                    }
                }
            }
        });
    }

    // Display
    match display {
        DisplayAttribute::None => {}
        DisplayAttribute::Format(format) => {
            output.extend(quote! {
                impl ::core::fmt::Display for #name {
                    fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                        fmt.write_fmt(format_args!(#format, self._internal_do_not_use))
                    }
                }
            });
        }
        DisplayAttribute::Auto => {
            output.extend(quote! {
                impl ::core::fmt::Display for #name {
                    fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                        ::core::fmt::Display::fmt(&self._internal_do_not_use, fmt)
                    }
                }
            });
        }
    }

    // Step
    if traits.contains(&Trait::Step) {
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
                        .and_then(|value| Self::try_from(value).ok())
                }

                #[inline]
                fn backward_checked(start: Self, count: usize) -> ::core::option::Option<Self> {
                    #krate::id::Id::as_usize(start)
                        .checked_sub(count)
                        .and_then(|value| Self::try_from(value).ok())
                }
            }
        });
    }

    output
}
