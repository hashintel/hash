use core::ops::ControlFlow;

use super::{Grammar, Parser, recovery};
use crate::{
    error::EofContext,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

const JSON_VALUE_FIRST: SyntaxKindSet =
    SyntaxKindSet::from_union(&[SyntaxKindSet::VALUE, SyntaxKindSet::OPENING_DELIMITER]);

fn parse_json_array<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::JsonArray);
    let open = parser.bump(T!['[']).range;

    let mut index = 0;
    while let ControlFlow::Continue(_) =
        recovery::next_array_element(parser, open, index, JSON_VALUE_FIRST)
    {
        index += 1;
        parse_json_value(parser);
    }

    parser.finish_node();
}

fn parse_json_object<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::JsonObject);
    let open = parser.bump(T!['{']).range;

    let mut index = 0;
    while let ControlFlow::Continue(_) = recovery::next_object_entry(parser, open, index) {
        index += 1;
        parser.start_node(SyntaxKind::JsonField);
        let key_range = parser.bump(T![string]).range;
        if recovery::expect_colon(parser, key_range) {
            match parser.current() {
                None => {
                    parser.record_eof(
                        JSON_VALUE_FIRST,
                        EofContext::FieldValue {
                            key: key_range,
                            constructor: None,
                        },
                    );
                }
                Some(token) if matches!(token.kind, T![,] | T!['}'] | T![']']) => {}
                Some(_) => parse_json_value(parser),
            }
        }
        parser.finish_node();
    }

    parser.finish_node();
}

pub(crate) fn parse_json_value<G: Grammar>(parser: &mut Parser<'_, G>) {
    let Some(token) = parser.current() else {
        return;
    };

    if token.kind == T!['{'] {
        parse_json_object(parser);
    } else if token.kind == T!['['] {
        parse_json_array(parser);
    } else if SyntaxKindSet::VALUE.contains(token.kind) {
        parser.start_node(SyntaxKind::JsonLiteral);
        parser.bump(token.kind);
        parser.finish_node();
    } else {
        parser.error_node();
    }
}
