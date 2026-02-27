mod attr;
mod r#enum;
mod r#struct;

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

fn scalar_rank(scalar: &grammar::StructScalar) -> u32 {
    match scalar {
        grammar::StructScalar::U8(_) => u8::BITS,
        grammar::StructScalar::U16(_) => u16::BITS,
        grammar::StructScalar::U32(_) => u32::BITS,
        grammar::StructScalar::Usize(_) => usize::BITS,
        grammar::StructScalar::U64(_) => u64::BITS,
        grammar::StructScalar::U128(_) => u128::BITS,
    }
}

fn param_scalar(name: &str) -> grammar::StructScalar {
    use unsynn::ToTokenIter;
    let ts: TokenStream = name.parse().unwrap();
    let mut iter = ts.to_token_iter();
    unsynn::Parse::parse(&mut iter).unwrap()
}

fn emit_error(span: Span, message: impl Display) {
    Diagnostic::spanned(span, Level::Error, message.to_string()).emit();
}
