use text_size::TextRange;

use super::{
    Grammar, Parser,
    recovery::{self, ContainerStep},
};
use crate::{
    error::{ObjectErrorKind, SyntaxErrorKind, ValueKind},
    syntax_kind::{SyntaxKind, T},
};

pub(crate) fn parse_dict_object_body<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::DictObjectBody);
    let open = parser.bump(T!['{']).range;

    let mut index = 0_usize;
    loop {
        match recovery::next_object_entry(parser, open, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item { .. } => {
                index += 1;
                parser.start_node(SyntaxKind::DictObjectEntry);
                let key_range = parser.bump(T![string]).range;
                if recovery::expect_colon(parser, key_range) {
                    G::parse_item(parser);
                }
                parser.finish_node();
            }
        }
    }

    parser.finish_node();
}

pub(crate) fn parse_dict_array_body<G: Grammar>(parser: &mut Parser<'_, G>, dict_key: TextRange) {
    parser.start_node(SyntaxKind::DictArrayBody);
    let open = parser.bump(T!['[']).range;

    let mut index = 0_usize;
    loop {
        match recovery::next_array_element(parser, open, index, |kind| kind == T!['[']) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item { .. } => {
                index += 1;
                parse_dict_array_entry(parser, dict_key);
            }
        }
    }

    parser.finish_node();
}

fn parse_dict_array_entry<G: Grammar>(parser: &mut Parser<'_, G>, dict_key: TextRange) {
    let Some(token) = parser.current() else {
        return;
    };

    if token.kind == SyntaxKind::InvalidToken {
        parser.start_node(SyntaxKind::DictArrayEntry);
        parser.start_node(SyntaxKind::Error);
        parser.bump(SyntaxKind::InvalidToken);
        parser.finish_node();
        parser.finish_node();
        return;
    }

    if token.kind != T!['['] {
        let start = token.range.start();
        let found = ValueKind::from_syntax_kind(token.kind);
        parser.start_node(SyntaxKind::DictArrayEntry);
        recovery::parse_json_value(parser);
        let value_range = TextRange::new(start, parser.last_token_end());
        parser.finish_node();
        parser.error(
            value_range,
            SyntaxErrorKind::Object(ObjectErrorKind::DictEntryExpectedArray { dict_key, found }),
        );
        return;
    }

    parser.start_node(SyntaxKind::DictArrayEntry);
    let open = parser.bump(T!['[']).range;
    let err_start = parser.error_count();

    let mut count = 0_usize;
    let mut excess = Vec::new();

    loop {
        match recovery::next_array_element(parser, open, count, |kind| G::ITEM_FIRST.contains(kind))
        {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item { .. } => {
                let item_start = parser.current().map(|tok| tok.range.start());
                G::parse_item(parser);
                if count >= 2
                    && let Some(start) = item_start
                {
                    excess.push(TextRange::new(start, parser.last_token_end()));
                }
                count += 1;
            }
        }
    }

    if let Some((&first_excess, rest)) = excess.split_first() {
        parser.error(
            first_excess,
            SyntaxErrorKind::Object(ObjectErrorKind::DictEntryTooManyItems {
                dict_key,
                rest: rest.to_vec(),
            }),
        );
    } else if count < 2 && parser.error_count() == err_start {
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
