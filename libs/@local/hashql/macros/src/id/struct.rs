use core::cmp;

use proc_macro2::{Ident, TokenStream};
use quote::{format_ident, quote};
use unsynn::{ParenthesisGroupContaining, ToTokens as _};

use super::{
    attr::Spanned,
    grammar::{self, StructBody, StructScalar},
};
use crate::{
    emit_error,
    id::{
        attr::{Attributes, DisplayAttribute, Endianness, Trait},
        common::IntegerScalar,
    },
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

/// An explicit `is start..=end` bounds clause, ready for code generation.
struct Constraint {
    scalar: IntegerScalar,

    min: TokenStream,
    max: TokenStream,

    kind: RangeKind,
}

impl Constraint {
    fn new(scalar: IntegerScalar, bounds: grammar::StructBounds) -> Self {
        Self {
            scalar,
            min: bounds.start.into_token_stream(),
            max: bounds.end.into_token_stream(),
            kind: bounds.op.into(),
        }
    }

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

/// Guard asserted when converting a possibly wider integer into an unbounded id.
///
/// Empty when the parameter type cannot exceed the backing type.
fn width_assertion(
    scalar: IntegerScalar,
    ident: &Ident,
    ident_scalar: IntegerScalar,
) -> TokenStream {
    if ident_scalar <= scalar {
        return TokenStream::new();
    }

    let message = format!("id value must fit in `{scalar}`");

    quote! {
        assert!((#ident as #ident_scalar) <= (#scalar::MAX as #ident_scalar), #message);
    }
}

/// The stored form of an id: a native scalar or a zerocopy byteorder integer.
struct Storage {
    ty: TokenStream,
    byteorder: bool,
}

impl Storage {
    fn new(scalar: IntegerScalar, endian: Endianness, bytes: bool) -> Self {
        // u8 is its own byte encoding; the byteorder family starts at 16 bits.
        let byteorder = bytes && scalar != IntegerScalar::U8;

        let ty = if byteorder {
            let width = match scalar {
                IntegerScalar::U16 => quote!(U16),
                IntegerScalar::U32 => quote!(U32),
                IntegerScalar::U64 => quote!(U64),
                IntegerScalar::U128 => quote!(U128),
                IntegerScalar::U8 => unreachable!("u8 never selects the byteorder form"),
            };
            let order = match endian {
                Endianness::Native => quote!(NativeEndian),
                Endianness::Little => quote!(LittleEndian),
                Endianness::Big => quote!(BigEndian),
            };

            quote!(::zerocopy::#width<::zerocopy::#order>)
        } else {
            quote!(#scalar)
        };

        Self { ty, byteorder }
    }

    /// Expression storing a scalar value expression as the field's type.
    fn wrap(&self, value: &TokenStream) -> TokenStream {
        if self.byteorder {
            let ty = &self.ty;

            quote!(<#ty>::new(#value))
        } else {
            value.clone()
        }
    }

    /// Expression reading the scalar value back out of a field place expression.
    fn read(&self, place: &TokenStream) -> TokenStream {
        if self.byteorder {
            quote!(#place.get())
        } else {
            place.clone()
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
        body:
            ParenthesisGroupContaining {
                content: StructBody { r#type, bounds },
            },
    }: grammar::ParsedStruct,
) -> TokenStream {
    let mut output = TokenStream::new();

    let Attributes {
        krate,
        r#const: konst,
        display,
        traits,
        mut endian,
        unaligned,
        extra,
    } = Attributes::parse(attributes);
    let vis = visibility.into_token_stream();

    let scalar = IntegerScalar::from(r#type);

    if scalar == IntegerScalar::U8
        && let Some(Spanned {
            value: ref mut value @ (Endianness::Big | Endianness::Little),
            span,
        }) = endian
    {
        emit_error(
            span,
            "`u8` has no byte order; use `unaligned` without `endian`",
        );

        *value = Endianness::Native;
    }

    if unaligned.is_none()
        && let Some(Spanned {
            value: Endianness::Big | Endianness::Little,
            span,
        }) = endian
    {
        emit_error(
            span,
            "`endian` requires `unaligned`: an endian-pinned id is stored as its byte encoding, \
             which has alignment 1",
        );
    }

    let endian = endian.map_or(Endianness::Native, |Spanned { value, .. }| value);

    // Error recovery treats a lone `endian` as if `unaligned` had been written.
    let bytes = unaligned.is_some() || endian != Endianness::Native;

    let storage = Storage::new(scalar, endian, bytes);
    let int = &storage.ty;

    let constraint = bounds.map(|bounds| Constraint::new(scalar, bounds));

    let value_ident = format_ident!("value");
    let self_place = quote!(self._internal_do_not_use);
    let self_value = storage.read(&self_place);
    let stored_value = storage.wrap(&quote!(value));
    let stored_cast = storage.wrap(&quote!(value as #scalar));
    let prev_value = storage.wrap(&quote!(#self_value - 1));

    let [u32_assertion, u64_assertion, usize_assertion] = [
        IntegerScalar::U32,
        IntegerScalar::U64,
        IntegerScalar::U64, // u64 to be safe, even on 32-bit systems
    ]
    .map(|ident_scalar| {
        constraint.as_ref().map_or_else(
            || width_assertion(scalar, &value_ident, ident_scalar),
            |constraint| constraint.assertion(&value_ident, ident_scalar),
        )
    });

    let (min_value, max_value) = constraint.as_ref().map_or_else(
        || (quote! { 0 }, quote! { #scalar::MAX }),
        |constraint| {
            let max = &constraint.max;
            let max_value = match constraint.kind {
                RangeKind::Inclusive => quote! { #max },
                RangeKind::Exclusive => quote! { #max - 1 },
            };

            (constraint.min.clone(), max_value)
        },
    );

    let constructors = constraint.as_ref().map_or_else(
        || {
            quote! {
                /// Creates a new id from a raw scalar value.
                #[must_use]
                #[inline]
                #vis const fn new(value: #scalar) -> Self {
                    Self { _internal_do_not_use: #stored_value }
                }
            }
        },
        |constraint| {
            let new_assertion = constraint.assertion(&value_ident, scalar);
            let min = &constraint.min;
            let max = &constraint.max;
            let range_end = match constraint.kind {
                RangeKind::Inclusive => format!("{max}]"),
                RangeKind::Exclusive => format!("{max})"),
            };
            let new_panic_doc = format!("Panics if `value` is not in `[{min}, {range_end}`.");
            let unchecked_safety_doc =
                format!("The caller must ensure that `value` is in `[{min}, {range_end}`.");

            quote! {
                /// Creates a new id from a raw scalar value.
                ///
                /// # Panics
                ///
                #[doc = #new_panic_doc]
                #[must_use]
                #[inline]
                #vis const fn new(value: #scalar) -> Self {
                    #new_assertion

                    Self { _internal_do_not_use: #stored_value }
                }

                /// Creates a new id from a raw scalar value without bounds checking.
                ///
                /// # Safety
                ///
                #[doc = #unchecked_safety_doc]
                #[must_use]
                #[inline]
                #vis const unsafe fn new_unchecked(value: #scalar) -> Self {
                    Self { _internal_do_not_use: #stored_value }
                }
            }
        },
    );

    let range_assertion = constraint.as_ref().map_or_else(TokenStream::new, |constraint| {
            let min = &constraint.min;
            let max = &constraint.max;

            match constraint.kind {
                RangeKind::Inclusive => quote! {
                    const _: () = assert!((#min as #scalar) <= (#max as #scalar), "inclusive range requires min <= max");
                },
                RangeKind::Exclusive => quote! {
                    const _: () = assert!((#min as #scalar) < (#max as #scalar), "exclusive range requires min < max");
                },
            }
        });

    let derives = if bytes {
        // Bounded ids reject `FromBytes` (and its `FromZeros` supertrait): both construct
        // from arbitrary byte sources without running the range check. Their byte door is
        // the hand-written `TryFromBytes` impl emitted below.
        let from_bytes = if constraint.is_none() {
            quote!(::zerocopy::FromBytes,)
        } else {
            TokenStream::new()
        };

        quote! {
            #[derive(
                Copy,
                Clone,
                PartialOrd,
                Ord,
                ::zerocopy::ByteEq,
                ::zerocopy::ByteHash,
                ::zerocopy::IntoBytes,
                #from_bytes
                ::zerocopy::Immutable,
                ::zerocopy::Unaligned,
                ::zerocopy::KnownLayout,
            )]
            #[repr(transparent)]
        }
    } else {
        quote! {
            #[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        }
    };

    let kw = r#struct.into_token_stream();

    output.extend(quote! {
        #extra
        #derives
        #vis #kw #name {
            #[doc(hidden)]
            _internal_do_not_use: #int
        }

        impl #name {
            #constructors

            /// Returns the raw scalar value.
            #[must_use]
            #[inline]
            #vis const fn get(self) -> #scalar {
                #self_value
            }
        }

        #range_assertion

        #[automatically_derived]
        #[expect(clippy::cast_possible_truncation, clippy::cast_lossless)]
        #konst impl #krate::id::Id for #name {
            const MIN: Self = Self::new(#min_value);
            const MAX: Self = Self::new(#max_value);

            fn from_u32(value: u32) -> Self {
                #u32_assertion

                Self { _internal_do_not_use: #stored_cast }
            }

            fn from_u64(value: u64) -> Self {
                #u64_assertion

                Self { _internal_do_not_use: #stored_cast }
            }

            fn from_usize(value: usize) -> Self {
                #usize_assertion

                Self { _internal_do_not_use: #stored_cast }
            }

            #[inline]
            fn as_u32(self) -> u32 {
                #self_value as u32
            }

            #[inline]
            fn as_u64(self) -> u64 {
                #self_value as u64
            }

            #[inline]
            fn as_usize(self) -> usize {
                #self_value as usize
            }

            #[inline]
            fn prev(self) -> ::core::option::Option<Self> {
                if #self_value == #min_value {
                    ::core::option::Option::None
                } else {
                    ::core::option::Option::Some(Self { _internal_do_not_use: #prev_value })
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

    // Bounded byte-encoded ids get `TryFromBytes` by hand, with the range check as the
    // validity predicate: the derive cannot see non-structural constraints, and `FromBytes`
    // would admit out-of-range bit patterns at the byte door. The impl provides zerocopy's
    // doc(hidden) items directly; upstream reserves the right to change them.
    if bytes && let Some(constraint) = &constraint {
        let storage_value = if storage.byteorder {
            quote!(storage.unaligned_as_ref().get())
        } else {
            quote!(*storage.unaligned_as_ref())
        };
        let comparison = constraint.comparison(&value_ident, scalar);

        output.extend(quote! {
            // SAFETY: `is_bit_valid` returns `true` exactly when the stored scalar lies in
            // the id's declared range - the type's only validity requirement beyond its
            // storage, whose every initialized bit pattern is valid. The check is the same
            // comparison `new` asserts on construction.
            #[automatically_derived]
            unsafe impl ::zerocopy::TryFromBytes for #name {
                fn only_derive_is_allowed_to_implement_this_trait() {}

                #[inline]
                fn is_bit_valid<A>(candidate: ::zerocopy::Maybe<'_, Self, A>) -> bool
                where
                    A: ::zerocopy::invariant::Alignment,
                {
                    let storage = candidate.transmute_with::<
                        #int,
                        ::zerocopy::invariant::Valid,
                        ::zerocopy::pointer::cast::CastSizedExact,
                        ::zerocopy::BecauseImmutable,
                    >();
                    let value = #storage_value;

                    #comparison
                }
            }
        });
    }

    // Debug
    output.extend(quote! {
        impl ::core::fmt::Debug for #name {
            fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                fmt.debug_tuple(stringify!(#name))
                    .field(&#self_value)
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
        let body = match &constraint {
            Some(constraint) => {
                let comparison = constraint.comparison(&value_ident, param_scalar);
                let min = &constraint.min;

                quote! {
                    if #comparison {
                        ::core::result::Result::Ok(Self { _internal_do_not_use: #stored_cast })
                    } else {
                        ::core::result::Result::Err(#krate::id::IdError::OutOfRange {
                            value: value as u64,
                            min: #min as u64,
                            max: (#max_value) as u64,
                        })
                    }
                }
            }
            None if param_scalar > scalar => quote! {
                if (value as #param_scalar) <= (#scalar::MAX as #param_scalar) {
                    ::core::result::Result::Ok(Self { _internal_do_not_use: #stored_cast })
                } else {
                    ::core::result::Result::Err(#krate::id::IdError::OutOfRange {
                        value: value as u64,
                        min: 0,
                        max: #scalar::MAX as u64,
                    })
                }
            },
            None => quote! {
                ::core::result::Result::Ok(Self { _internal_do_not_use: #stored_cast })
            },
        };

        output.extend(quote! {
            #[automatically_derived]
            #konst impl ::core::convert::TryFrom<#param> for #name {
                type Error = #krate::id::IdError;

                fn try_from(value: #param) -> ::core::result::Result<Self, Self::Error> {
                    #body
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
                        fmt.write_fmt(format_args!(#format, #self_value))
                    }
                }
            });
        }
        DisplayAttribute::Auto => {
            output.extend(quote! {
                impl ::core::fmt::Display for #name {
                    fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                        ::core::fmt::Display::fmt(&#self_value, fmt)
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
