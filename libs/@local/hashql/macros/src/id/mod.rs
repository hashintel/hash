mod attr;
pub(crate) mod common;
mod r#enum;
mod r#struct;

use proc_macro2::TokenStream;
use quote::quote;
use unsynn::{Parse as _, ToTokenIter as _};

use self::{r#enum::expand_enum, r#struct::expand_struct};
use crate::emit_error;

mod grammar {
    #![expect(clippy::result_large_err)]
    use unsynn::{
        Assign, Bang, BraceGroupContaining, CommaDelimitedVec, DotDot, DotDotEq, Ident,
        ParenthesisGroupContaining, TokenTree, unsynn,
    };

    use crate::grammar::{
        AngleTokenTree, Attribute, KConst, KCrate, KDerive, KDisplay, KEnum, KId, KIs, KStep,
        KStruct, KU8, KU16, KU32, KU64, KU128, ModPath, VerbatimUntil, Visibility,
    };

    pub(super) type AttributeIdBody = CommaDelimitedVec<IdAttribute>;

    unsynn! {
        /// Content of an `#[...]` attribute: either `#[id(...)]` or any other attribute.
        pub(super) enum AttributeBody {
            Id {
                _id: KId,

                inner: ParenthesisGroupContaining<AttributeIdBody>
            },
            Any(Vec<TokenTree>)
        }

        /// Traits that can appear inside `#[id(derive(...))]`.
        pub(super) enum IdDerive {
            Step(KStep)
        }

        /// The value after `display =`: either `!` (suppress) or a format string.
        pub(super) enum IdDisplay {
            None(Bang),
            Format(TokenTree)
        }

        /// A single key-value entry inside `#[id(...)]`.
        pub(super) enum IdAttribute {
            /// `crate = path`: overrides the path to `hashql_core` in generated code.
            Crate {
                _crate: KCrate,
                _eq: Assign,
                path: ModPath
            },
            /// `const`: makes generated trait impl blocks const.
            Const {
                _const: KConst
            },
            /// `derive(Step, ...)`: generates additional trait implementations.
            Derive {
                _derive: KDerive,

                traits: ParenthesisGroupContaining<CommaDelimitedVec<IdDerive>>
            },
            /// `display = "format"` or `display = !`: controls `Display` generation.
            Display {
                _display: KDisplay,
                _eq: Assign,

                format: IdDisplay
            }
        }

        /// The range operator in `start..end` or `start..=end`.
        pub(super) enum RangeOp {
            Inclusive(DotDotEq),
            Exclusive(DotDot)
        }

        /// The backing integer type in a struct body (`u8`, `u16`, ...).
        pub(super) enum StructScalar {
            U8(KU8),
            U16(KU16),
            U32(KU32),
            U64(KU64),
            U128(KU128),
        }

        /// The parenthesized body of a struct: `(u32 is 0..=MAX)`.
        pub(super) struct StructBody {
            pub r#type: StructScalar,
            pub _is: KIs,

            pub start: VerbatimUntil<RangeOp>,
            pub op: RangeOp,
            pub end: Vec<AngleTokenTree>
        }

        /// A complete struct definition for `define_id!`.
        pub(super) struct ParsedStruct {
            pub attributes: Vec<Attribute<AttributeBody>>,
            pub visibility: Option<Visibility>,

            pub _struct: KStruct,

            pub name: Ident,

            pub body: ParenthesisGroupContaining<StructBody>
        }

        /// A complete enum definition for `#[derive(Id)]`.
        pub(super) struct ParsedEnum {
            pub attributes: Vec<Attribute<AttributeBody>>,
            pub visibility: Option<Visibility>,

            pub _enum: KEnum,

            pub name: Ident,

            pub body: BraceGroupContaining<CommaDelimitedVec<UnitEnumVariant>>
        }

        /// A single unit variant with optional attributes.
        pub(super) struct UnitEnumVariant {
            pub attributes: Vec<Attribute<Vec<TokenTree>>>,
            pub name: Ident,
        }

        /// Dispatches between struct and enum so each entry point can reject
        /// the wrong shape with a helpful error message.
        pub(super) enum Parsed {
            Struct(ParsedStruct),
            Enum(ParsedEnum)
        }
    }
}

/// Entry point for the `#[derive(Id)]` derive macro (enum only).
pub(crate) fn expand_derive(item: TokenStream) -> TokenStream {
    let parsed = match parse(item) {
        Ok(parsed) => parsed,

        Err(error) => {
            if let Some(token) = error.failed_at() {
                emit_error(token.span().unwrap(), error);

                return TokenStream::new();
            }

            let message = error.to_string();
            return quote!(compile_error!(#message));
        }
    };

    match parsed {
        grammar::Parsed::Enum(parsed) => expand_enum(parsed),
        grammar::Parsed::Struct(parsed) => {
            emit_error(
                AsRef::<proc_macro2::Ident>::as_ref(&parsed._struct)
                    .span()
                    .unwrap(),
                "use `define_id!` for struct Id types; `#[derive(Id)]` only supports enums",
            );
            TokenStream::new()
        }
    }
}

/// Entry point for the `define_id!` function-like macro (struct only).
pub(crate) fn expand_define(item: TokenStream) -> TokenStream {
    let parsed = match parse(item) {
        Ok(parsed) => parsed,

        Err(error) => {
            if let Some(token) = error.failed_at() {
                emit_error(token.span().unwrap(), error);

                return TokenStream::new();
            }

            let message = error.to_string();
            return quote!(compile_error!(#message));
        }
    };

    match parsed {
        grammar::Parsed::Struct(parsed) => expand_struct(parsed),
        grammar::Parsed::Enum(parsed) => {
            emit_error(
                AsRef::<proc_macro2::Ident>::as_ref(&parsed._enum)
                    .span()
                    .unwrap(),
                "use `#[derive(Id)]` for enum Id types; `define_id!` only supports structs",
            );
            TokenStream::new()
        }
    }
}

#[expect(clippy::result_large_err)]
fn parse(item: TokenStream) -> Result<grammar::Parsed, unsynn::Error> {
    let mut tokens = item.to_token_iter();
    grammar::Parsed::parse_all(&mut tokens)
}
