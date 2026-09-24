mod constraint;
mod storage;
mod traits;

use proc_macro2::{Ident, TokenStream};
use quote::{format_ident, quote};
use unsynn::{ParenthesisGroupContaining, ToTokens as _};

use self::{
    constraint::{Constraint, width_assertion},
    storage::Storage,
};
use super::{
    attr::{Attributes, Trait},
    common::IntegerScalar,
    generics::Generics,
    grammar::{self, StructBody},
};

struct Definition {
    attributes: Attributes,
    visibility: TokenStream,
    name: Ident,
    generics: Generics,
    scalar: IntegerScalar,
    storage: Storage,
    constraint: Option<Constraint>,
}

impl Definition {
    fn new(
        grammar::ParsedStruct {
            attributes,
            visibility,
            _struct: _,
            name,
            parameters,
            body:
                ParenthesisGroupContaining {
                    content: StructBody { r#type, bounds },
                },
        }: grammar::ParsedStruct,
    ) -> Self {
        let attributes = Attributes::parse(attributes);
        let scalar = IntegerScalar::from(r#type);
        let storage = Storage::new(scalar, &attributes);

        Self {
            attributes,
            visibility: visibility.into_token_stream(),
            name,
            generics: Generics::new(parameters),
            scalar,
            storage,
            constraint: bounds.map(|bounds| Constraint::new(scalar, bounds)),
        }
    }

    fn value(&self) -> TokenStream {
        self.storage.read(quote!(self._internal_do_not_use))
    }

    fn initialize(&self, value: TokenStream) -> TokenStream {
        let stored = self.storage.wrap(value);
        let phantom = self.generics.initializer();
        quote!(Self { _internal_do_not_use: #stored, #phantom })
    }

    fn min_value(&self) -> TokenStream {
        self.constraint.as_ref().map_or_else(
            || quote!(0),
            |constraint| {
                let min = constraint.min_value();
                quote!(#min)
            },
        )
    }

    fn max_value(&self) -> TokenStream {
        let scalar = self.scalar;
        self.constraint
            .as_ref()
            .map_or_else(|| quote!(#scalar::MAX), Constraint::max_value)
    }

    fn assertion(&self, scalar: IntegerScalar) -> TokenStream {
        let value = format_ident!("value");
        self.constraint.as_ref().map_or_else(
            || width_assertion(self.scalar, &value, scalar),
            |constraint| constraint.assertion(&value, scalar),
        )
    }

    fn constructors(&self) -> TokenStream {
        let vis = &self.visibility;
        let scalar = self.scalar;
        let initialize = self.initialize(quote!(value));
        let Some(constraint) = &self.constraint else {
            return quote! {
                /// Creates a new id from a raw scalar value.
                #[must_use]
                #[inline]
                #vis const fn new(value: #scalar) -> Self {
                    #initialize
                }
            };
        };

        let assertion = self.assertion(scalar);
        let range = constraint.range();
        let panic_doc = format!("Panics if `value` is not in `{range}`.");
        let safety_doc = format!("The caller must ensure that `value` is in `{range}`.");

        quote! {
            /// Creates a new id from a raw scalar value.
            ///
            /// # Panics
            ///
            #[doc = #panic_doc]
            #[must_use]
            #[inline]
            #vis const fn new(value: #scalar) -> Self {
                #assertion
                #initialize
            }

            /// Creates a new id from a raw scalar value without bounds checking.
            ///
            /// # Safety
            ///
            #[doc = #safety_doc]
            #[must_use]
            #[inline]
            #vis const unsafe fn new_unchecked(value: #scalar) -> Self {
                #initialize
            }
        }
    }

    fn declaration(&self) -> TokenStream {
        let extra = &self.attributes.extra;
        let derives = self
            .storage
            .derives(self.constraint.is_some(), !self.generics.is_empty());
        let vis = &self.visibility;
        let name = &self.name;
        let generics = &self.generics;
        let parameters = generics.parameters();
        let phantom = generics.field();
        let int = self.storage.r#type();
        let scalar = self.scalar;
        let constructors = self.constructors();
        let value = self.value();
        let range_assertion = self.constraint.as_ref().map(Constraint::range_assertion);

        quote! {
            #extra
            #derives
            #vis struct #name #parameters {
                #[doc(hidden)]
                _internal_do_not_use: #int,
                #phantom
            }

            impl #parameters #name #generics {
                #constructors

                /// Returns the raw scalar value.
                #[must_use]
                #[inline]
                #vis const fn get(self) -> #scalar {
                    #value
                }
            }

            #range_assertion
        }
    }

    fn identity(&self) -> TokenStream {
        let name = &self.name;
        let generics = &self.generics;
        let parameters = generics.static_parameters();
        let krate = &self.attributes.krate;
        let konst = &self.attributes.r#const;
        let scalar = self.scalar;
        let value = self.value();
        let stored_cast = self.initialize(quote!(value as #scalar));
        let previous = self.initialize(quote!(#value - 1));
        let min = self.min_value();
        let max = self.max_value();

        let u32_assertion = self.assertion(IntegerScalar::U32);
        let u64_assertion = self.assertion(IntegerScalar::U64);
        // u64 to be safe, even on 32-bit systems.
        let usize_assertion = self.assertion(IntegerScalar::U64);

        quote! {
            #[automatically_derived]
            #[expect(clippy::cast_possible_truncation, clippy::cast_lossless)]
            #konst impl #parameters #krate::id::Id for #name #generics {
                const MIN: Self = Self::new(#min);
                const MAX: Self = Self::new(#max);

                fn from_u32(value: u32) -> Self {
                    #u32_assertion
                    #stored_cast
                }

                fn from_u64(value: u64) -> Self {
                    #u64_assertion
                    #stored_cast
                }

                fn from_usize(value: usize) -> Self {
                    #usize_assertion
                    #stored_cast
                }

                #[inline]
                fn as_u32(self) -> u32 { #value as u32 }

                #[inline]
                fn as_u64(self) -> u64 { #value as u64 }

                #[inline]
                fn as_usize(self) -> usize { #value as usize }

                #[inline]
                fn prev(self) -> ::core::option::Option<Self> {
                    if #value == #min {
                        ::core::option::Option::None
                    } else {
                        ::core::option::Option::Some(#previous)
                    }
                }
            }

            #[automatically_derived]
            impl #parameters #krate::id::HasId for #name #generics {
                type Id = Self;

                #[inline]
                fn id(&self) -> Self::Id { *self }
            }
        }
    }

    fn conversion(&self, param: &TokenStream, param_scalar: IntegerScalar) -> TokenStream {
        let name = &self.name;
        let generics = &self.generics;
        let parameters = generics.parameters();
        let krate = &self.attributes.krate;
        let konst = &self.attributes.r#const;
        let scalar = self.scalar;
        let stored = self.initialize(quote!(value as #scalar));
        let max = self.max_value();
        let min = self.min_value();

        let comparison = match &self.constraint {
            Some(constraint) => Some(constraint.comparison(&format_ident!("value"), param_scalar)),
            None if param_scalar > scalar => {
                Some(quote!((value as #param_scalar) <= (#scalar::MAX as #param_scalar)))
            }
            None => None,
        };

        let body = comparison.map_or_else(
            || quote!(::core::result::Result::Ok(#stored)),
            |comparison| {
                quote! {
                    if #comparison {
                        ::core::result::Result::Ok(#stored)
                    } else {
                        ::core::result::Result::Err(#krate::id::IdError::OutOfRange {
                            value: value as u64,
                            min: #min as u64,
                            max: (#max) as u64,
                        })
                    }
                }
            },
        );

        quote! {
            #[automatically_derived]
            #konst impl #parameters ::core::convert::TryFrom<#param> for #name #generics {
                type Error = #krate::id::IdError;

                fn try_from(value: #param) -> ::core::result::Result<Self, Self::Error> {
                    #body
                }
            }
        }
    }

    fn byte_validity(&self) -> TokenStream {
        let Some(constraint) = &self.constraint else {
            return TokenStream::new();
        };
        if !self.storage.is_bytes() {
            return TokenStream::new();
        }

        let name = &self.name;
        let generics = &self.generics;
        let parameters = generics.parameters();
        let alignment = generics.fresh_ident("__HashqlAlignment");
        let int = self.storage.r#type();
        let storage_value = self.storage.read_candidate();
        let comparison = constraint.comparison(&format_ident!("value"), self.scalar);

        quote! {
            // SAFETY: repr(transparent) preserves the storage layout. PhantomData has size 0,
            // alignment 1 and no validity constraint. The predicate accepts exactly the stored
            // scalars in the declared range, whose storage admits every initialized bit pattern.
            #[automatically_derived]
            unsafe impl #parameters ::zerocopy::TryFromBytes for #name #generics {
                fn only_derive_is_allowed_to_implement_this_trait() {}

                #[inline]
                fn is_bit_valid<#alignment>(candidate: ::zerocopy::Maybe<'_, Self, #alignment>) -> bool
                where
                    #alignment: ::zerocopy::invariant::Alignment,
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
        }
    }
}

pub(super) fn expand_struct(parsed: grammar::ParsedStruct) -> TokenStream {
    let definition = Definition::new(parsed);

    let mut output = definition.declaration();
    output.extend(definition.identity());
    output.extend(definition.byte_validity());
    output.extend(traits::scalar(&definition));
    output.extend(traits::formatting(&definition));

    for (param, scalar) in [
        (quote!(u32), IntegerScalar::U32),
        (quote!(u64), IntegerScalar::U64),
        (quote!(usize), IntegerScalar::U64), // u64 to be safe on 32-bit.
    ] {
        output.extend(definition.conversion(&param, scalar));
    }
    if definition.attributes.traits.contains(&Trait::Step) {
        output.extend(traits::step(&definition));
    }
    output
}
