//! Syntax kinds and Rowan language definition for J-Expr.

use core::fmt::{self, Display};

use crate::lexer::{
    LexError, lex_block_comment, lex_invalid_word, lex_line_comment, lex_number, lex_string,
};

/// Token and node kinds in the lossless J-Expr concrete syntax tree.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, hashql_core::id::Id, logos::Logos,
)]
#[id(const, display = !)]
#[logos(error = LexError, extras = bool)]
#[repr(u8)]
pub enum SyntaxKind {
    // Syntactic JSON tokens (ordered for diagnostic display)
    /// JSON string literal, including its surrounding quotes.
    #[token("\"", lex_string)]
    String,
    /// JSON number literal (integer or floating-point).
    #[regex(r"[0-9-]", lex_number)]
    Number,
    /// Boolean literal `true`.
    #[token("true")]
    True,
    /// Boolean literal `false`.
    #[token("false")]
    False,
    /// Null literal `null`.
    #[token("null")]
    Null,
    /// Comma (`,`).
    #[token(",")]
    Comma,
    /// Colon (`:`).
    #[token(":")]
    Colon,
    /// Left brace (`{`).
    #[token("{")]
    LBrace,
    /// Right brace (`}`).
    #[token("}")]
    RBrace,
    /// Left bracket (`[`).
    #[token("[")]
    LBracket,
    /// Right bracket (`]`).
    #[token("]")]
    RBracket,

    // Trivia tokens
    /// Contiguous JSON whitespace (` `, `\t`, `\r`, `\n`, `\f`).
    #[regex(r"[ \t\r\n\f]+")]
    Whitespace,
    /// Single-line `//` comment extending up to the line break.
    #[token("//", lex_line_comment)]
    LineComment,
    /// Block `/* ... */` comment.
    #[token("/*", lex_block_comment)]
    BlockComment,

    // Lexer error token
    /// Malformed number or unrecognized character sequence preserved for lossless recovery.
    #[regex(r"[A-Za-z_][A-Za-z0-9_]*", lex_invalid_word)]
    InvalidToken,

    // Root node
    /// Root node wrapping a J-Expr document and its surrounding trivia.
    Root,

    // Expression nodes
    /// String path, field-access, index-access, or underscore expression.
    PathExpr,
    /// Array function-call expression (`[callee, arg1, ...]`).
    CallExpr,
    /// Positional argument in a [`SyntaxKind::CallExpr`].
    PositionalArg,
    /// Object-form labeled argument (`{":label": value}`) in a [`SyntaxKind::CallExpr`].
    LabeledArg,
    /// Key-value entry inside a [`SyntaxKind::LabeledArg`].
    LabeledArgEntry,
    /// Shorthand string labeled argument (`":label"`) in a [`SyntaxKind::CallExpr`].
    ShorthandLabeledArg,

    // Data constructor nodes
    /// `#literal` constructor object.
    Literal,
    /// `"#literal": <value>` field inside a [`SyntaxKind::Literal`].
    LiteralField,
    /// Primitive value inside a [`SyntaxKind::LiteralField`].
    LiteralValue,

    /// `#struct` constructor object.
    Struct,
    /// `"#struct": { ... }` field inside a [`SyntaxKind::Struct`].
    StructField,
    /// Object body of a [`SyntaxKind::StructField`].
    StructBody,
    /// Named field entry inside a [`SyntaxKind::StructBody`].
    StructEntry,

    /// `#tuple` constructor object.
    Tuple,
    /// `"#tuple": [ ... ]` field inside a [`SyntaxKind::Tuple`].
    TupleField,
    /// Array body of a [`SyntaxKind::TupleField`].
    TupleBody,
    /// Element inside a [`SyntaxKind::TupleBody`].
    TupleElement,

    /// `#list` constructor object.
    List,
    /// `"#list": [ ... ]` field inside a [`SyntaxKind::List`].
    ListField,
    /// Array body of a [`SyntaxKind::ListField`].
    ListBody,
    /// Element inside a [`SyntaxKind::ListBody`].
    ListElement,

    /// `#dict` constructor object.
    Dict,
    /// `"#dict": { ... } | [ ... ]` field inside a [`SyntaxKind::Dict`].
    DictField,
    /// Object-form body of a [`SyntaxKind::DictField`].
    DictObjectBody,
    /// Key-value entry inside a [`SyntaxKind::DictObjectBody`].
    DictObjectEntry,
    /// Array-of-pairs body of a [`SyntaxKind::DictField`].
    DictArrayBody,
    /// Pair entry (`[key, value]`) inside a [`SyntaxKind::DictArrayBody`].
    DictArrayEntry,

    // Type annotation and recovery field nodes
    /// `"#type": "..."` annotation field on a constructor object.
    TypeField,
    /// Type-expression string wrapper inside a [`SyntaxKind::TypeField`].
    TypeAnnotation,
    /// Unknown or duplicate field preserved inside a constructor object.
    UnknownField,

    // Generic JSON recovery nodes
    /// Plain JSON object preserved when an object is not a valid J-Expr constructor.
    JsonObject,
    /// Key-value field inside a [`SyntaxKind::JsonObject`].
    JsonField,
    /// Plain JSON array preserved during error recovery.
    JsonArray,
    /// Plain JSON scalar literal preserved during error recovery.
    JsonLiteral,

    /// Unrecognized or structurally malformed syntax wrapped for error recovery.
    Error,
}

impl SyntaxKind {
    /// Converts a raw [`rowan::SyntaxKind`] discriminant into a [`SyntaxKind`].
    ///
    /// # Panics
    ///
    /// Panics if `raw` does not correspond to a defined [`SyntaxKind`] variant.
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

    /// Reports whether this kind is trivia (whitespace or comment).
    #[inline]
    #[must_use]
    pub const fn is_trivia(self) -> bool {
        matches!(
            self,
            Self::Whitespace | Self::LineComment | Self::BlockComment
        )
    }

    /// Reports whether this kind is a token rather than a composite node.
    #[inline]
    #[must_use]
    pub const fn is_token(self) -> bool {
        self.into_discriminant() < Self::Root.into_discriminant()
    }

    /// Reports whether this node kind is a key-value entry inside a JSON object.
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

    /// Reports whether this node kind is a JSON array container whose child nodes are indexed
    /// elements.
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

/// Maps a J-Expr token spelling to its [`SyntaxKind`].
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

/// Rowan language tag for J-Expr syntax trees.
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

/// Red-tree syntax node specialized for [`JExprLanguage`].
pub type SyntaxNode = rowan::SyntaxNode<JExprLanguage>;

/// Red-tree syntax token specialized for [`JExprLanguage`].
pub type SyntaxToken = rowan::SyntaxToken<JExprLanguage>;

/// Red-tree syntax node or token specialized for [`JExprLanguage`].
pub type SyntaxElement = rowan::SyntaxElement<JExprLanguage>;

/// Iterator over child [`SyntaxNode`]s specialized for [`JExprLanguage`].
pub type SyntaxNodeChildren = rowan::SyntaxNodeChildren<JExprLanguage>;
