use proc_macro2::TokenStream;
use quote::{format_ident, quote};

use super::constraint::Constraint;
use crate::{
    emit_error,
    id::{
        attr::{Attributes, Endianness, Spanned},
        common::IntegerScalar,
        grammar::StructScalar,
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

/// The stored form of an id is a native scalar, a ranged scalar or a zerocopy byteorder integer.
pub(super) struct Storage {
    r#type: TokenStream,

    bytes: bool,
    byteorder: bool,
    ranged: bool,
}

impl Storage {
    pub(super) fn new(
        scalar: IntegerScalar,
        attributes: &Attributes,
        constraint: Option<&Constraint>,
    ) -> Self {
        let mut endian = attributes
            .endian
            .map_or(Endianness::Native, |Spanned { value, .. }| value);

        if scalar == IntegerScalar::U8 && endian != Endianness::Native {
            let span = attributes
                .endian
                .as_ref()
                .expect("explicit byte order")
                .span;

            emit_error(
                span,
                "`u8` has no byte order; use `unaligned` without `endian`",
            );

            endian = Endianness::Native;
        }

        if attributes.unaligned.is_none() && endian != Endianness::Native {
            let span = attributes
                .endian
                .as_ref()
                .expect("explicit byte order")
                .span;

            emit_error(
                span,
                "`endian` requires `unaligned`: an endian-pinned id is stored as its byte \
                 encoding, which has alignment 1",
            );
        }

        // Error recovery treats a lone `endian` as if `unaligned` had been written.
        let bytes = attributes.unaligned.is_some() || endian != Endianness::Native;

        // u8 is excluded as it has no byte order, errors out before byteorder is selected
        let byteorder = bytes && scalar != IntegerScalar::U8;
        let r#type = if byteorder {
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
        } else if let Some(constraint) = constraint
            && !bytes
        {
            let krate = &attributes.krate;
            let name = format_ident!("Ranged{}", scalar.to_string().to_uppercase());
            let min = constraint.min_value();
            let max = constraint.max_value();

            quote!(#krate::id::ranged::#name<{ #min }, { #max }>)
        } else {
            quote!(#scalar)
        };

        Self {
            r#type,
            bytes,
            byteorder,
            ranged: constraint.is_some() && !bytes,
        }
    }

    pub(super) const fn r#type(&self) -> &TokenStream {
        &self.r#type
    }

    pub(super) const fn is_bytes(&self) -> bool {
        self.bytes
    }

    pub(super) fn read_candidate(&self) -> TokenStream {
        if self.byteorder {
            quote!(storage.unaligned_as_ref().get())
        } else {
            quote!(*storage.unaligned_as_ref())
        }
    }

    /// Expands to the stored form of `value`.
    ///
    /// For a ranged scalar the expansion does not check `value`. Every caller places it after a
    /// check of `value` against the declared range, or inside an `unsafe fn` whose caller
    /// guarantees the range.
    pub(super) fn wrap(&self, value: TokenStream) -> TokenStream {
        let ty = &self.r#type;

        if self.byteorder {
            quote!(<#ty>::new(#value))
        } else if self.ranged {
            quote!(unsafe { <#ty>::new_unchecked(#value) })
        } else {
            value
        }
    }

    pub(super) fn read(&self, place: TokenStream) -> TokenStream {
        if self.byteorder || self.ranged {
            quote!(#place.get())
        } else {
            place
        }
    }

    pub(super) fn derives(&self, bounded: bool, generic: bool, konst: bool) -> TokenStream {
        let standard = if generic {
            TokenStream::new()
        } else if self.bytes && konst {
            quote!(#[derive(Copy, Clone, ::zerocopy::ByteHash)])
        } else if konst {
            quote! {
                #[derive(Copy, Clone, Hash)]
                #[derive_const(PartialEq, Eq, PartialOrd, Ord)]
            }
        } else if self.bytes {
            quote! {
                #[derive(Copy, Clone, PartialOrd, Ord, ::zerocopy::ByteEq, ::zerocopy::ByteHash)]
            }
        } else {
            quote!(#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)])
        };

        let byte_traits = if self.bytes {
            // FromBytes would bypass the range check. Bounded ids implement TryFromBytes
            // explicitly.
            let from_bytes = (!bounded).then(|| quote!(::zerocopy::FromBytes,));
            quote! {
                #[derive(
                    ::zerocopy::IntoBytes,
                    #from_bytes
                    ::zerocopy::Immutable,
                    ::zerocopy::Unaligned,
                    ::zerocopy::KnownLayout,
                )]
                #[repr(transparent)]
            }
        } else {
            TokenStream::new()
        };

        quote!(#standard #byte_traits)
    }
}
