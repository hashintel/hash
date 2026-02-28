use core::fmt;

use proc_macro2::{Ident, Span, TokenStream};
use quote::ToTokens;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum IntegerScalar {
    U8,
    U16,
    U32,
    U64,
    U128,
}

impl IntegerScalar {
    pub(crate) const fn from_variant_count(count: usize) -> Self {
        match count {
            0..=0xFF => Self::U8,
            0x100..=0xFFFF => Self::U16,
            0x1_0000..=0xFFFF_FFFF => Self::U32,
            _ => Self::U64,
        }
    }
}

impl fmt::Display for IntegerScalar {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::U8 => "u8",
            Self::U16 => "u16",
            Self::U32 => "u32",
            Self::U64 => "u64",
            Self::U128 => "u128",
        })
    }
}

impl ToTokens for IntegerScalar {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let ident = match self {
            Self::U8 => Ident::new("u8", Span::call_site()),
            Self::U16 => Ident::new("u16", Span::call_site()),
            Self::U32 => Ident::new("u32", Span::call_site()),
            Self::U64 => Ident::new("u64", Span::call_site()),
            Self::U128 => Ident::new("u128", Span::call_site()),
        };

        tokens.extend([ident]);
    }
}
