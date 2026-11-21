use core::fmt;

use super::{Expr, Node, StringToken, SyntaxNode, SyntaxNodeData, TypeField, kind};
use crate::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet};

pub type Dict<'tree, T> = SyntaxNode<'tree, kind::Dict<T>>;

impl<'tree, T> Dict<'tree, T> {
    #[must_use]
    pub fn field(self) -> Option<DictField<'tree, T>> {
        self.data.child_node()
    }

    #[must_use]
    pub fn body(self) -> Option<DictBody<'tree, T>> {
        self.field()?.body()
    }
}

impl<'tree> Dict<'tree, Expr<'tree>> {
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}

pub type DictField<'tree, T> = SyntaxNode<'tree, kind::DictField<T>>;

impl<'tree, T> DictField<'tree, T> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }

    #[must_use]
    pub fn body(self) -> Option<DictBody<'tree, T>> {
        self.data.child_node()
    }
}

pub enum DictBody<'tree, T> {
    Object(DictObjectBody<'tree, T>),
    Array(DictArrayBody<'tree, T>),
}

impl<'tree, T> Node<'tree> for DictBody<'tree, T> {
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_union(&[
        DictObjectBody::<Self>::SYNTAX_KINDS,
        DictArrayBody::<Self>::SYNTAX_KINDS,
    ]);

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only dictionary body node kinds cast to DictBody"
    )]
    fn cast(syntax: SyntaxNodeData<'tree>) -> Option<Self> {
        match syntax.kind() {
            SyntaxKind::DictObjectBody => DictObjectBody::cast(syntax).map(Self::Object),
            SyntaxKind::DictArrayBody => DictArrayBody::cast(syntax).map(Self::Array),
            _ => None,
        }
    }

    fn syntax(self) -> SyntaxNodeData<'tree> {
        match self {
            Self::Object(node) => node.syntax(),
            Self::Array(node) => node.syntax(),
        }
    }
}

impl<T> fmt::Debug for DictBody<'_, T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Object(node) => fmt.debug_tuple("Object").field(node).finish(),
            Self::Array(node) => fmt.debug_tuple("Array").field(node).finish(),
        }
    }
}

impl<T> Copy for DictBody<'_, T> {}

impl<T> Clone for DictBody<'_, T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> PartialEq for DictBody<'_, T> {
    fn eq(&self, other: &Self) -> bool {
        self.syntax() == other.syntax()
    }
}

impl<T> Eq for DictBody<'_, T> {}

pub type DictObjectBody<'tree, T> = SyntaxNode<'tree, kind::DictObjectBody<T>>;

impl<'tree, T: 'tree> DictObjectBody<'tree, T> {
    pub fn entries(self) -> impl Iterator<Item = DictObjectEntry<'tree, T>> + 'tree {
        self.data.child_nodes()
    }
}

pub type DictObjectEntry<'tree, T> = SyntaxNode<'tree, kind::DictObjectEntry<T>>;

impl<'tree, T> DictObjectEntry<'tree, T> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }
}

impl<'tree, T: Node<'tree>> DictObjectEntry<'tree, T> {
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.data.child_node()
    }
}

pub type DictArrayBody<'tree, T> = SyntaxNode<'tree, kind::DictArrayBody<T>>;

impl<'tree, T: 'tree> DictArrayBody<'tree, T> {
    pub fn entries(self) -> impl Iterator<Item = DictArrayEntry<'tree, T>> + 'tree {
        self.data.child_nodes()
    }
}

pub type DictArrayEntry<'tree, T> = SyntaxNode<'tree, kind::DictArrayEntry<T>>;

impl<'tree, T: Node<'tree> + 'tree> DictArrayEntry<'tree, T> {
    pub fn items(self) -> impl Iterator<Item = T> + 'tree {
        self.data.child_nodes()
    }

    #[must_use]
    pub fn key(self) -> Option<T> {
        self.items().next()
    }

    #[must_use]
    pub fn value(self) -> Option<T> {
        self.items().nth(1)
    }
}
