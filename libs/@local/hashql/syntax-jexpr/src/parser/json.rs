use super::{
    Grammar, Parser,
    recovery::{self, ContainerStep},
};
use crate::{
    error::EofContext,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

const fn is_json_value_start(kind: SyntaxKind) -> bool {
    matches!(
        kind,
        T!['{'] | T!['['] | T![string] | T![number] | T![true] | T![false] | T![null]
    )
}

fn parse_json_array<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::JsonArray);
    let open = parser.bump(T!['[']).range;

    let mut index = 0;
    loop {
        match recovery::next_array_element(parser, open, index, is_json_value_start) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item { .. } => {
                index += 1;
                parse_json_value(parser);
            }
        }
    }

    parser.finish_node();
}

fn parse_json_object<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::JsonObject);
    let open = parser.bump(T!['{']).range;

    let mut index = 0;
    loop {
        match recovery::next_object_entry(parser, open, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item { .. } => {
                index += 1;
                parser.start_node(SyntaxKind::JsonField);
                let key_range = parser.bump(T![string]).range;
                if recovery::expect_colon(parser, key_range) {
                    match parser.current() {
                        None => {
                            parser.record_eof(
                                SyntaxKindSet::VALUE | SyntaxKindSet::OPENING_DELIMITER,
                                EofContext::FieldValue {
                                    key: key_range,
                                    constructor: None,
                                },
                            );
                        }
                        Some(tok) if matches!(tok.kind, T![,] | T!['}'] | T![']']) => {}
                        Some(_) => parse_json_value(parser),
                    }
                }
                parser.finish_node();
            }
        }
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
        recovery::bump_error_token(parser);
    }
}
