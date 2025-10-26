use core::fmt::{self, Display};

use super::token_kind::TokenKind;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum SyntaxKind {
    String,
    Number,
    True,
    False,
    Null,
    Comma,
    Colon,
    LBrace,
    RBrace,
    LBracket,
    RBracket,
}

// Using not a constant, but a function here makes it so that any addition of a variant results in a
// compile error
const VARIANT_COUNT: usize = core::mem::variant_count::<SyntaxKind>();
pub(crate) type Flag = u16;

const VARIANTS: [SyntaxKind; VARIANT_COUNT] = [
    SyntaxKind::String,
    SyntaxKind::Number,
    SyntaxKind::True,
    SyntaxKind::False,
    SyntaxKind::Null,
    SyntaxKind::Comma,
    SyntaxKind::Colon,
    SyntaxKind::LBrace,
    SyntaxKind::RBrace,
    SyntaxKind::LBracket,
    SyntaxKind::RBracket,
];

// In theory the array generated here is the same as the one above - the only difference is that we
// compile time assert the correct order.
#[expect(clippy::cast_possible_truncation)]
const VARIANT_LOOKUP: [SyntaxKind; VARIANT_COUNT] = {
    let mut lookup = [SyntaxKind::String; VARIANT_COUNT];

    let mut index = 0;
    while index < VARIANT_COUNT {
        let kind = VARIANTS[index];

        // Ensure that every variant value is unique and in ascending order
        assert!(
            kind.into_exponent() == index as u32,
            "variant values must be unique and in ascending order"
        );

        // Ensure that every variant fits into the exponent representation
        assert!(
            kind.into_exponent() <= Flag::BITS,
            "variant exponent must fit into a `Flag`"
        );

        lookup[index] = kind;
        index += 1;
    }

    lookup
};

impl SyntaxKind {
    pub(crate) const VARIANTS: &[Self] = &VARIANT_LOOKUP;

    pub(crate) const fn into_exponent(self) -> u32 {
        self as u32
    }

    pub(crate) const fn into_flag(self) -> Flag {
        1 << self.into_exponent()
    }

    #[expect(clippy::cast_possible_truncation)]
    pub(crate) const fn from_exponent(value: u32) -> Self {
        assert!(value < VARIANT_COUNT as u32, "invalid index");

        Self::VARIANTS[value as usize]
    }
}

impl From<&TokenKind<'_>> for SyntaxKind {
    fn from(token: &TokenKind<'_>) -> Self {
        match token {
            TokenKind::Bool(true) => Self::True,
            TokenKind::Bool(false) => Self::False,
            TokenKind::Null => Self::Null,
            TokenKind::LBrace => Self::LBrace,
            TokenKind::RBrace => Self::RBrace,
            TokenKind::LBracket => Self::LBracket,
            TokenKind::RBracket => Self::RBracket,
            TokenKind::Colon => Self::Colon,
            TokenKind::Comma => Self::Comma,
            TokenKind::Number(_) => Self::Number,
            TokenKind::String(_) => Self::String,
        }
    }
}

impl Display for SyntaxKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::String => fmt.write_str("string"),
            Self::Number => fmt.write_str("number"),
            Self::True => fmt.write_str("`true`"),
            Self::False => fmt.write_str("`false`"),
            Self::Null => fmt.write_str("`null`"),
            Self::Comma => fmt.write_str("`,`"),
            Self::Colon => fmt.write_str("`:`"),
            Self::LBrace => fmt.write_str("`{`"),
            Self::RBrace => fmt.write_str("`}`"),
            Self::LBracket => fmt.write_str("`[`"),
            Self::RBracket => fmt.write_str("`]`"),
        }
    }
}
