use core::fmt::{self, Display};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, hashql_core::id::Id)]
#[id(const, display = !)]
#[repr(u8)]
pub enum SyntaxKind {
    // Syntactic JSON tokens (ordered for diagnostic display)
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

    // Trivia tokens
    Whitespace,
    /// Single-line `//` comment, excluding the terminating line break.
    LineComment,
    BlockComment,

    /// Malformed number or unrecognized input preserved for lossless recovery.
    InvalidToken,

    /// Document root, retaining leading and trailing trivia.
    Root,

    // Expression nodes
    PathExpr,
    CallExpr,
    PositionalArg,
    LabeledArg,
    LabeledArgEntry,
    ShorthandLabeledArg,

    // Data constructor nodes
    Literal,
    LiteralField,
    LiteralValue,

    Struct,
    StructField,
    StructBody,
    StructEntry,

    Tuple,
    TupleField,
    TupleBody,
    TupleElement,

    List,
    ListField,
    ListBody,
    ListElement,

    Dict,
    DictField,
    DictObjectBody,
    DictObjectEntry,
    DictArrayBody,
    DictArrayEntry,

    // Type annotation and recovery field nodes
    TypeField,
    TypeAnnotation,
    /// Unrecognized or duplicate field preserved inside a constructor object.
    UnknownField,

    // Generic JSON recovery nodes
    JsonObject,
    JsonField,
    JsonArray,
    JsonLiteral,

    Error,
}

impl SyntaxKind {
    /// Converts a raw Rowan kind tag into a [`SyntaxKind`].
    ///
    /// # Panics
    ///
    /// Panics if `raw` does not match a defined [`SyntaxKind`] discriminant.
    #[inline]
    #[must_use]
    pub const fn from_raw(raw: rowan::SyntaxKind) -> Self {
        assert!(raw.0 <= u8::MAX as u16, "invalid SyntaxKind raw value");

        #[expect(
            clippy::cast_possible_truncation,
            reason = "asserted above that raw.0 <= u8::MAX"
        )]
        Self::from_discriminant(raw.0 as u8)
    }

    #[inline]
    #[must_use]
    pub const fn is_trivia(self) -> bool {
        matches!(
            self,
            Self::Whitespace | Self::LineComment | Self::BlockComment
        )
    }

    #[inline]
    #[must_use]
    pub const fn is_token(self) -> bool {
        self.into_discriminant() < Self::Root.into_discriminant()
    }

    #[inline]
    #[must_use]
    pub const fn is_object_field(self) -> bool {
        matches!(
            self,
            Self::LiteralField
                | Self::StructField
                | Self::TupleField
                | Self::ListField
                | Self::DictField
                | Self::TypeField
                | Self::UnknownField
                | Self::StructEntry
                | Self::DictObjectEntry
                | Self::LabeledArgEntry
                | Self::JsonField
        )
    }

    #[inline]
    #[must_use]
    pub const fn is_array_container(self) -> bool {
        matches!(
            self,
            Self::CallExpr
                | Self::TupleBody
                | Self::ListBody
                | Self::DictArrayBody
                | Self::DictArrayEntry
                | Self::JsonArray
        )
    }
}

impl From<SyntaxKind> for rowan::SyntaxKind {
    #[inline]
    fn from(kind: SyntaxKind) -> Self {
        Self(u16::from(kind.into_discriminant()))
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
            Self::Whitespace => fmt.write_str("whitespace"),
            Self::LineComment => fmt.write_str("line comment"),
            Self::BlockComment => fmt.write_str("block comment"),
            Self::InvalidToken => fmt.write_str("invalid token"),
            Self::Root => fmt.write_str("root"),
            Self::PathExpr => fmt.write_str("path expression"),
            Self::CallExpr => fmt.write_str("call expression"),
            Self::PositionalArg => fmt.write_str("positional argument"),
            Self::LabeledArg => fmt.write_str("labeled argument"),
            Self::LabeledArgEntry => fmt.write_str("labeled argument entry"),
            Self::ShorthandLabeledArg => fmt.write_str("shorthand labeled argument"),
            Self::Literal | Self::JsonLiteral => fmt.write_str("literal"),
            Self::LiteralField => fmt.write_str("literal field"),
            Self::LiteralValue => fmt.write_str("literal value"),
            Self::Struct => fmt.write_str("struct"),
            Self::StructField => fmt.write_str("struct field"),
            Self::StructBody => fmt.write_str("struct body"),
            Self::StructEntry => fmt.write_str("struct entry"),
            Self::Tuple => fmt.write_str("tuple"),
            Self::TupleField => fmt.write_str("tuple field"),
            Self::TupleBody => fmt.write_str("tuple body"),
            Self::TupleElement => fmt.write_str("tuple element"),
            Self::List => fmt.write_str("list"),
            Self::ListField => fmt.write_str("list field"),
            Self::ListBody => fmt.write_str("list body"),
            Self::ListElement => fmt.write_str("list element"),
            Self::Dict => fmt.write_str("dict"),
            Self::DictField => fmt.write_str("dict field"),
            Self::DictObjectBody => fmt.write_str("dict object body"),
            Self::DictObjectEntry => fmt.write_str("dict object entry"),
            Self::DictArrayBody => fmt.write_str("dict array body"),
            Self::DictArrayEntry => fmt.write_str("dict array entry"),
            Self::TypeField => fmt.write_str("type field"),
            Self::TypeAnnotation => fmt.write_str("type annotation"),
            Self::UnknownField => fmt.write_str("unknown field"),
            Self::JsonObject => fmt.write_str("object"),
            Self::JsonField => fmt.write_str("object field"),
            Self::JsonArray => fmt.write_str("array"),
            Self::Error => fmt.write_str("error"),
        }
    }
}

#[expect(
    clippy::min_ident_chars,
    reason = "single-letter token macro matching rust-analyzer convention"
)]
macro_rules! T {
    ['{'] => {
        $crate::syntax_kind::SyntaxKind::LBrace
    };
    ['}'] => {
        $crate::syntax_kind::SyntaxKind::RBrace
    };
    ['['] => {
        $crate::syntax_kind::SyntaxKind::LBracket
    };
    [']'] => {
        $crate::syntax_kind::SyntaxKind::RBracket
    };
    [:] => {
        $crate::syntax_kind::SyntaxKind::Colon
    };
    [,] => {
        $crate::syntax_kind::SyntaxKind::Comma
    };
    [string] => {
        $crate::syntax_kind::SyntaxKind::String
    };
    [number] => {
        $crate::syntax_kind::SyntaxKind::Number
    };
    [true] => {
        $crate::syntax_kind::SyntaxKind::True
    };
    [false] => {
        $crate::syntax_kind::SyntaxKind::False
    };
    [null] => {
        $crate::syntax_kind::SyntaxKind::Null
    };
}

pub(crate) use T;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct JExprLanguage(!);

impl rowan::Language for JExprLanguage {
    type Kind = SyntaxKind;

    #[inline]
    fn kind_from_raw(raw: rowan::SyntaxKind) -> Self::Kind {
        SyntaxKind::from_raw(raw)
    }

    #[inline]
    fn kind_to_raw(kind: Self::Kind) -> rowan::SyntaxKind {
        kind.into()
    }
}

pub type SyntaxNode = rowan::SyntaxNode<JExprLanguage>;
pub type SyntaxToken = rowan::SyntaxToken<JExprLanguage>;
pub type SyntaxElement = rowan::SyntaxElement<JExprLanguage>;
pub type SyntaxNodeChildren = rowan::SyntaxNodeChildren<JExprLanguage>;
