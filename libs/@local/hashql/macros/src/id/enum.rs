use proc_macro2::{Literal, TokenStream};
use quote::{quote, quote_spanned};
use unsynn::ToTokens as _;

use super::grammar;
use crate::id::{
    attr::{Attributes, DisplayAttribute, Trait},
    common::IntegerScalar,
};

#[expect(clippy::too_many_lines, reason = "macro")]
pub(super) fn expand_enum(
    grammar::ParsedEnum {
        attributes,
        visibility,
        _enum: _,
        name,
        body,
    }: grammar::ParsedEnum,
) -> TokenStream {
    let mut output = TokenStream::new();

    let Attributes {
        krate,
        r#const: konst,
        display,
        traits,
        extra: _,
    } = Attributes::parse(attributes);
    let vis = visibility.into_token_stream();

    let mut variants: Vec<_> = Vec::new();
    for variant in &*body.content {
        variants.push(&variant.value.name);
    }

    let variant_count = variants.len();
    let backing = IntegerScalar::from_variant_count(variant_count);

    let discriminant_arms = variants.iter().enumerate().map(|(index, variant)| {
        let literal = Literal::usize_unsuffixed(index);

        quote_spanned!(variant.span() => #literal => ::core::option::Option::Some(Self::#variant))
    });
    let self_variants = variants
        .iter()
        .map(|variant| quote_spanned!(variant.span() => Self::#variant));

    // 1. Size assertion: ensures the enum has the expected repr
    let size_message = format!("expected `{name}` to be `{backing}`-sized");
    output.extend(quote! {
        const _: () = assert!(
            ::core::mem::size_of::<#name>() == ::core::mem::size_of::<#backing>(),
            #size_message
        );
    });

    // 2. Inherent impl
    output.extend(quote! {
        impl #name {
            /// The number of variants in this enum.
            #vis const VARIANT_COUNT: usize = #variant_count;

            /// Converts a discriminant value to the corresponding variant, returning
            /// [`None`] if the value does not match any variant.
            #[inline]
            #vis const fn try_from_discriminant(value: #backing) -> ::core::option::Option<Self> {
                match value {
                    #(#discriminant_arms,)*
                    _ => ::core::option::Option::None,
                }
            }

            /// Converts a discriminant value to the corresponding variant.
            ///
            /// # Panics
            ///
            /// Panics if the value does not match any variant.
            #[inline]
            #vis const fn from_discriminant(value: #backing) -> Self {
                match Self::try_from_discriminant(value) {
                    ::core::option::Option::Some(variant) => variant,
                    ::core::option::Option::None => unreachable!(),
                }
            }

            /// Converts a discriminant value to the corresponding variant without
            /// checking that the value is valid.
            ///
            /// # Safety
            ///
            /// The value must be a valid discriminant for this enum.
            #[inline]
            #[expect(unsafe_code)]
            #vis const unsafe fn from_discriminant_unchecked(value: #backing) -> Self {
                match Self::try_from_discriminant(value) {
                    ::core::option::Option::Some(variant) => variant,
                    // SAFETY: The caller guarantees that the value is a valid discriminant.
                    ::core::option::Option::None => unsafe { ::core::hint::unreachable_unchecked() },
                }
            }

            /// Returns the discriminant value of this variant.
            #[inline]
            #vis const fn into_discriminant(self) -> #backing {
                self as #backing
            }

            /// Returns an array containing all variants in discriminant order.
            #[inline]
            #[must_use]
            #vis const fn all() -> [Self; Self::VARIANT_COUNT] {
                [#(#self_variants),*]
            }
        }
    });

    // 3. Compile-time roundtrip assertion
    output.extend(quote! {
        const _: () = {
            let mut index = 0 as #backing;

            while index < #name::VARIANT_COUNT as #backing {
                let variant = #name::from_discriminant(index);
                let roundtrip = variant.into_discriminant();

                assert!(roundtrip == index);
                index += 1;
            }
        };
    });

    // 4. Id trait impl
    let max = Literal::usize_unsuffixed(variant_count.saturating_sub(1));
    let count = Literal::usize_unsuffixed(variant_count);
    let message = format!(
        "ID must be between 0 and {}",
        variant_count.saturating_sub(1)
    );

    output.extend(quote! {
        #[automatically_derived]
        #[expect(clippy::cast_possible_truncation, clippy::cast_lossless)]
        impl #konst #krate::id::Id for #name {
            const MIN: Self = Self::from_discriminant(0);
            const MAX: Self = Self::from_discriminant(#max);

            fn from_u32(index: u32) -> Self {
                assert!(index < #count, #message);

                Self::from_discriminant(index as #backing)
            }

            fn from_u64(index: u64) -> Self {
                assert!(index < #count, #message);

                Self::from_discriminant(index as #backing)
            }

            fn from_usize(index: usize) -> Self {
                assert!(index < #count, #message);

                Self::from_discriminant(index as #backing)
            }

            #[inline]
            fn as_u32(self) -> u32 {
                self.into_discriminant() as u32
            }

            #[inline]
            fn as_u64(self) -> u64 {
                self.into_discriminant() as u64
            }

            #[inline]
            fn as_usize(self) -> usize {
                self.into_discriminant() as usize
            }

            #[inline]
            fn prev(self) -> ::core::option::Option<Self> {
                let discriminant = self.into_discriminant();

                let prev = discriminant.checked_sub(1)?;
                Self::try_from_discriminant(prev)
            }
        }
    });

    // 5. TryFrom impls
    for int in [quote!(u32), quote!(u64), quote!(usize)] {
        output.extend(quote! {
            #[automatically_derived]
            impl ::core::convert::TryFrom<#int> for #name {
                type Error = #krate::id::IdError;

                #[inline]
                fn try_from(value: #int) -> ::core::result::Result<Self, Self::Error> {
                    if value >= #count {
                        return Err(#krate::id::IdError::OutOfRange {
                            value: value as u64,
                            min: 0,
                            max: #max,
                        });
                    }

                    Ok(Self::from_discriminant(value as #backing))
                }
            }
        });
    }

    // 6. HasId impl
    output.extend(quote! {
        #[automatically_derived]
        impl #krate::id::HasId for #name {
            type Id = Self;

            #[inline]
            fn id(&self) -> Self::Id {
                *self
            }
        }
    });

    // 7. Display
    match display {
        DisplayAttribute::None => {}
        DisplayAttribute::Format(format) => {
            output.extend(quote! {
                impl ::core::fmt::Display for #name {
                    fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                        fmt.write_fmt(format_args!(#format, self.into_discriminant()))
                    }
                }
            });
        }
        DisplayAttribute::Auto => {
            let lowercase_names = variants.iter().map(|variant| {
                let lowercase = variant.to_string().to_lowercase();
                quote_spanned!(variant.span() => Self::#variant => fmt.write_str(#lowercase))
            });

            output.extend(quote! {
                impl ::core::fmt::Display for #name {
                    fn fmt(&self, fmt: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                        match self {
                            #(#lowercase_names),*
                        }
                    }
                }
            });
        }
    }

    // 8. Step (optional)
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
