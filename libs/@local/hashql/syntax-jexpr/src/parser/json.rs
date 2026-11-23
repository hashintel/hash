use core::{alloc::Allocator, ops::ControlFlow};

use super::{
    Grammar, Parser, PeekToken,
    recovery::{self, FieldValue, ObjectEntry},
};
use crate::{
    error::EofContext,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

const JSON_VALUE_FIRST: SyntaxKindSet =
    SyntaxKindSet::from_union(&[SyntaxKindSet::VALUE, SyntaxKindSet::OPENING_DELIMITER]);

fn parse_json_array<G, A>(mut open: PeekToken<'_, '_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    open.start_node(SyntaxKind::JsonArray);
    let open_range = open.range();
    let parser = open.commit();

    let mut index = 0;
    while recovery::next_array_element(parser, open_range, index, JSON_VALUE_FIRST).is_continue() {
        index += 1;
        parser.nested(parse_json_value);
    }

    parser.finish_node();
}

fn parse_json_object<G, A>(mut open: PeekToken<'_, '_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    open.start_node(SyntaxKind::JsonObject);
    let open_range = open.range();
    let parser = open.commit();

    let mut index = 0;
    while let ControlFlow::Continue(ObjectEntry { mut key, .. }) =
        recovery::next_object_entry(parser, open_range, index)
    {
        index += 1;

        key.start_node(SyntaxKind::JsonField);
        let key_range = key.range();
        let parser = key.commit();
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

pub(crate) fn parse_json_value<G, A>(parser: &mut Parser<'_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    let skipped_invalid = parser.skip_invalid_tokens();
    if parser.skip_over_nested_container().is_break() {
        return;
    }

    let Some(token) = parser.peek() else {
        return;
    };

    let kind = token.kind();
    if kind == T!['{'] {
        parse_json_object(token);
    } else if kind == T!['['] {
        parse_json_array(token);
    } else if SyntaxKindSet::VALUE.contains(kind) {
        token.commit_node(SyntaxKind::JsonLiteral);
    } else if !skipped_invalid {
        token.commit_node(SyntaxKind::Error);
    } else {
        // The invalid tokens took the place of the value, and the next token is the container's.
    }
}
