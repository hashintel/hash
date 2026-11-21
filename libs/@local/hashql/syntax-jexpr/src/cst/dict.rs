//! Typed CST wrappers for J-Expr `#dict` constructors in both object and array-of-pairs forms.

use core::fmt;

use super::{Expr, Node, StringToken, SyntaxNode, TypeField, TypedNode, kind};
use crate::syntax_kind::SyntaxKind;

/// `#dict` constructor object parameterized by its entry item type `T`.
pub type Dict<'tree, T> = TypedNode<'tree, kind::Dict<T>>;

impl<'tree, T> Dict<'tree, T> {
    /// Returns the `"#dict"` field node.
    #[must_use]
    pub fn field(self) -> Option<DictField<'tree, T>> {
        self.syntax.child_node()
    }

    /// Returns the body (object or array of pairs) of the `"#dict"` field.
    #[must_use]
    pub fn body(self) -> Option<DictBody<'tree, T>> {
        self.field()?.body()
    }
}

impl<'tree> Dict<'tree, Expr<'tree>> {
    /// Returns the optional `"#type"` annotation field on this dictionary expression.
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.syntax.child_node()
    }
}

/// `"#dict": { ... } | [ ... ]` field inside a [`Dict`].
pub type DictField<'tree, T> = TypedNode<'tree, kind::DictField<T>>;

impl<'tree, T> DictField<'tree, T> {
    /// Returns the `"#dict"` key token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }

    /// Returns the object or array-of-pairs body of this dictionary field.
    #[must_use]
    pub fn body(self) -> Option<DictBody<'tree, T>> {
        self.syntax.child_node()
    }
}

/// Body form of a [`DictField`].
pub enum DictBody<'tree, T> {
    /// Object syntax (`{"key": value, ...}`).
    Object(DictObjectBody<'tree, T>),
    /// Array-of-pairs syntax (`[[key, value], ...]`).
    Array(DictArrayBody<'tree, T>),
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

impl<'tree, T> Node<'tree> for DictBody<'tree, T> {
    fn can_cast(kind: SyntaxKind) -> bool {
        matches!(kind, SyntaxKind::DictObjectBody | SyntaxKind::DictArrayBody)
    }

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only dictionary body node kinds cast to DictBody"
    )]
    fn cast(syntax: SyntaxNode<'tree>) -> Option<Self> {
        match syntax.kind() {
            SyntaxKind::DictObjectBody => DictObjectBody::cast(syntax).map(Self::Object),
            SyntaxKind::DictArrayBody => DictArrayBody::cast(syntax).map(Self::Array),
            _ => None,
        }
    }

    fn syntax(self) -> SyntaxNode<'tree> {
        match self {
            Self::Object(node) => node.syntax(),
            Self::Array(node) => node.syntax(),
        }
    }
}

/// Object-form body (`{"k": v, ...}`) of a [`DictField`].
pub type DictObjectBody<'tree, T> = TypedNode<'tree, kind::DictObjectBody<T>>;

impl<'tree, T: 'tree> DictObjectBody<'tree, T> {
    /// Returns an iterator over key-value entries in source order.
    pub fn entries(self) -> impl Iterator<Item = DictObjectEntry<'tree, T>> + 'tree {
        self.syntax.child_nodes()
    }
}

/// Key-value entry inside a [`DictObjectBody`].
pub type DictObjectEntry<'tree, T> = TypedNode<'tree, kind::DictObjectEntry<T>>;

impl<'tree, T> DictObjectEntry<'tree, T> {
    /// Returns the string key token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }
}

impl<'tree, T: Node<'tree>> DictObjectEntry<'tree, T> {
    /// Returns the entry value item.
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.syntax.child_node()
    }
}

/// Array-of-pairs body (`[[k, v], ...]`) of a [`DictField`].
pub type DictArrayBody<'tree, T> = TypedNode<'tree, kind::DictArrayBody<T>>;

impl<'tree, T: 'tree> DictArrayBody<'tree, T> {
    /// Returns an iterator over pair entries in source order.
    pub fn entries(self) -> impl Iterator<Item = DictArrayEntry<'tree, T>> + 'tree {
        self.syntax.child_nodes()
    }
}

/// Two-element pair entry (`[key, value]`) inside a [`DictArrayBody`].
pub type DictArrayEntry<'tree, T> = TypedNode<'tree, kind::DictArrayEntry<T>>;

impl<'tree, T: Node<'tree> + 'tree> DictArrayEntry<'tree, T> {
    /// Returns an iterator over the item children in this pair array.
    pub fn items(self) -> impl Iterator<Item = T> + 'tree {
        self.syntax.child_nodes()
    }

    /// Returns the key item (element 0), if present.
    #[must_use]
    pub fn key(self) -> Option<T> {
        self.items().next()
    }

    /// Returns the value item (element 1), if present.
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.items().nth(1)
    }
}
