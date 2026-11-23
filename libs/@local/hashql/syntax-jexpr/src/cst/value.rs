use super::{Dict, List, Literal, Node, Struct, SyntaxNodeData, Tuple};
use crate::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Value<'tree> {
    Literal(Literal<'tree>),
    Struct(Struct<'tree, Self>),
    Tuple(Tuple<'tree, Self>),
    List(List<'tree, Self>),
    Dict(Dict<'tree, Self>),
}

impl<'tree> Node<'tree> for Value<'tree> {
    const SYNTAX_KINDS: SyntaxKindSet = SyntaxKindSet::from_union(&[
        Struct::<Self>::SYNTAX_KINDS,
        Tuple::<Self>::SYNTAX_KINDS,
        List::<Self>::SYNTAX_KINDS,
        Dict::<Self>::SYNTAX_KINDS,
    ]);

    fn cast(syntax: SyntaxNodeData<'tree>) -> Option<Self> {
        match syntax.kind() {
            SyntaxKind::Struct => Struct::cast(syntax).map(Self::Struct),
            SyntaxKind::Tuple => Tuple::cast(syntax).map(Self::Tuple),
            SyntaxKind::List => List::cast(syntax).map(Self::List),
            SyntaxKind::Dict => Dict::cast(syntax).map(Self::Dict),
            _ => None,
        }
    }

    fn syntax(self) -> SyntaxNodeData<'tree> {
        match self {
            Value::Literal(node) => node.syntax(),
            Value::Struct(node) => node.syntax(),
            Value::Tuple(node) => node.syntax(),
            Value::List(node) => node.syntax(),
            Value::Dict(node) => node.syntax(),
        }
    }
}
