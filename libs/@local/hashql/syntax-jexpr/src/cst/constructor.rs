//! Typed CST wrappers for J-Expr `#literal`, `#struct`, `#tuple`, and `#list` constructors.

use super::{Expr, LiteralToken, Node, StringToken, TypeField, TypedNode, kind};

/// `#literal` constructor object.
pub type Literal<'tree> = TypedNode<'tree, kind::Literal>;

impl<'tree> Literal<'tree> {
    /// Returns the `"#literal"` field node.
    #[must_use]
    pub fn field(self) -> Option<LiteralField<'tree>> {
        self.syntax.child_node()
    }

    /// Returns the primitive value node inside the `"#literal"` field.
    #[must_use]
    pub fn value(self) -> Option<LiteralValue<'tree>> {
        self.field()?.value()
    }

    /// Returns the optional `"#type"` annotation field on this literal.
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.syntax.child_node()
    }
}

/// `"#literal": <value>` field inside a [`Literal`].
pub type LiteralField<'tree> = TypedNode<'tree, kind::LiteralField>;

impl<'tree> LiteralField<'tree> {
    /// Returns the `"#literal"` key token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }

    /// Returns the [`LiteralValue`] child.
    #[must_use]
    pub fn value(self) -> Option<LiteralValue<'tree>> {
        self.syntax.child_node()
    }
}

/// Primitive value node inside a [`LiteralField`].
pub type LiteralValue<'tree> = TypedNode<'tree, kind::LiteralValue>;

impl<'tree> LiteralValue<'tree> {
    /// Returns the typed primitive token inside this literal value, if valid.
    #[must_use]
    pub fn token(self) -> Option<LiteralToken<'tree>> {
        self.syntax.first_token()
    }
}

/// `#struct` constructor object parameterized by its field value type `T`.
pub type Struct<'tree, T> = TypedNode<'tree, kind::Struct<T>>;

impl<'tree, T> Struct<'tree, T> {
    /// Returns the `"#struct"` field node.
    #[must_use]
    pub fn field(self) -> Option<StructField<'tree, T>> {
        self.syntax.child_node()
    }

    /// Returns the inner `{ ... }` body of the `"#struct"` field.
    #[must_use]
    pub fn body(self) -> Option<StructBody<'tree, T>> {
        self.field()?.body()
    }
}

impl<'tree> Struct<'tree, Expr<'tree>> {
    /// Returns the optional `"#type"` annotation field on this struct expression.
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.syntax.child_node()
    }
}

/// `"#struct": { ... }` field inside a [`Struct`].
pub type StructField<'tree, T> = TypedNode<'tree, kind::StructField<T>>;

impl<'tree, T> StructField<'tree, T> {
    /// Returns the `"#struct"` key token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }

    /// Returns the `{ ... }` struct body node.
    #[must_use]
    pub fn body(self) -> Option<StructBody<'tree, T>> {
        self.syntax.child_node()
    }
}

/// Object body of a [`StructField`].
pub type StructBody<'tree, T> = TypedNode<'tree, kind::StructBody<T>>;

impl<'tree, T: 'tree> StructBody<'tree, T> {
    /// Returns an iterator over named field entries in source order.
    pub fn entries(self) -> impl Iterator<Item = StructEntry<'tree, T>> + 'tree {
        self.syntax.child_nodes()
    }
}

/// Named field entry (`"field": value`) inside a [`StructBody`].
pub type StructEntry<'tree, T> = TypedNode<'tree, kind::StructEntry<T>>;

impl<'tree, T> StructEntry<'tree, T> {
    /// Returns the field key string token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }
}

impl<'tree, T: Node<'tree>> StructEntry<'tree, T> {
    /// Returns the field value item.
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.syntax.child_node()
    }
}

/// `#tuple` constructor object parameterized by its element type `T`.
pub type Tuple<'tree, T> = TypedNode<'tree, kind::Tuple<T>>;

impl<'tree, T> Tuple<'tree, T> {
    /// Returns the `"#tuple"` field node.
    #[must_use]
    pub fn field(self) -> Option<TupleField<'tree, T>> {
        self.syntax.child_node()
    }

    /// Returns the inner `[ ... ]` body of the `"#tuple"` field.
    #[must_use]
    pub fn body(self) -> Option<TupleBody<'tree, T>> {
        self.field()?.body()
    }
}

impl<'tree> Tuple<'tree, Expr<'tree>> {
    /// Returns the optional `"#type"` annotation field on this tuple expression.
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.syntax.child_node()
    }
}

/// `"#tuple": [ ... ]` field inside a [`Tuple`].
pub type TupleField<'tree, T> = TypedNode<'tree, kind::TupleField<T>>;

impl<'tree, T> TupleField<'tree, T> {
    /// Returns the `"#tuple"` key token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }

    /// Returns the `[ ... ]` tuple body node.
    #[must_use]
    pub fn body(self) -> Option<TupleBody<'tree, T>> {
        self.syntax.child_node()
    }
}

/// Array body of a [`TupleField`].
pub type TupleBody<'tree, T> = TypedNode<'tree, kind::TupleBody<T>>;

impl<'tree, T: 'tree> TupleBody<'tree, T> {
    /// Returns an iterator over tuple elements in source order.
    pub fn elements(self) -> impl Iterator<Item = TupleElement<'tree, T>> + 'tree {
        self.syntax.child_nodes()
    }
}

/// Single element wrapper inside a [`TupleBody`].
pub type TupleElement<'tree, T> = TypedNode<'tree, kind::TupleElement<T>>;

impl<'tree, T: Node<'tree>> TupleElement<'tree, T> {
    /// Returns the element value item.
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.syntax.child_node()
    }
}

/// `#list` constructor object parameterized by its element type `T`.
pub type List<'tree, T> = TypedNode<'tree, kind::List<T>>;

impl<'tree, T> List<'tree, T> {
    /// Returns the `"#list"` field node.
    #[must_use]
    pub fn field(self) -> Option<ListField<'tree, T>> {
        self.syntax.child_node()
    }

    /// Returns the inner `[ ... ]` body of the `"#list"` field.
    #[must_use]
    pub fn body(self) -> Option<ListBody<'tree, T>> {
        self.field()?.body()
    }
}

impl<'tree> List<'tree, Expr<'tree>> {
    /// Returns the optional `"#type"` annotation field on this list expression.
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.syntax.child_node()
    }
}

/// `"#list": [ ... ]` field inside a [`List`].
pub type ListField<'tree, T> = TypedNode<'tree, kind::ListField<T>>;

impl<'tree, T> ListField<'tree, T> {
    /// Returns the `"#list"` key token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }

    /// Returns the `[ ... ]` list body node.
    #[must_use]
    pub fn body(self) -> Option<ListBody<'tree, T>> {
        self.syntax.child_node()
    }
}

/// Array body of a [`ListField`].
pub type ListBody<'tree, T> = TypedNode<'tree, kind::ListBody<T>>;

impl<'tree, T: 'tree> ListBody<'tree, T> {
    /// Returns an iterator over list elements in source order.
    pub fn elements(self) -> impl Iterator<Item = ListElement<'tree, T>> + 'tree {
        self.syntax.child_nodes()
    }
}

/// Single element wrapper inside a [`ListBody`].
pub type ListElement<'tree, T> = TypedNode<'tree, kind::ListElement<T>>;

impl<'tree, T: Node<'tree>> ListElement<'tree, T> {
    /// Returns the element value item.
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.syntax.child_node()
    }
}
