//! Borrowed concrete syntax tree views over Rowan green nodes.
//!
//! Each wrapper pairs a borrowed [`GreenNodeData`] or [`GreenTokenData`] with its byte offset from
//! the document start so traversal, lowering, and JSON Pointer resolution avoid red-tree
//! allocation.

use core::{fmt, marker::PhantomData};

use rowan::{GreenNodeData, GreenTokenData, NodeOrToken};
use text_size::{TextRange, TextSize};

use crate::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet};

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

#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SyntaxNodeData<'tree> {
    pub data: &'tree GreenNodeData,
    pub offset: TextSize,
}

impl<'tree> SyntaxNodeData<'tree> {
    #[inline]
    #[must_use]
    pub(crate) fn kind(self) -> SyntaxKind {
        SyntaxKind::from_raw(self.data.kind())
    }

    #[inline]
    #[must_use]
    pub fn text_range(self) -> TextRange {
        TextRange::at(self.offset, self.data.text_len())
    }

    pub fn children_with_tokens(
        self,
    ) -> impl Iterator<Item = NodeOrToken<Self, SyntaxTokenData<'tree>>> + 'tree {
        let mut offset = self.offset;
        self.data.children().map(move |child| {
            let child_offset = offset;
            offset += child.text_len();
            match child {
                NodeOrToken::Node(node) => NodeOrToken::Node(Self {
                    data: node,
                    offset: child_offset,
                }),
                NodeOrToken::Token(token) => {
                    NodeOrToken::Token(SyntaxTokenData::new(token, child_offset))
                }
            }
        })
    }

    pub fn children(self) -> impl Iterator<Item = Self> + 'tree {
        self.children_with_tokens()
            .filter_map(NodeOrToken::into_node)
    }

    pub fn tokens(self) -> impl Iterator<Item = SyntaxTokenData<'tree>> + 'tree {
        self.children_with_tokens()
            .filter_map(NodeOrToken::into_token)
    }

    #[must_use]
    pub fn child_node<N: Node<'tree>>(self) -> Option<N> {
        self.children().find_map(N::cast)
    }

    pub fn child_nodes<N: Node<'tree>>(self) -> impl Iterator<Item = N> + use<'tree, N> {
        self.children().filter_map(N::cast)
    }

    #[must_use]
    pub fn first_token<T: Token<'tree>>(self) -> Option<T> {
        self.tokens().find_map(T::cast)
    }
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SyntaxTokenData<'tree> {
    data: &'tree GreenTokenData,
    offset: TextSize,
}

impl Eq for SyntaxTokenData<'_> {}

impl<'tree> SyntaxTokenData<'tree> {
    #[inline]
    #[must_use]
    pub const fn new(data: &'tree GreenTokenData, offset: TextSize) -> Self {
        Self { data, offset }
    }

    #[inline]
    #[must_use]
    pub const fn green(self) -> &'tree GreenTokenData {
        self.data
    }

    #[inline]
    #[must_use]
    pub const fn offset(self) -> TextSize {
        self.offset
    }

    #[inline]
    #[must_use]
    pub fn kind(self) -> SyntaxKind {
        SyntaxKind::from_raw(self.data.kind())
    }

    #[inline]
    #[must_use]
    pub fn text_range(self) -> TextRange {
        TextRange::at(self.offset, self.data.text_len())
    }

    #[inline]
    #[must_use]
    pub fn text(self) -> &'tree str {
        self.data.text()
    }
}

pub trait Node<'tree>: Copy {
    const SYNTAX_KINDS: SyntaxKindSet;

    #[must_use]
    fn cast(syntax: SyntaxNodeData<'tree>) -> Option<Self>;

    #[must_use]
    fn syntax(self) -> SyntaxNodeData<'tree>;

    #[inline]
    #[must_use]
    fn green(self) -> &'tree GreenNodeData {
        &self.syntax().data
    }

    #[inline]
    #[must_use]
    fn offset(self) -> TextSize {
        self.syntax().offset
    }

    #[inline]
    #[must_use]
    fn kind(self) -> SyntaxKind {
        self.syntax().kind()
    }

    #[inline]
    #[must_use]
    fn text_range(self) -> TextRange {
        self.syntax().text_range()
    }
}

pub trait Token<'tree>: Copy {
    const SYNTAX_KINDS: SyntaxKindSet;

    #[must_use]
    fn cast(syntax: SyntaxTokenData<'tree>) -> Option<Self>;

    #[must_use]
    fn syntax(self) -> SyntaxTokenData<'tree>;

    #[inline]
    #[must_use]
    fn green(self) -> &'tree GreenTokenData {
        self.syntax().green()
    }

    #[inline]
    #[must_use]
    fn offset(self) -> TextSize {
        self.syntax().offset()
    }

    #[inline]
    #[must_use]
    fn kind(self) -> SyntaxKind {
        self.syntax().kind()
    }

    #[inline]
    #[must_use]
    fn text_range(self) -> TextRange {
        self.syntax().text_range()
    }

    #[inline]
    #[must_use]
    fn text(self) -> &'tree str {
        self.syntax().text()
    }
}

pub struct SyntaxNode<'tree, K> {
    data: SyntaxNodeData<'tree>,
    _kind: PhantomData<fn() -> K>,
}

impl<'tree, K: NodeKind> Node<'tree> for SyntaxNode<'tree, K> {
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_slice(&[K::KIND]);

    #[inline]
    fn cast(syntax: SyntaxNodeData<'tree>) -> Option<Self> {
        Self::SYNTAX_KINDS.contains(syntax.kind()).then_some(Self {
            data: syntax,
            _kind: PhantomData,
        })
    }

    #[inline]
    fn syntax(self) -> SyntaxNodeData<'tree> {
        self.data
    }
}

impl<K: NodeKind> fmt::Debug for SyntaxNode<'_, K> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct(K::NAME)
            .field("syntax", &self.data)
            .finish()
    }
}

impl<K> Copy for SyntaxNode<'_, K> {}

impl<K> Clone for SyntaxNode<'_, K> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<K> PartialEq for SyntaxNode<'_, K> {
    fn eq(&self, other: &Self) -> bool {
        self.data == other.data
    }
}

impl<K> Eq for SyntaxNode<'_, K> {}

pub struct SyntaxToken<'tree, K> {
    syntax: SyntaxTokenData<'tree>,
    _kind: PhantomData<fn() -> K>,
}

impl<'tree, K: TokenKind> Token<'tree> for SyntaxToken<'tree, K> {
    const SYNTAX_KINDS: SyntaxKindSet = K::SYNTAX_KINDS;

    #[inline]
    fn cast(syntax: SyntaxTokenData<'tree>) -> Option<Self> {
        Self::SYNTAX_KINDS.contains(syntax.kind()).then_some(Self {
            syntax,
            _kind: PhantomData,
        })
    }

    #[inline]
    fn syntax(self) -> SyntaxTokenData<'tree> {
        self.syntax
    }
}

impl<K: TokenKind> fmt::Debug for SyntaxToken<'_, K> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct(K::NAME)
            .field("syntax", &self.syntax)
            .finish()
    }
}

impl<K> Copy for SyntaxToken<'_, K> {}

impl<K> Clone for SyntaxToken<'_, K> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<K> PartialEq for SyntaxToken<'_, K> {
    fn eq(&self, other: &Self) -> bool {
        self.syntax == other.syntax
    }
}

impl<K> Eq for SyntaxToken<'_, K> {}

/// Associates an owned [`Document`](crate::Document) root marker with its borrowed CST item type.
pub trait TreeRoot {
    type Item<'tree>: Node<'tree>;
}

pub struct ExprRoot(!);

impl TreeRoot for ExprRoot {
    type Item<'tree> = Expr<'tree>;
}

pub type Root<'tree, T> = SyntaxNode<'tree, kind::Root<T>>;

impl<'tree, T> Root<'tree, T> {
    // Document::new establishes that the root green node has kind SyntaxKind::Root.
    #[inline]
    pub(crate) fn from_root(green: &'tree GreenNodeData) -> Self {
        debug_assert_eq!(SyntaxKind::from_raw(green.kind()), SyntaxKind::Root);

        Self {
            data: SyntaxNodeData {
                data: green,
                offset: TextSize::new(0),
            },
            _kind: PhantomData,
        }
    }
}

impl<'tree, T> Root<'tree, T>
where
    T: Node<'tree>,
{
    #[must_use]
    pub fn item(self) -> Option<T> {
        self.data.child_node()
    }
}

pub type TypeField<'tree> = SyntaxNode<'tree, kind::TypeField>;

impl<'tree> TypeField<'tree> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }

    #[must_use]
    pub fn annotation(self) -> Option<TypeAnnotation<'tree>> {
        self.data.child_node()
    }
}

pub type TypeAnnotation<'tree> = SyntaxNode<'tree, kind::TypeAnnotation>;

impl<'tree> TypeAnnotation<'tree> {
    #[must_use]
    pub fn token(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }
}

pub type UnknownField<'tree> = SyntaxNode<'tree, kind::UnknownField>;

impl<'tree> UnknownField<'tree> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }
}
