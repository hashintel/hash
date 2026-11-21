use super::{Expr, LiteralToken, Node, StringToken, SyntaxNode, TypeField, kind};

pub type Literal<'tree> = SyntaxNode<'tree, kind::Literal>;

impl<'tree> Literal<'tree> {
    #[must_use]
    pub fn field(self) -> Option<LiteralField<'tree>> {
        self.data.child_node()
    }

    #[must_use]
    pub fn value(self) -> Option<LiteralValue<'tree>> {
        self.field()?.value()
    }

    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}

pub type LiteralField<'tree> = SyntaxNode<'tree, kind::LiteralField>;

impl<'tree> LiteralField<'tree> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }

    #[must_use]
    pub fn value(self) -> Option<LiteralValue<'tree>> {
        self.data.child_node()
    }
}

pub type LiteralValue<'tree> = SyntaxNode<'tree, kind::LiteralValue>;

impl<'tree> LiteralValue<'tree> {
    #[must_use]
    pub fn token(self) -> Option<LiteralToken<'tree>> {
        self.data.first_token()
    }
}

pub type Struct<'tree, T> = SyntaxNode<'tree, kind::Struct<T>>;

impl<'tree, T> Struct<'tree, T> {
    #[must_use]
    pub fn field(self) -> Option<StructField<'tree, T>> {
        self.data.child_node()
    }

    #[must_use]
    pub fn body(self) -> Option<StructBody<'tree, T>> {
        self.field()?.body()
    }
}

impl<'tree> Struct<'tree, Expr<'tree>> {
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}

pub type StructField<'tree, T> = SyntaxNode<'tree, kind::StructField<T>>;

impl<'tree, T> StructField<'tree, T> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }

    #[must_use]
    pub fn body(self) -> Option<StructBody<'tree, T>> {
        self.data.child_node()
    }
}

pub type StructBody<'tree, T> = SyntaxNode<'tree, kind::StructBody<T>>;

impl<'tree, T: 'tree> StructBody<'tree, T> {
    pub fn entries(self) -> impl Iterator<Item = StructEntry<'tree, T>> + 'tree {
        self.data.child_nodes()
    }
}

pub type StructEntry<'tree, T> = SyntaxNode<'tree, kind::StructEntry<T>>;

impl<'tree, T> StructEntry<'tree, T> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }
}

impl<'tree, T: Node<'tree>> StructEntry<'tree, T> {
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.data.child_node()
    }
}

pub type Tuple<'tree, T> = SyntaxNode<'tree, kind::Tuple<T>>;

impl<'tree, T> Tuple<'tree, T> {
    #[must_use]
    pub fn field(self) -> Option<TupleField<'tree, T>> {
        self.data.child_node()
    }

    #[must_use]
    pub fn body(self) -> Option<TupleBody<'tree, T>> {
        self.field()?.body()
    }
}

impl<'tree> Tuple<'tree, Expr<'tree>> {
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}

pub type TupleField<'tree, T> = SyntaxNode<'tree, kind::TupleField<T>>;

impl<'tree, T> TupleField<'tree, T> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }

    #[must_use]
    pub fn body(self) -> Option<TupleBody<'tree, T>> {
        self.data.child_node()
    }
}

pub type TupleBody<'tree, T> = SyntaxNode<'tree, kind::TupleBody<T>>;

impl<'tree, T: 'tree> TupleBody<'tree, T> {
    pub fn elements(self) -> impl Iterator<Item = TupleElement<'tree, T>> + 'tree {
        self.data.child_nodes()
    }
}

pub type TupleElement<'tree, T> = SyntaxNode<'tree, kind::TupleElement<T>>;

impl<'tree, T: Node<'tree>> TupleElement<'tree, T> {
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.data.child_node()
    }
}

pub type List<'tree, T> = SyntaxNode<'tree, kind::List<T>>;

impl<'tree, T> List<'tree, T> {
    #[must_use]
    pub fn field(self) -> Option<ListField<'tree, T>> {
        self.data.child_node()
    }

    #[must_use]
    pub fn body(self) -> Option<ListBody<'tree, T>> {
        self.field()?.body()
    }
}

impl<'tree> List<'tree, Expr<'tree>> {
    #[must_use]
    pub fn type_field(self) -> Option<TypeField<'tree>> {
        self.data.child_node()
    }
}

pub type ListField<'tree, T> = SyntaxNode<'tree, kind::ListField<T>>;

impl<'tree, T> ListField<'tree, T> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }

    #[must_use]
    pub fn body(self) -> Option<ListBody<'tree, T>> {
        self.data.child_node()
    }
}

pub type ListBody<'tree, T> = SyntaxNode<'tree, kind::ListBody<T>>;

impl<'tree, T: 'tree> ListBody<'tree, T> {
    pub fn elements(self) -> impl Iterator<Item = ListElement<'tree, T>> + 'tree {
        self.data.child_nodes()
    }
}

pub type ListElement<'tree, T> = SyntaxNode<'tree, kind::ListElement<T>>;

impl<'tree, T: Node<'tree>> ListElement<'tree, T> {
    #[must_use]
    pub fn value(self) -> Option<T> {
        self.data.child_node()
    }
}
