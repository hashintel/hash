use core::fmt::Display;

use proc_macro::{Diagnostic, Level, Span, TokenStream};
use unsynn::{Parse, ToTokenIter, ToTokens, quote};

use crate::grammar::Bridge;

mod grammar {
    #![expect(clippy::result_large_err)]
    use unsynn::*;

    use crate::grammar::{
        AngleTokenTree, Attribute, KConst, KCrate, KDerive, KDisplay, KEnum, KId, KIs, KStep,
        KStruct, KU8, KU16, KU32, KU64, KU128, KUsize, ModPath, VerbatimUntil, Visibility,
    };

    pub(super) type AttributeIdBody = CommaDelimitedVec<IdAttribute>;

    unsynn! {
        pub(super) enum AttributeBody {
            Id {
                _id: KId,

                inner: ParenthesisGroupContaining<AttributeIdBody>
            },
            Any(Vec<TokenTree>)
        }

        pub(super) enum IdDerive {
            Step(KStep)
        }

        pub(super) enum IdDisplay {
            None(Bang),
            Format(TokenTree)
        }

        pub(super) enum IdAttribute {
            Crate {
                _crate: KCrate,
                _eq: Assign,
                path: ModPath
            },
            Const {
                _const: KConst
            },
            Derive {
                _derive: KDerive,

                traits: ParenthesisGroupContaining<CommaDelimitedVec<IdDerive>>
            },
            Display {
                _display: KDisplay,
                _eq: Assign,

                format: IdDisplay
            }
        }

        pub(super) enum RangeOp {
            Exclusive(DotDot),
            Inclusive(DotDotEq)
        }

        pub(super) enum StructScalar {
            U8(KU8),
            U16(KU16),
            U32(KU32),
            U64(KU64),
            U128(KU128),
            Usize(KUsize),
        }

        pub(super) struct StructBody {
            pub r#type: StructScalar,
            pub _is: KIs,

            pub start: VerbatimUntil<RangeOp>,
            pub op: RangeOp,
            pub end: Vec<AngleTokenTree>
        }

        pub(super) struct ParsedStruct {
            pub attributes: Vec<Attribute<AttributeBody>>,
            pub visibility: Visibility,

            pub _struct: KStruct,

            pub name: Ident,

            pub body: ParenthesisGroupContaining<StructBody>
        }

        pub(super) struct ParsedEnum {
            pub attributes: Vec<Attribute<AttributeBody>>,
            pub visibility: Visibility,

            pub _enum: KEnum,

            pub name: Ident,

            pub body: BraceGroupContaining<CommaDelimitedVec<UnitEnumVariant>>
        }

        /// Represents a variant of an enum, including the optional discriminant value
        pub(super) struct UnitEnumVariant {
            /// Attributes applied to the variant.
            pub attributes: Vec<Attribute<Vec<TokenTree>>>,
            /// The name of the variant.
            pub name: Ident,
        }

        pub(super) enum Parsed {
            Struct(ParsedStruct),
            Enum(ParsedEnum)
        }
    }
}

pub(crate) fn expand(attr: TokenStream, item: TokenStream) -> TokenStream {
    let (attributes, parsed) = match parse(attr, item) {
        Ok(parsed) => parsed,
        Err(error) => {
            if let Some(token) = error.failed_at() {
                emit_error(token.span(), error);

                return TokenStream::new();
            }

            // Unable to report a useful error (at a position)
            let value = Bridge(error.to_string());
            return quote!(compile_error!(#value));
        }
    };

    todo!()
}

fn parse(
    attr: TokenStream,
    item: TokenStream,
) -> Result<(Vec<grammar::IdAttribute>, grammar::Parsed), unsynn::Error> {
    let mut attr_tokens = attr.to_token_iter();
    let mut item_tokens = item.to_token_iter();

    let additional = grammar::AttributeIdBody::parse_all(&mut attr_tokens)?;
    let parsed = grammar::Parsed::parse_all(&mut item_tokens)?;

    Ok((additional.into(), parsed))
}

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
    let mut id_attributes = additional_attributes;
    let mut other_attributes = TokenStream::new();
    for attribute in attributes {
        match attribute.body.content {
            grammar::AttributeBody::Any(_) => {
                other_attributes.extend(attribute.into_token_stream());
            }
            grammar::AttributeBody::Id { _id: _, inner } => {
                id_attributes.extend(inner.content.into_iter().map(|attr| attr.value));
            }
        }
    }

    let krate = id_attributes
        .iter()
        .find_map(|attr| match attr {
            grammar::IdAttribute::Crate { _crate, _eq, path } => Some(quote!(#path)),
            grammar::IdAttribute::Derive { .. }
            | grammar::IdAttribute::Display { .. }
            | &grammar::IdAttribute::Const { .. } => None,
        })
        .unwrap_or_else(|| quote!(::hashql_core));

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

    let konst = if id_attributes
        .iter()
        .any(|attr| matches!(attr, grammar::IdAttribute::Const { .. }))
    {
        quote!(const)
    } else {
        TokenStream::new()
    };

    output.extend(quote! {
        #other_attributes
        #[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        #visibility struct #name {
            _internal_do_not_use: #inner_type
        }
    });

    output.extend(quote! {
        impl #name {
            /// Creates a new ID with the given value
            ///
            /// # Panics
            ///
            /// If the value is outside the valid range
            #[must_use]
            #visibility const fn new(value: #inner_type) -> Self {
                assert!(
                    value >= #min && value #max_cmp #max,
                    #assert_message
                );

                Self {
                    _internal_do_not_use: value,
                }
            }

            #[inline]
            #visibility const unsafe fn new_unchecked(value: #inner_type) -> Self {
                Self {
                    _internal_do_not_use: value,
                }
            }
        }

        impl #konst #krate::id::Id for $name {
            const MIN: Self = Self::new(#min);
            const MAX: Self = Self::new(#max);

            fn from_u32(value: u32) -> Self {
                // TODO: we must check that the value is indeed
            }

            fn from_u64(value: u64) -> Self {

            }

            fn from_usize(value: usize) -> Self {

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
                    None
                } else {
                    Some(unsafe { Self::new_unchecked(self._internal_do_not_use - 1) })
                }
            }
        }
    });

    todo!()
}

fn emit_error(span: Span, message: impl Display) {
    Diagnostic::spanned(span, Level::Error, message.to_string()).emit();
}
