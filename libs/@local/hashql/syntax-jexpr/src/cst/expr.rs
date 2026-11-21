//! Typed CST wrappers for J-Expr expressions and call arguments.

use super::{Dict, List, Literal, Node, StringToken, Struct, SyntaxNode, Tuple, TypedNode, kind};
use crate::syntax_kind::SyntaxKind;

/// Top-level J-Expr expression node.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Expr<'tree> {
    /// Embedded string expression (`"x"`, `"a.b[0]"`, `"_"`).
    Path(PathExpr<'tree>),
    /// Array function call (`["add", ...]`).
    Call(CallExpr<'tree>),
    /// `#literal` constructor object.
    Literal(Literal<'tree>),
    /// `#struct` constructor object.
    Struct(Struct<'tree, Self>),
    /// `#tuple` constructor object.
    Tuple(Tuple<'tree, Self>),
    /// `#list` constructor object.
    List(List<'tree, Self>),
    /// `#dict` constructor object.
    Dict(Dict<'tree, Self>),
}

impl<'tree> Node<'tree> for Expr<'tree> {
    fn can_cast(kind: SyntaxKind) -> bool {
        matches!(
            kind,
            SyntaxKind::PathExpr
                | SyntaxKind::CallExpr
                | SyntaxKind::Literal
                | SyntaxKind::Struct
                | SyntaxKind::Tuple
                | SyntaxKind::List
                | SyntaxKind::Dict
        )
    }

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only expression node kinds cast to Expr"
    )]
    fn cast(syntax: SyntaxNode<'tree>) -> Option<Self> {
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

    fn syntax(self) -> SyntaxNode<'tree> {
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

/// String expression carrying an embedded HashQL path, access chain, or underscore.
pub type PathExpr<'tree> = TypedNode<'tree, kind::PathExpr>;

impl<'tree> PathExpr<'tree> {
    /// Returns the underlying string token.
    #[must_use]
    pub fn token(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }
}

/// Array-form function call expression (`[callee, arg1, ...]`).
pub type CallExpr<'tree> = TypedNode<'tree, kind::CallExpr>;

impl<'tree> CallExpr<'tree> {
    /// Returns the callee expression (element 0), if present and valid.
    #[must_use]
    pub fn callee(self) -> Option<Expr<'tree>> {
        self.syntax.child_node()
    }

    /// Returns an iterator over positional and labeled call arguments.
    pub fn args(self) -> impl Iterator<Item = CallArg<'tree>> + 'tree {
        self.syntax.child_nodes()
    }
}

/// Argument inside a [`CallExpr`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum CallArg<'tree> {
    /// Positional expression argument.
    Positional(PositionalArg<'tree>),
    /// Object-form labeled argument (`{":label": value}`).
    Labeled(LabeledArg<'tree>),
    /// Shorthand string labeled argument (`":label"`).
    ShorthandLabeled(ShorthandLabeledArg<'tree>),
}

impl<'tree> Node<'tree> for CallArg<'tree> {
    fn can_cast(kind: SyntaxKind) -> bool {
        matches!(
            kind,
            SyntaxKind::PositionalArg | SyntaxKind::LabeledArg | SyntaxKind::ShorthandLabeledArg
        )
    }

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only call-argument node kinds cast to CallArg"
    )]
    fn cast(syntax: SyntaxNode<'tree>) -> Option<Self> {
        match syntax.kind() {
            SyntaxKind::PositionalArg => PositionalArg::cast(syntax).map(Self::Positional),
            SyntaxKind::LabeledArg => LabeledArg::cast(syntax).map(Self::Labeled),
            SyntaxKind::ShorthandLabeledArg => {
                ShorthandLabeledArg::cast(syntax).map(Self::ShorthandLabeled)
            }
            _ => None,
        }
    }

    fn syntax(self) -> SyntaxNode<'tree> {
        match self {
            Self::Positional(node) => node.syntax(),
            Self::Labeled(node) => node.syntax(),
            Self::ShorthandLabeled(node) => node.syntax(),
        }
    }
}

/// Positional argument wrapper inside a [`CallExpr`].
pub type PositionalArg<'tree> = TypedNode<'tree, kind::PositionalArg>;

impl<'tree> PositionalArg<'tree> {
    /// Returns the argument expression, if present.
    #[must_use]
    pub fn expr(self) -> Option<Expr<'tree>> {
        self.syntax.child_node()
    }
}

/// Object-form labeled argument (`{":label": value}`).
pub type LabeledArg<'tree> = TypedNode<'tree, kind::LabeledArg>;

impl<'tree> LabeledArg<'tree> {
    /// Returns an iterator over key-value entries inside this labeled argument object.
    pub fn entries(self) -> impl Iterator<Item = LabeledArgEntry<'tree>> + 'tree {
        self.syntax.child_nodes()
    }
}

/// Key-value entry (`":label": value`) inside a [`LabeledArg`].
pub type LabeledArgEntry<'tree> = TypedNode<'tree, kind::LabeledArgEntry>;

impl<'tree> LabeledArgEntry<'tree> {
    /// Returns the label key string token.
    #[must_use]
    pub fn key(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }

    /// Returns the argument value expression.
    #[must_use]
    pub fn value(self) -> Option<Expr<'tree>> {
        self.syntax.child_node()
    }
}

/// Shorthand labeled argument (`":label"`).
pub type ShorthandLabeledArg<'tree> = TypedNode<'tree, kind::ShorthandLabeledArg>;

impl<'tree> ShorthandLabeledArg<'tree> {
    /// Returns the `":label"` string token.
    #[must_use]
    pub fn token(self) -> Option<StringToken<'tree>> {
        self.syntax.first_token()
    }
}
