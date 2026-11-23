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
pub(crate) mod kind;
mod token;

pub(crate) use self::{
    constructor::{List, ListBody, Literal, LiteralValue, Struct, StructBody, Tuple, TupleBody},
    dict::{Dict, DictArrayBody, DictBody, DictObjectBody},
    expr::{CallArg, CallExpr, Expr, LabeledArgEntry, PathExpr, ShorthandLabeledArg},
    kind::{NodeKind, TokenKind},
    token::{LiteralToken, StringToken},
};

#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SyntaxTokenData<'tree> {
    data: &'tree GreenTokenData,
    offset: TextSize,
}

impl<'tree> SyntaxTokenData<'tree> {
    #[inline]
    #[must_use]
    pub(crate) const fn new(data: &'tree GreenTokenData, offset: TextSize) -> Self {
        Self { data, offset }
    }

    #[inline]
    #[must_use]
    pub(crate) fn kind(self) -> SyntaxKind {
        SyntaxKind::from_raw(self.data.kind())
    }

    #[inline]
    #[must_use]
    pub(crate) fn text_range(self) -> TextRange {
        TextRange::at(self.offset, self.data.text_len())
    }

    #[inline]
    #[must_use]
    pub(crate) fn text(self) -> &'tree str {
        self.data.text()
    }

    #[inline]
    #[must_use]
    pub(crate) const fn green(self) -> &'tree GreenTokenData {
        self.data
    }
}

impl Eq for SyntaxTokenData<'_> {}

pub(crate) trait Token<'tree>: Copy {
    const SYNTAX_KINDS: SyntaxKindSet;

    #[must_use]
    fn cast(syntax: SyntaxTokenData<'tree>) -> Option<Self>;

    #[must_use]
    fn syntax(self) -> SyntaxTokenData<'tree>;

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

pub(crate) struct SyntaxToken<'tree, K> {
    syntax: SyntaxTokenData<'tree>,
    _kind: PhantomData<fn() -> K>,
}

impl<'tree, K> Token<'tree> for SyntaxToken<'tree, K>
where
    K: TokenKind,
{
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

impl<K> fmt::Debug for SyntaxToken<'_, K>
where
    K: TokenKind,
{
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

#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SyntaxNodeData<'tree> {
    pub data: &'tree GreenNodeData,
    pub offset: TextSize,
}

pub(crate) trait Node<'tree>: Copy {
    const SYNTAX_KINDS: SyntaxKindSet;

    #[must_use]
    fn cast(syntax: SyntaxNodeData<'tree>) -> Option<Self>;

    #[must_use]
    fn syntax(self) -> SyntaxNodeData<'tree>;

    #[cfg(test)] // Consumed by lossless round-trip assertions in crate tests.
    #[inline]
    #[must_use]
    fn green(self) -> &'tree GreenNodeData {
        self.syntax().data
    }

    #[inline]
    #[must_use]
    fn offset(self) -> TextSize {
        self.syntax().offset
    }

    #[inline]
    #[must_use]
    fn text_range(self) -> TextRange {
        self.syntax().text_range()
    }
}

impl<'tree> SyntaxNodeData<'tree> {
    #[inline]
    #[must_use]
    pub(crate) fn kind(self) -> SyntaxKind {
        SyntaxKind::from_raw(self.data.kind())
    }

    #[inline]
    #[must_use]
    pub(crate) fn text_range(self) -> TextRange {
        TextRange::at(self.offset, self.data.text_len())
    }

    pub(crate) fn children_with_tokens(
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

    pub(crate) fn children(self) -> impl Iterator<Item = Self> + 'tree {
        self.children_with_tokens()
            .filter_map(NodeOrToken::into_node)
    }

    pub(crate) fn tokens(self) -> impl Iterator<Item = SyntaxTokenData<'tree>> + 'tree {
        self.children_with_tokens()
            .filter_map(NodeOrToken::into_token)
    }

    #[must_use]
    pub(crate) fn child_node<N>(self) -> Option<N>
    where
        N: Node<'tree>,
    {
        self.children().find_map(N::cast)
    }

    pub(crate) fn child_nodes<N>(self) -> impl Iterator<Item = N> + use<'tree, N>
    where
        N: Node<'tree>,
    {
        self.children().filter_map(N::cast)
    }

    #[must_use]
    pub(crate) fn first_token<T>(self) -> Option<T>
    where
        T: Token<'tree>,
    {
        self.tokens().find_map(T::cast)
    }
}

pub(crate) struct SyntaxNode<'tree, K> {
    data: SyntaxNodeData<'tree>,
    _kind: PhantomData<fn() -> K>,
}

impl<'tree, K> Node<'tree> for SyntaxNode<'tree, K>
where
    K: NodeKind,
{
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

impl<K> fmt::Debug for SyntaxNode<'_, K>
where
    K: NodeKind,
{
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

/// Associates an owned [`Document`](crate::parser::Document) root marker with its borrowed CST
/// item type.
pub(crate) trait TreeRoot {
    type Item<'tree>: Node<'tree>;
}

pub(crate) struct ExprRoot(!);

impl TreeRoot for ExprRoot {
    type Item<'tree> = Expr<'tree>;
}

pub(crate) type Root<'tree, T> = SyntaxNode<'tree, kind::Root<T>>;

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
    pub(crate) fn item(self) -> Option<T> {
        self.data.child_node()
    }
}

pub(crate) type TypeAnnotation<'tree> = SyntaxNode<'tree, kind::TypeAnnotation>;

impl<'tree> TypeAnnotation<'tree> {
    #[must_use]
    pub(crate) fn token(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }
}

pub(crate) type TypeField<'tree> = SyntaxNode<'tree, kind::TypeField>;

impl<'tree> TypeField<'tree> {
    #[must_use]
    pub(crate) fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }

    #[must_use]
    pub(crate) fn annotation(self) -> Option<TypeAnnotation<'tree>> {
        self.data.child_node()
    }
}
