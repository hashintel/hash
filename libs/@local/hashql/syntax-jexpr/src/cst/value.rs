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
        Literal::SYNTAX_KINDS,
        Struct::<Self>::SYNTAX_KINDS,
        Tuple::<Self>::SYNTAX_KINDS,
        List::<Self>::SYNTAX_KINDS,
        Dict::<Self>::SYNTAX_KINDS,
    ]);

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only value node kinds cast to Value"
    )]
    fn cast(syntax: SyntaxNodeData<'tree>) -> Option<Self> {
        match syntax.kind() {
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
            Self::Literal(node) => node.syntax(),
            Self::Struct(node) => node.syntax(),
            Self::Tuple(node) => node.syntax(),
            Self::List(node) => node.syntax(),
            Self::Dict(node) => node.syntax(),
        }
    }
}
