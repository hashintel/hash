use core::{alloc::Allocator, ops::ControlFlow};

use super::{
    Grammar, Parser,
    recovery::{self, FieldValue},
};
use crate::{
    error::EofContext,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

const JSON_VALUE_FIRST: SyntaxKindSet =
    SyntaxKindSet::from_union(&[SyntaxKindSet::VALUE, SyntaxKindSet::OPENING_DELIMITER]);

fn parse_json_array<G: Grammar, A: Allocator>(parser: &mut Parser<'_, G, A>) {
    parser.start_node(SyntaxKind::JsonArray);
    let open = parser.bump(T!['[']).range;

    let mut index = 0;
    while let ControlFlow::Continue(_) =
        recovery::next_array_element_in(parser, open, index, JSON_VALUE_FIRST)
    {
        index += 1;
        parser.nested(parse_json_value);
    }

    parser.finish_node();
}

fn parse_json_object<G: Grammar, A: Allocator>(parser: &mut Parser<'_, G, A>) {
    parser.start_node(SyntaxKind::JsonObject);
    let open = parser.bump(T!['{']).range;

    let mut index = 0;
    while let ControlFlow::Continue(_) = recovery::next_object_entry_in(parser, open, index) {
        index += 1;

        parser.start_node(SyntaxKind::JsonField);
        let key_range = parser.bump(T![string]).range;
        match recovery::expect_colon(parser, key_range) {
            ControlFlow::Continue(FieldValue::Token(_)) => parser.nested(parse_json_value),
            ControlFlow::Continue(FieldValue::Eof) => {
                parser.record_eof(
                    JSON_VALUE_FIRST,
                    EofContext::FieldValue {
                        key: key_range,
                        field: None,
                    },
                );
            }
            ControlFlow::Continue(FieldValue::Missing(_)) | ControlFlow::Break(()) => {}
        }
        parser.finish_node();
    }

    parser.finish_node();
}

pub(crate) fn parse_json_value<G: Grammar, A: Allocator>(parser: &mut Parser<'_, G, A>) {
    let skipped_invalid = parser.skip_invalid_tokens();

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
    } else if !skipped_invalid {
        parser.error_node();
    } else {
        // The invalid tokens took the place of the value, and the next token is the container's.
    }
}
