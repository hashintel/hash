use super::{Expr, LiteralToken, Node, StringToken, SyntaxNode, TypeField, kind};

pub(crate) type LiteralValue<'tree> = SyntaxNode<'tree, kind::LiteralValue>;

impl<'tree> LiteralValue<'tree> {
    #[must_use]
    pub(crate) fn token(self) -> Option<LiteralToken<'tree>> {
        self.data.first_token()
    }
}

pub(crate) type LiteralField<'tree> = SyntaxNode<'tree, kind::LiteralField>;

impl<'tree> LiteralField<'tree> {
    #[must_use]
    pub(crate) fn value(self) -> Option<LiteralValue<'tree>> {
        self.data.child_node()
    }
}

pub(crate) type Literal<'tree> = SyntaxNode<'tree, kind::Literal>;

impl<'tree> Literal<'tree> {
    #[must_use]
    pub(crate) fn field(self) -> Option<LiteralField<'tree>> {
        self.data.child_node()
    }

    #[cfg(test)] // Consumed by CST wrapper assertions in crate tests.
    #[must_use]
    pub(crate) fn value(self) -> Option<LiteralValue<'tree>> {
        self.field()?.value()
    }

    #[must_use]
    pub(crate) fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}

pub(crate) type StructEntry<'tree, T> = SyntaxNode<'tree, kind::StructEntry<T>>;

impl<'tree, T> StructEntry<'tree, T> {
    #[must_use]
    pub(crate) fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }
}

impl<'tree, T> StructEntry<'tree, T>
where
    T: Node<'tree>,
{
    #[must_use]
    pub(crate) fn value(self) -> Option<T> {
        self.data.child_node()
    }
}

pub(crate) type StructBody<'tree, T> = SyntaxNode<'tree, kind::StructBody<T>>;

impl<'tree, T> StructBody<'tree, T>
where
    T: 'tree,
{
    pub(crate) fn entries(self) -> impl Iterator<Item = StructEntry<'tree, T>> + 'tree {
        self.data.child_nodes()
    }
}

pub(crate) type StructField<'tree, T> = SyntaxNode<'tree, kind::StructField<T>>;

impl<'tree, T> StructField<'tree, T> {
    #[must_use]
    pub(crate) fn body(self) -> Option<StructBody<'tree, T>> {
        self.data.child_node()
    }
}

pub(crate) type Struct<'tree, T> = SyntaxNode<'tree, kind::Struct<T>>;

impl<'tree, T> Struct<'tree, T> {
    #[must_use]
    pub(crate) fn field(self) -> Option<StructField<'tree, T>> {
        self.data.child_node()
    }
}

impl<'tree> Struct<'tree, Expr<'tree>> {
    #[must_use]
    pub(crate) fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}

pub(crate) type TupleElement<'tree, T> = SyntaxNode<'tree, kind::TupleElement<T>>;

impl<'tree, T> TupleElement<'tree, T>
where
    T: Node<'tree>,
{
    #[must_use]
    pub(crate) fn value(self) -> Option<T> {
        self.data.child_node()
    }
}

pub(crate) type TupleBody<'tree, T> = SyntaxNode<'tree, kind::TupleBody<T>>;

impl<'tree, T> TupleBody<'tree, T>
where
    T: 'tree,
{
    pub(crate) fn elements(self) -> impl Iterator<Item = TupleElement<'tree, T>> + 'tree {
        self.data.child_nodes()
    }
}

pub(crate) type TupleField<'tree, T> = SyntaxNode<'tree, kind::TupleField<T>>;

impl<'tree, T> TupleField<'tree, T> {
    #[must_use]
    pub(crate) fn body(self) -> Option<TupleBody<'tree, T>> {
        self.data.child_node()
    }
}

pub(crate) type Tuple<'tree, T> = SyntaxNode<'tree, kind::Tuple<T>>;

impl<'tree, T> Tuple<'tree, T> {
    #[must_use]
    pub(crate) fn field(self) -> Option<TupleField<'tree, T>> {
        self.data.child_node()
    }
}

impl<'tree> Tuple<'tree, Expr<'tree>> {
    #[must_use]
    pub(crate) fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}

pub(crate) type ListElement<'tree, T> = SyntaxNode<'tree, kind::ListElement<T>>;

impl<'tree, T> ListElement<'tree, T>
where
    T: Node<'tree>,
{
    #[must_use]
    pub(crate) fn value(self) -> Option<T> {
        self.data.child_node()
    }
}

pub(crate) type ListBody<'tree, T> = SyntaxNode<'tree, kind::ListBody<T>>;

impl<'tree, T> ListBody<'tree, T>
where
    T: 'tree,
{
    pub(crate) fn elements(self) -> impl Iterator<Item = ListElement<'tree, T>> + 'tree {
        self.data.child_nodes()
    }
}

pub(crate) type ListField<'tree, T> = SyntaxNode<'tree, kind::ListField<T>>;

impl<'tree, T> ListField<'tree, T> {
    #[must_use]
    pub(crate) fn body(self) -> Option<ListBody<'tree, T>> {
        self.data.child_node()
    }
}

pub(crate) type List<'tree, T> = SyntaxNode<'tree, kind::List<T>>;

impl<'tree, T> List<'tree, T> {
    #[must_use]
    pub(crate) fn field(self) -> Option<ListField<'tree, T>> {
        self.data.child_node()
    }
}

impl<'tree> List<'tree, Expr<'tree>> {
    #[must_use]
    pub(crate) fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}
