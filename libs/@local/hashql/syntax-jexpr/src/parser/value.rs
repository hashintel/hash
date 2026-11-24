use core::alloc::Allocator;

use super::{Grammar, Parser, object, recovery};
use crate::{
    cst,
    error::{EofContext, GrammarKind},
    syntax_kind::T,
    syntax_kind_set::SyntaxKindSet,
};

pub(crate) struct ValueGrammar;

impl Grammar for ValueGrammar {
    type Root = cst::ValueRoot;

    const ALLOW_TYPE_ANNOTATIONS: bool = false;
    const ITEM_FIRST: SyntaxKindSet = SyntaxKindSet::from_kind(T!['{']);
    const KIND: GrammarKind = GrammarKind::Value;

    fn parse_item<A>(parser: &mut Parser<'_, Self, A>)
    where
        Self: Sized,
        A: Allocator + Clone,
    {
        parse_value(parser);
    }
}

fn parse_value<A>(parser: &mut Parser<'_, ValueGrammar, A>)
where
    A: Allocator + Clone,
{
    let Some(token) = parser.peek() else {
        parser.record_eof(ValueGrammar::ITEM_FIRST, EofContext::Document);
        return;
    };

    let kind = token.kind();
    if kind == T!['{'] {
        object::parse_object(token);
    } else {
        recovery::recover_unexpected_item(parser);
    }
}
