//! Typed concrete syntax tree wrappers borrowing immutable Rowan green nodes directly.

use core::{fmt, marker::PhantomData};

use rowan::{GreenNodeData, GreenTokenData, NodeOrToken};
use text_size::{TextRange, TextSize};

use crate::syntax_kind::SyntaxKind;

mod constructor;
mod dict;
mod expr;
pub mod kind;
mod token;

pub use self::{
    constructor::{
        List, ListBody, ListElement, ListField, Literal, LiteralField, LiteralValue, Struct,
        StructBody, StructEntry, StructField, Tuple, TupleBody, TupleElement, TupleField,
    },
    dict::{
        Dict, DictArrayBody, DictArrayEntry, DictBody, DictField, DictObjectBody, DictObjectEntry,
    },
    expr::{
        CallArg, CallExpr, Expr, LabeledArg, LabeledArgEntry, PathExpr, PositionalArg,
        ShorthandLabeledArg,
    },
    kind::{NodeKind, TokenKind},
    token::{BoolToken, LiteralToken, NullToken, NumberToken, StringToken},
};

/// Borrowed green syntax node paired with its byte offset from the start of the source document.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SyntaxNode<'tree> {
    green: &'tree GreenNodeData,
    offset: TextSize,
}

impl Eq for SyntaxNode<'_> {}

impl<'tree> SyntaxNode<'tree> {
    /// Creates a syntax node view over `green` at `offset`.
    #[inline]
    #[must_use]
    pub const fn new(green: &'tree GreenNodeData, offset: TextSize) -> Self {
        Self { green, offset }
    }

    /// Returns the underlying immutable Rowan green node.
    #[inline]
    #[must_use]
    pub const fn green(self) -> &'tree GreenNodeData {
        self.green
    }

    /// Returns the byte offset of this node from the start of the source document.
    #[inline]
    #[must_use]
    pub const fn offset(self) -> TextSize {
        self.offset
    }

    /// Returns the [`SyntaxKind`] of this node.
    #[inline]
    #[must_use]
    pub fn kind(self) -> SyntaxKind {
        SyntaxKind::from_raw(self.green.kind())
    }

    /// Returns the source byte range covered by this node.
    #[inline]
    #[must_use]
    pub fn text_range(self) -> TextRange {
        TextRange::at(self.offset, self.green.text_len())
    }

    /// Returns an iterator over all direct child nodes and tokens with their document offsets.
    pub fn children_with_tokens(
        self,
    ) -> impl Iterator<Item = NodeOrToken<Self, SyntaxToken<'tree>>> + 'tree {
        let mut offset = self.offset;
        self.green.children().map(move |child| {
            let child_offset = offset;
            offset += child.text_len();
            match child {
                NodeOrToken::Node(node) => NodeOrToken::Node(Self::new(node, child_offset)),
                NodeOrToken::Token(token) => {
                    NodeOrToken::Token(SyntaxToken::new(token, child_offset))
                }
            }
        })
    }

    /// Returns an iterator over all direct child nodes with their document offsets.
    pub fn children(self) -> impl Iterator<Item = Self> + 'tree {
        self.children_with_tokens()
            .filter_map(NodeOrToken::into_node)
    }

    /// Returns an iterator over all direct child tokens with their document offsets.
    pub fn tokens(self) -> impl Iterator<Item = SyntaxToken<'tree>> + 'tree {
        self.children_with_tokens()
            .filter_map(NodeOrToken::into_token)
    }

    /// Returns the first direct child node that casts to `N`.
    #[must_use]
    pub fn child_node<N: Node<'tree>>(self) -> Option<N> {
        self.children().find_map(N::cast)
    }

    /// Returns an iterator over all direct child nodes that cast to `N`.
    pub fn child_nodes<N: Node<'tree>>(self) -> impl Iterator<Item = N> + use<'tree, N> {
        self.children().filter_map(N::cast)
    }

    /// Returns the first direct child token that casts to `T`.
    #[must_use]
    pub fn first_token<T: Token<'tree>>(self) -> Option<T> {
        self.tokens().find_map(T::cast)
    }
}

/// Borrowed green syntax token paired with its byte offset from the start of the source document.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SyntaxToken<'tree> {
    green: &'tree GreenTokenData,
    offset: TextSize,
}

impl Eq for SyntaxToken<'_> {}

impl<'tree> SyntaxToken<'tree> {
    /// Creates a syntax token view over `green` at `offset`.
    #[inline]
    #[must_use]
    pub const fn new(green: &'tree GreenTokenData, offset: TextSize) -> Self {
        Self { green, offset }
    }

    /// Returns the underlying immutable Rowan green token.
    #[inline]
    #[must_use]
    pub const fn green(self) -> &'tree GreenTokenData {
        self.green
    }

    /// Returns the byte offset of this token from the start of the source document.
    #[inline]
    #[must_use]
    pub const fn offset(self) -> TextSize {
        self.offset
    }

    /// Returns the [`SyntaxKind`] of this token.
    #[inline]
    #[must_use]
    pub fn kind(self) -> SyntaxKind {
        SyntaxKind::from_raw(self.green.kind())
    }

    /// Returns the source byte range covered by this token.
    #[inline]
    #[must_use]
    pub fn text_range(self) -> TextRange {
        TextRange::at(self.offset, self.green.text_len())
    }

    /// Returns the raw source text of this token.
    #[inline]
    #[must_use]
    pub fn text(self) -> &'tree str {
        self.green.text()
    }
}

/// Typed wrapper over a borrowed [`SyntaxNode`].
pub trait Node<'tree>: Copy {
    /// Reports whether a node of `kind` can be cast to `Self`.
    #[must_use]
    fn can_cast(kind: SyntaxKind) -> bool;

    /// Casts a borrowed [`SyntaxNode`] into `Self` when its kind matches.
    #[must_use]
    fn cast(syntax: SyntaxNode<'tree>) -> Option<Self>;

    /// Returns the underlying untyped [`SyntaxNode`].
    #[must_use]
    fn syntax(self) -> SyntaxNode<'tree>;

    /// Returns the underlying immutable green node.
    #[inline]
    #[must_use]
    fn green(self) -> &'tree GreenNodeData {
        self.syntax().green()
    }

    /// Returns the byte offset of this node from the start of the source document.
    #[inline]
    #[must_use]
    fn offset(self) -> TextSize {
        self.syntax().offset()
    }

    /// Returns the [`SyntaxKind`] of this node.
    #[inline]
    #[must_use]
    fn kind(self) -> SyntaxKind {
        self.syntax().kind()
    }

    /// Returns the source byte range covered by this node.
    #[inline]
    #[must_use]
    fn text_range(self) -> TextRange {
        self.syntax().text_range()
    }
}

/// Typed wrapper over a borrowed [`SyntaxToken`].
pub trait Token<'tree>: Copy {
    /// Reports whether a token of `kind` can be cast to `Self`.
    #[must_use]
    fn can_cast(kind: SyntaxKind) -> bool;

    /// Casts a borrowed [`SyntaxToken`] into `Self` when its kind matches.
    #[must_use]
    fn cast(syntax: SyntaxToken<'tree>) -> Option<Self>;

    /// Returns the underlying untyped [`SyntaxToken`].
    #[must_use]
    fn syntax(self) -> SyntaxToken<'tree>;

    /// Returns the underlying immutable green token.
    #[inline]
    #[must_use]
    fn green(self) -> &'tree GreenTokenData {
        self.syntax().green()
    }

    /// Returns the byte offset of this token from the start of the source document.
    #[inline]
    #[must_use]
    fn offset(self) -> TextSize {
        self.syntax().offset()
    }

    /// Returns the [`SyntaxKind`] of this token.
    #[inline]
    #[must_use]
    fn kind(self) -> SyntaxKind {
        self.syntax().kind()
    }

    /// Returns the source byte range covered by this token.
    #[inline]
    #[must_use]
    fn text_range(self) -> TextRange {
        self.syntax().text_range()
    }

    /// Returns the raw source text of this token.
    #[inline]
    #[must_use]
    fn text(self) -> &'tree str {
        self.syntax().text()
    }
}

/// Typed CST node parameterized by its [`NodeKind`] marker `K`.
pub struct TypedNode<'tree, K> {
    syntax: SyntaxNode<'tree>,
    _kind: PhantomData<fn() -> K>,
}

impl<K: NodeKind> fmt::Debug for TypedNode<'_, K> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct(K::NAME)
            .field("syntax", &self.syntax)
            .finish()
    }
}

impl<K> Copy for TypedNode<'_, K> {}

impl<K> Clone for TypedNode<'_, K> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<K> PartialEq for TypedNode<'_, K> {
    fn eq(&self, other: &Self) -> bool {
        self.syntax == other.syntax
    }
}

impl<K> Eq for TypedNode<'_, K> {}

impl<'tree, K: NodeKind> Node<'tree> for TypedNode<'tree, K> {
    #[inline]
    fn can_cast(kind: SyntaxKind) -> bool {
        kind == K::KIND
    }

    #[inline]
    fn cast(syntax: SyntaxNode<'tree>) -> Option<Self> {
        Self::can_cast(syntax.kind()).then_some(Self {
            syntax,
            _kind: PhantomData,
        })
    }

    #[inline]
    fn syntax(self) -> SyntaxNode<'tree> {
        self.syntax
    }
}

/// Typed CST token parameterized by its [`TokenKind`] marker `K`.
pub struct TypedToken<'tree, K> {
    syntax: SyntaxToken<'tree>,
    _kind: PhantomData<fn() -> K>,
}

impl<K: TokenKind> fmt::Debug for TypedToken<'_, K> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct(K::NAME)
            .field("syntax", &self.syntax)
            .finish()
    }
}

impl<K> Copy for TypedToken<'_, K> {}

impl<K> Clone for TypedToken<'_, K> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<K> PartialEq for TypedToken<'_, K> {
    fn eq(&self, other: &Self) -> bool {
        self.syntax == other.syntax
    }
}

impl<K> Eq for TypedToken<'_, K> {}

impl<'tree, K: TokenKind> Token<'tree> for TypedToken<'tree, K> {
    #[inline]
    fn can_cast(kind: SyntaxKind) -> bool {
        K::can_cast(kind)
    }

    #[inline]
    fn cast(syntax: SyntaxToken<'tree>) -> Option<Self> {
        Self::can_cast(syntax.kind()).then_some(Self {
            syntax,
            _kind: PhantomData,
        })
    }

    #[inline]
    fn syntax(self) -> SyntaxToken<'tree> {
        self.syntax
    }
}

/// Type-level marker connecting an owned [`Parse`](crate::Parse) to its borrowed root CST item.
pub trait TreeRoot {
    /// Borrowed CST node yielded by [`Root::item`] for a tree with lifetime `'tree`.
    type Item<'tree>: Node<'tree>;
}

/// Root marker for a J-Expr expression document yielding [`Expr`] items.
pub struct ExprRoot(!);

impl TreeRoot for ExprRoot {
    type Item<'tree> = Expr<'tree>;
}

/// Root syntax node parameterized by the top-level item wrapper `T`.
pub type Root<'tree, T> = TypedNode<'tree, kind::Root<T>>;

impl<'tree, T> Root<'tree, T> {
    /// Constructs a [`Root`] from a [`SyntaxKind::Root`] green node at offset zero.
    // Parse::new establishes that the root green node has kind SyntaxKind::Root.
    pub(crate) fn from_root(green: &'tree GreenNodeData) -> Self {
        debug_assert_eq!(SyntaxKind::from_raw(green.kind()), SyntaxKind::Root);
        Self {
            syntax: SyntaxNode::new(green, TextSize::new(0)),
            _kind: PhantomData,
        }
    }
}

impl<'tree, T: Node<'tree>> Root<'tree, T> {
    /// Returns the root item inside this document, if one was parsed.
    #[must_use]
    pub fn item(self) -> Option<T> {
        self.syntax.child_node()
    }
}

/// `"#type": "..."` annotation field inside a constructor object.
pub type TypeField<'tree> = TypedNode<'tree, kind::TypeField>;

impl<'tree> TypeField<'tree> {
    /// Returns the `"#type"` key token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }

    /// Returns the [`TypeAnnotation`] value node.
    #[must_use]
    pub fn annotation(self) -> Option<TypeAnnotation<'tree>> {
        self.syntax.child_node()
    }
}

/// Type-expression string wrapper inside a [`TypeField`].
pub type TypeAnnotation<'tree> = TypedNode<'tree, kind::TypeAnnotation>;

impl<'tree> TypeAnnotation<'tree> {
    /// Returns the type string token.
    #[must_use]
    pub fn token(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }
}

/// Unknown or duplicate field preserved inside a constructor object.
pub type UnknownField<'tree> = TypedNode<'tree, kind::UnknownField>;

impl<'tree> UnknownField<'tree> {
    /// Returns the field key string token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }
}
