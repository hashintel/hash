use text_size::TextRange;

use super::{Grammar, Parser};
use crate::{
    error::SyntaxErrorKind,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

const EXPECTED_ARRAY_SEP: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![,], T![']']]);

const EXPECTED_OBJECT_SEP: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![,], T!['}']]);

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ContainerStep {
    Item,
    Closed,
    /// Stopped on EOF or an enclosing container's closing delimiter.
    Aborted,
}

pub(crate) fn next_array_element<G: Grammar>(
    parser: &mut Parser<'_, G>,
    index: usize,
    can_start_item: impl Fn(SyntaxKind) -> bool,
) -> ContainerStep {
    loop {
        let Some(token) = parser.current() else {
            return abort_eof(parser);
        };

        if token.kind == T![']'] {
            parser.bump(T![']']);
            return ContainerStep::Closed;
        }

        if index == 0 {
            if token.kind == T![,] {
                let (first, rest) = eat_commas(parser);
                parser.error(first, SyntaxErrorKind::ArrayLeadingCommas(rest));
                continue;
            }
            if token.kind == T!['}'] {
                report_unexpected(parser, token.range, token.kind, EXPECTED_ARRAY_SEP);
                return ContainerStep::Aborted;
            }
            return ContainerStep::Item;
        }

        if token.kind == T![,] {
            return consume_array_comma(parser);
        }

        if token.kind == SyntaxKind::InvalidToken {
            bump_error_token(parser);
            continue;
        }

        report_unexpected(parser, token.range, token.kind, EXPECTED_ARRAY_SEP);
        if token.kind == T!['}'] {
            return ContainerStep::Aborted;
        }
        if can_start_item(token.kind) {
            return ContainerStep::Item;
        }
        bump_error_token(parser);
    }
}

fn consume_array_comma<G: Grammar>(parser: &mut Parser<'_, G>) -> ContainerStep {
    let first_comma = parser.bump(T![,]).range;
    let mut extra = Vec::new();
    while parser.at(T![,]) {
        extra.push(parser.bump(T![,]).range);
    }

    let Some(after) = parser.current() else {
        if let Some((&first_extra, rest)) = extra.split_first() {
            parser.error(
                first_extra,
                SyntaxErrorKind::ArrayConsecutiveCommas(rest.to_vec()),
            );
        }
        return abort_eof(parser);
    };

    if after.kind == T![']'] {
        parser.error(first_comma, SyntaxErrorKind::ArrayTrailingCommas(extra));
        parser.bump(T![']']);
        return ContainerStep::Closed;
    }

    if let Some((&first_extra, rest)) = extra.split_first() {
        parser.error(
            first_extra,
            SyntaxErrorKind::ArrayConsecutiveCommas(rest.to_vec()),
        );
    }

    if after.kind == T!['}'] {
        report_unexpected(
            parser,
            after.range,
            after.kind,
            SyntaxKindSet::from_kind(T![']']),
        );
        return ContainerStep::Aborted;
    }

    ContainerStep::Item
}

/// Guarantees the current token is [`SyntaxKind::String`] when returning [`ContainerStep::Item`].
pub(crate) fn next_object_entry<G: Grammar>(
    parser: &mut Parser<'_, G>,
    index: usize,
) -> ContainerStep {
    let mut need_comma = index > 0;

    loop {
        let Some(token) = parser.current() else {
            return abort_eof(parser);
        };

        if token.kind == T!['}'] {
            parser.bump(T!['}']);
            return ContainerStep::Closed;
        }

        if need_comma {
            match advance_object_separator(parser, token.kind, token.range) {
                SeparatorStep::ReadyForKey => {
                    need_comma = false;
                    continue;
                }
                SeparatorStep::RetrySeparator => continue,
                SeparatorStep::Return(step) => return step,
            }
        }

        if token.kind == T![,] {
            let (first, rest) = eat_commas(parser);
            parser.error(first, SyntaxErrorKind::ObjectLeadingCommas(rest));
            continue;
        }

        if token.kind == T![string] {
            return ContainerStep::Item;
        }

        if token.kind == SyntaxKind::InvalidToken {
            bump_error_token(parser);
            continue;
        }

        report_unexpected(
            parser,
            token.range,
            token.kind,
            SyntaxKindSet::from_kind(T![string]),
        );
        if token.kind == T![']'] {
            return ContainerStep::Aborted;
        }
        skip_unexpected_object_token(parser);
    }
}

enum SeparatorStep {
    ReadyForKey,
    RetrySeparator,
    Return(ContainerStep),
}

fn advance_object_separator<G: Grammar>(
    parser: &mut Parser<'_, G>,
    kind: SyntaxKind,
    range: TextRange,
) -> SeparatorStep {
    if kind == T![,] {
        let first_comma = parser.bump(T![,]).range;
        let mut extra = Vec::new();
        while parser.at(T![,]) {
            extra.push(parser.bump(T![,]).range);
        }

        let Some(after) = parser.current() else {
            if let Some((&first_extra, rest)) = extra.split_first() {
                parser.error(
                    first_extra,
                    SyntaxErrorKind::ObjectConsecutiveCommas(rest.to_vec()),
                );
            }
            return SeparatorStep::Return(abort_eof(parser));
        };

        if after.kind == T!['}'] {
            parser.error(first_comma, SyntaxErrorKind::ObjectTrailingCommas(extra));
            parser.bump(T!['}']);
            return SeparatorStep::Return(ContainerStep::Closed);
        }

        if let Some((&first_extra, rest)) = extra.split_first() {
            parser.error(
                first_extra,
                SyntaxErrorKind::ObjectConsecutiveCommas(rest.to_vec()),
            );
        }

        return SeparatorStep::ReadyForKey;
    }

    if kind == SyntaxKind::InvalidToken {
        bump_error_token(parser);
        return SeparatorStep::RetrySeparator;
    }

    report_unexpected(parser, range, kind, EXPECTED_OBJECT_SEP);
    if kind == T![']'] {
        return SeparatorStep::Return(ContainerStep::Aborted);
    }
    if kind == T![string] {
        return SeparatorStep::Return(ContainerStep::Item);
    }

    skip_unexpected_object_token(parser);
    SeparatorStep::RetrySeparator
}

/// Returns `true` when the caller should proceed to parse the field value.
pub(crate) fn expect_colon<G: Grammar>(parser: &mut Parser<'_, G>) -> bool {
    let Some(token) = parser.current() else {
        let eof = parser.eof_range();
        parser.error(
            eof,
            SyntaxErrorKind::UnexpectedEof {
                expected: SyntaxKindSet::from_kind(T![:]),
            },
        );
        return false;
    };

    if token.kind == T![:] {
        parser.bump(T![:]);
        if parser.at(T![:]) {
            let first = parser.bump(T![:]).range;
            let mut rest = Vec::new();
            while parser.at(T![:]) {
                rest.push(parser.bump(T![:]).range);
            }
            parser.error(first, SyntaxErrorKind::ObjectConsecutiveColons(rest));
        }
        return true;
    }

    if token.kind != SyntaxKind::InvalidToken {
        report_unexpected(
            parser,
            token.range,
            token.kind,
            SyntaxKindSet::from_kind(T![:]),
        );
    }

    !matches!(token.kind, T![,] | T!['}'] | T![']'])
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
        bump_error_token(parser);
    }
}

fn parse_json_object<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::JsonObject);
    parser.bump(T!['{']);

    let mut index = 0;
    loop {
        match next_object_entry(parser, index) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                index += 1;
                parser.start_node(SyntaxKind::JsonField);
                parser.bump(T![string]);
                if expect_colon(parser) {
                    match parser.current() {
                        None => {
                            let eof = parser.eof_range();
                            parser.error(
                                eof,
                                SyntaxErrorKind::UnexpectedEof {
                                    expected: SyntaxKindSet::VALUE
                                        | SyntaxKindSet::OPENING_DELIMITER,
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

fn parse_json_array<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::JsonArray);
    parser.bump(T!['[']);

    let mut index = 0;
    loop {
        match next_array_element(parser, index, is_json_value_start) {
            ContainerStep::Closed | ContainerStep::Aborted => break,
            ContainerStep::Item => {
                index += 1;
                parse_json_value(parser);
            }
        }
    }

    parser.finish_node();
}

pub(crate) const fn is_json_value_start(kind: SyntaxKind) -> bool {
    matches!(
        kind,
        T!['{'] | T!['['] | T![string] | T![number] | T![true] | T![false] | T![null]
    )
}

pub(crate) fn recover_unexpected_item<G: Grammar>(parser: &mut Parser<'_, G>) {
    let Some(token) = parser.current() else {
        let eof = parser.eof_range();
        parser.error(
            eof,
            SyntaxErrorKind::UnexpectedEof {
                expected: G::ITEM_FIRST,
            },
        );
        return;
    };

    if token.kind == SyntaxKind::InvalidToken {
        bump_error_token(parser);
        return;
    }

    report_unexpected(parser, token.range, token.kind, G::ITEM_FIRST);

    if !matches!(token.kind, T![,] | T!['}'] | T![']']) {
        parse_json_value(parser);
    }
}

fn abort_eof<G: Grammar>(parser: &mut Parser<'_, G>) -> ContainerStep {
    let eof = parser.eof_range();
    parser.error(
        eof,
        SyntaxErrorKind::UnexpectedEof {
            expected: SyntaxKindSet::COMPLETE,
        },
    );
    ContainerStep::Aborted
}

fn report_unexpected<G: Grammar>(
    parser: &mut Parser<'_, G>,
    range: TextRange,
    found: SyntaxKind,
    expected: SyntaxKindSet,
) {
    parser.error(range, SyntaxErrorKind::UnexpectedToken { found, expected });
}

fn bump_error_token<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::Error);
    parser.bump_any();
    parser.finish_node();
}

fn eat_commas<G: Grammar>(parser: &mut Parser<'_, G>) -> (TextRange, Vec<TextRange>) {
    let first = parser.bump(T![,]).range;
    let mut rest = Vec::new();
    while parser.at(T![,]) {
        rest.push(parser.bump(T![,]).range);
    }
    (first, rest)
}

fn skip_unexpected_object_token<G: Grammar>(parser: &mut Parser<'_, G>) {
    if matches!(
        parser.current().map(|tok| tok.kind),
        Some(T!['{'] | T!['['])
    ) {
        parse_json_value(parser);
    } else {
        bump_error_token(parser);
    }
}
