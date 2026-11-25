use core::{alloc::Allocator, ops::ControlFlow};

use text_size::TextRange;

use super::{
    Grammar, Parser, PeekToken,
    recovery::{self, ObjectEntry},
};
use crate::{
    error::{ObjectErrorKind, SyntaxErrorKind, ValueKind},
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

pub(crate) fn parse_dict_object_body<G, A>(mut open: PeekToken<'_, '_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    open.start_node(SyntaxKind::DictObjectBody);
    let open_range = open.range();
    let parser = open.commit();

    let mut index = 0_usize;
    while let ControlFlow::Continue(ObjectEntry { mut key, .. }) =
        recovery::next_object_entry(parser, open_range, index)
    {
        index += 1;

        key.start_node(SyntaxKind::DictObjectEntry);
        let key_range = key.range();
        let parser = key.commit();

        recovery::parse_object_field_value(parser, key_range, |parser| {
            parser.nested(G::parse_item);
        });

        parser.finish_node();
    }

    parser.finish_node();
}

fn parse_dict_array_entry<G, A>(parser: &mut Parser<'_, G, A>, dict_key: TextRange)
where
    G: Grammar,
    A: Allocator + Clone,
{
    let skipped_invalid = parser.skip_invalid_tokens();

    let Some(mut token) = parser.peek() else {
        return;
    };

    let kind = token.kind();
    if skipped_invalid && SyntaxKindSet::ITEM_BOUNDARY.contains(kind) {
        return;
    }

    if kind != T!['['] {
        let start = token.range().start();
        let found = ValueKind::from_syntax_kind(kind);

        parser.start_node(SyntaxKind::DictArrayEntry);
        parser.nested(recovery::parse_json_value);
        let value_range = TextRange::new(start, parser.last_token_end());
        parser.finish_node();

        parser.error(
            value_range,
            SyntaxErrorKind::Object(ObjectErrorKind::DictEntryExpectedArray { dict_key, found }),
        );

        return;
    }

    token.start_node(SyntaxKind::DictArrayEntry);
    let open = token.range();
    let parser = token.commit();
    let error_start = parser.error_count();

    let mut count = 0_usize;
    let mut excess = Vec::new_in(parser.allocator().clone());

    while recovery::next_array_element(parser, open, count, G::ITEM_FIRST).is_continue() {
        let item_start = parser.peek().map(|token| token.range().start());
        parser.nested(G::parse_item);

        if count >= 2
            && let Some(start) = item_start
        {
            excess.push(TextRange::new(start, parser.last_token_end()));
        }

        count += 1;
    }

    if !excess.is_empty() {
        let first_excess = excess.remove(0);
        parser.error(
            first_excess,
            SyntaxErrorKind::Object(ObjectErrorKind::DictEntryTooManyItems {
                dict_key,
                rest: excess,
            }),
        );
    } else if count < 2 && parser.error_count() == error_start {
        let range = TextRange::new(open.start(), parser.last_token_end());
        parser.error(
            range,
            SyntaxErrorKind::Object(ObjectErrorKind::DictEntryTooFewItems {
                dict_key,
                found: count,
            }),
        );
    } else {
        // Entry has two elements or already reported an inner syntax error.
    }

    parser.finish_node();
}

// Parses the array variant of `{"#dict": [ ... ]}`, that means the `[...]` part.
pub(crate) fn parse_dict_array_body<G, A>(mut open: PeekToken<'_, '_, G, A>, dict_key: TextRange)
where
    G: Grammar,
    A: Allocator + Clone,
{
    open.start_node(SyntaxKind::DictArrayBody);
    let open_range = open.range();
    let parser = open.commit();

    let mut index = 0_usize;
    while recovery::next_array_element(parser, open_range, index, SyntaxKindSet::from_kind(T!['[']))
        .is_continue()
    {
        index += 1;
        parse_dict_array_entry(parser, dict_key);
    }

    parser.finish_node();
}
