use super::{
    Dict, List, Literal, Node, StringToken, Struct, SyntaxNode, SyntaxNodeData, Tuple, kind,
};
use crate::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Expr<'tree> {
    Path(PathExpr<'tree>),
    Call(CallExpr<'tree>),
    Literal(Literal<'tree>),
    Struct(Struct<'tree, Self>),
    Tuple(Tuple<'tree, Self>),
    List(List<'tree, Self>),
    Dict(Dict<'tree, Self>),
}

impl<'tree> Node<'tree> for Expr<'tree> {
    const SYNTAX_KINDS: crate::syntax_kind_set::SyntaxKindSet = SyntaxKindSet::from_union(&[
        PathExpr::SYNTAX_KINDS,
        CallExpr::SYNTAX_KINDS,
        Literal::SYNTAX_KINDS,
        Struct::<Self>::SYNTAX_KINDS,
        Tuple::<Self>::SYNTAX_KINDS,
        List::<Self>::SYNTAX_KINDS,
        Dict::<Self>::SYNTAX_KINDS,
    ]);

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only expression node kinds cast to Expr"
    )]
    fn cast(syntax: SyntaxNodeData<'tree>) -> Option<Self> {
        match syntax.kind() {
            SyntaxKind::PathExpr => PathExpr::cast(syntax).map(Self::Path),
            SyntaxKind::CallExpr => CallExpr::cast(syntax).map(Self::Call),
            SyntaxKind::Literal => Literal::cast(syntax).map(Self::Literal),
            SyntaxKind::Struct => Struct::cast(syntax).map(Self::Struct),
            SyntaxKind::Tuple => Tuple::cast(syntax).map(Self::Tuple),
            SyntaxKind::List => List::cast(syntax).map(Self::List),
            SyntaxKind::Dict => Dict::cast(syntax).map(Self::Dict),
            _ => None,
        }
    }

    fn syntax(self) -> SyntaxNodeData<'tree> {
        match self {
            Self::Path(node) => node.syntax(),
            Self::Call(node) => node.syntax(),
            Self::Literal(node) => node.syntax(),
            Self::Struct(node) => node.syntax(),
            Self::Tuple(node) => node.syntax(),
            Self::List(node) => node.syntax(),
            Self::Dict(node) => node.syntax(),
        }
    }
}

pub type PathExpr<'tree> = SyntaxNode<'tree, kind::PathExpr>;

impl<'tree> PathExpr<'tree> {
    #[must_use]
    pub fn token(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }
}

pub type CallExpr<'tree> = SyntaxNode<'tree, kind::CallExpr>;

impl<'tree> CallExpr<'tree> {
    #[must_use]
    pub fn callee(self) -> Option<Expr<'tree>> {
        self.data.child_node()
    }

    pub fn args(self) -> impl Iterator<Item = CallArg<'tree>> + 'tree {
        self.data.child_nodes()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum CallArg<'tree> {
    Positional(PositionalArg<'tree>),
    /// Object-form `{":label": value}` argument.
    Labeled(LabeledArg<'tree>),
    /// String shorthand `":label"` argument referencing a same-named variable.
    ShorthandLabeled(ShorthandLabeledArg<'tree>),
}

impl<'tree> Node<'tree> for CallArg<'tree> {
    const SYNTAX_KINDS: crate::syntax_kind_set::SyntaxKindSet = SyntaxKindSet::from_union(&[
        PositionalArg::SYNTAX_KINDS,
        LabeledArg::SYNTAX_KINDS,
        ShorthandLabeledArg::SYNTAX_KINDS,
    ]);

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only call-argument node kinds cast to CallArg"
    )]
    fn cast(syntax: SyntaxNodeData<'tree>) -> Option<Self> {
        match syntax.kind() {
            SyntaxKind::PositionalArg => PositionalArg::cast(syntax).map(Self::Positional),
            SyntaxKind::LabeledArg => LabeledArg::cast(syntax).map(Self::Labeled),
            SyntaxKind::ShorthandLabeledArg => {
                ShorthandLabeledArg::cast(syntax).map(Self::ShorthandLabeled)
            }
            _ => None,
        }
    }

    fn syntax(self) -> SyntaxNodeData<'tree> {
        match self {
            Self::Positional(node) => node.syntax(),
            Self::Labeled(node) => node.syntax(),
            Self::ShorthandLabeled(node) => node.syntax(),
        }
    }
}

pub type PositionalArg<'tree> = SyntaxNode<'tree, kind::PositionalArg>;

impl<'tree> PositionalArg<'tree> {
    #[must_use]
    pub fn expr(self) -> Option<Expr<'tree>> {
        self.data.child_node()
    }
}

pub type LabeledArg<'tree> = SyntaxNode<'tree, kind::LabeledArg>;

impl<'tree> LabeledArg<'tree> {
    pub fn entries(self) -> impl Iterator<Item = LabeledArgEntry<'tree>> + 'tree {
        self.data.child_nodes()
    }
}

pub type LabeledArgEntry<'tree> = SyntaxNode<'tree, kind::LabeledArgEntry>;

impl<'tree> LabeledArgEntry<'tree> {
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }

    #[must_use]
    pub fn value(self) -> Option<Expr<'tree>> {
        self.data.child_node()
    }
}

pub type ShorthandLabeledArg<'tree> = SyntaxNode<'tree, kind::ShorthandLabeledArg>;

impl<'tree> ShorthandLabeledArg<'tree> {
    #[must_use]
    pub fn token(self) -> Option<StringToken<'tree>> {
        self.data.first_token()
    }
}
