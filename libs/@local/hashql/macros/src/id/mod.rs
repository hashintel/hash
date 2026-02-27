mod attr;
mod r#enum;
mod r#struct;

use core::fmt::Display;

use proc_macro::{Diagnostic, Level, Span};
use proc_macro2::TokenStream;
use unsynn::{Parse, ToTokenIter, ToTokens, quote};

use self::{r#enum::expand_enum, r#struct::expand_struct};

mod grammar {
    #![expect(clippy::result_large_err)]
    use unsynn::*;

    use crate::grammar::{
        AngleTokenTree, Attribute, KConst, KCrate, KDerive, KDisplay, KEnum, KId, KIs, KStep,
        KStruct, KU8, KU16, KU32, KU64, KU128, ModPath, VerbatimUntil, Visibility,
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
                emit_error(token.span().unwrap(), error);

                return TokenStream::new();
            }

            // Unable to report a useful error (at a position)
            let message = error.to_string();
            return quote!(compile_error!(#message));
        }
    };

    match parsed {
        grammar::Parsed::Struct(parsed) => expand_struct(attributes, parsed),
        grammar::Parsed::Enum(parsed) => expand_enum(attributes, parsed),
    }
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

fn emit_error(span: Span, message: impl Display) {
    Diagnostic::spanned(span, Level::Error, message.to_string()).emit();
}
