use core::ops::ControlFlow;

use text_size::TextRange;

use super::{Grammar, Parser, json};
use crate::{
    error::{
        ArrayErrorKind, DelimiterKind, EofContext, LexerErrorKind, ObjectErrorKind,
        SyntaxErrorKind, UnexpectedTokenContext,
    },
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

const EXPECTED_ARRAY_SEP: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![,], T![']']]);

const EXPECTED_OBJECT_SEP: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![,], T!['}']]);

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ContainerBreak {
    Closed,
    /// Stopped on EOF or an enclosing container's closing delimiter.
    Aborted,
}

/// Ready to parse the next element or entry.
///
/// `separator` holds the single comma before this item when one was cleanly consumed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Item {
    separator: Option<TextRange>,
}

fn consume_array_comma<G: Grammar>(
    parser: &mut Parser<'_, G>,
    open: TextRange,
) -> ControlFlow<ContainerBreak, Item> {
    let separators = Separators::eat(parser, T![,]);

    let Some(after) = parser.current() else {
        separators.try_report_consecutive(parser, DelimiterKind::Bracket);
        return abort_eof(parser, open, DelimiterKind::Bracket);
    };

    if after.kind == T![']'] {
        parser.error(
            separators.primary,
            SyntaxErrorKind::Array(ArrayErrorKind::TrailingCommas(separators)),
        );

        parser.bump(T![']']);
        return ContainerStep::Closed;
    }

    let separator = separators
        .try_report_consecutive(parser, DelimiterKind::Bracket)
        .continue_value()
        .map(|separators| separators.primary);

    if after.kind == T!['}'] {
        report_mismatched_delimiter(
            parser,
            after.range,
            after.kind,
            open,
            DelimiterKind::Bracket,
        );

        return ContainerStep::Aborted;
    }

    ContainerStep::Item { separator }
}

pub(crate) fn next_array_element<G: Grammar>(
    parser: &mut Parser<'_, G>,
    open: TextRange,
    index: usize,
    can_start_item: impl Fn(SyntaxKind) -> bool,
) -> ControlFlow<ContainerBreak, Item> {
    loop {
        let Some(token) = parser.current() else {
            return abort_eof(parser, open, DelimiterKind::Bracket);
        };

        if token.kind == T![']'] {
            parser.bump(T![']']);
            return ContainerStep::Closed;
        }

        if index == 0 {
            if token.kind == T![,] {
                let separators = Separators::eat(parser, T![,]);
                parser.error(
                    separators.primary,
                    SyntaxErrorKind::Array(ArrayErrorKind::LeadingCommas(separators)),
                );

                continue;
            }

            if token.kind == T!['}'] {
                report_mismatched_delimiter(
                    parser,
                    token.range,
                    token.kind,
                    open,
                    DelimiterKind::Bracket,
                );

                return ControlFlow::Break(ContainerBreak::Aborted);
            }

            return ControlFlow::Continue(Item { separator: None });
        }

        if token.kind == T![,] {
            return consume_array_comma(parser, open);
        }

        if token.kind == SyntaxKind::InvalidToken {
            bump_error_token(parser);
            continue;
        }

        if token.kind == T!['}'] {
            report_mismatched_delimiter(
                parser,
                token.range,
                token.kind,
                open,
                DelimiterKind::Bracket,
            );

            return ContainerStep::Aborted;
        }

        if can_start_item(token.kind) {
            report_missing_comma(parser, token.range, token.kind, DelimiterKind::Bracket);
            return ContainerStep::Item { separator: None };
        }

        report_unexpected(
            parser,
            token.range,
            token.kind,
            EXPECTED_ARRAY_SEP,
            UnexpectedTokenContext::General,
        );
        bump_error_token(parser);
    }
}

/// Guarantees the current token is [`SyntaxKind::String`] when returning [`ContainerStep::Item`].
pub(crate) fn next_object_entry<G: Grammar>(
    parser: &mut Parser<'_, G>,
    open: TextRange,
    index: usize,
) -> ControlFlow<ContainerBreak, Item> {
    let mut need_comma = index > 0;
    let mut separator = None;

    loop {
        let Some(token) = parser.current() else {
            return abort_eof(parser, open, DelimiterKind::Brace);
        };

        if token.kind == T!['}'] {
            parser.bump(T!['}']);
            return ContainerStep::Closed;
        }

        if need_comma {
            match advance_object_separator(parser, open, token.kind, token.range) {
                SeparatorStep::ReadyForKey(comma) => {
                    need_comma = false;
                    separator = comma;
                    continue;
                }
                SeparatorStep::RetrySeparator => continue,
                SeparatorStep::Return(step) => return step,
            }
        }

        if token.kind == T![,] {
            let (first, rest, patch_range) = eat_separator_run(parser, T![,], b',');
            parser.error(
                first,
                SyntaxErrorKind::Object(ObjectErrorKind::LeadingCommas { rest, patch_range }),
            );
            continue;
        }

        if token.kind == T![string] {
            return ContainerStep::Item { separator };
        }

        if token.kind == SyntaxKind::InvalidToken {
            if skip_malformed_object_entry(parser) {
                need_comma = true;
            }
            continue;
        }

        if token.kind == T![']'] {
            report_mismatched_delimiter(
                parser,
                token.range,
                token.kind,
                open,
                DelimiterKind::Brace,
            );
            return ContainerStep::Aborted;
        }

        report_unexpected(
            parser,
            token.range,
            token.kind,
            SyntaxKindSet::from_kind(T![string]),
            UnexpectedTokenContext::ObjectKey,
        );
        if skip_malformed_object_entry(parser) {
            need_comma = true;
        }
    }
}

enum SeparatorStep {
    ReadyForKey(Option<TextRange>),
    RetrySeparator,
    Return(ControlFlow<ContainerBreak, Item>),
}

fn advance_object_separator<G: Grammar>(
    parser: &mut Parser<'_, G>,
    open: TextRange,
    kind: SyntaxKind,
    range: TextRange,
) -> SeparatorStep {
    if kind == T![,] {
        let (first_comma, extra, patch_range) = eat_separator_run(parser, T![,], b',');

        let Some(after) = parser.current() else {
            try_report_consecutive_commas(parser, DelimiterKind::Brace, &extra);
            return SeparatorStep::Return(abort_eof(parser, open, DelimiterKind::Brace));
        };

        if after.kind == T!['}'] {
            parser.error(
                first_comma,
                SyntaxErrorKind::Object(ObjectErrorKind::TrailingCommas {
                    rest: extra,
                    patch_range,
                }),
            );
            parser.bump(T!['}']);
            return SeparatorStep::Return(ContainerStep::Closed);
        }

        let clean_comma = (!try_report_consecutive_commas(parser, DelimiterKind::Brace, &extra))
            .then_some(first_comma);

        return SeparatorStep::ReadyForKey(clean_comma);
    }

    if kind == SyntaxKind::InvalidToken {
        bump_error_token(parser);
        return SeparatorStep::RetrySeparator;
    }

    if kind == T![']'] {
        report_mismatched_delimiter(parser, range, kind, open, DelimiterKind::Brace);
        return SeparatorStep::Return(ContainerStep::Aborted);
    }

    if kind == T![string] {
        report_missing_comma(parser, range, kind, DelimiterKind::Brace);
        return SeparatorStep::Return(ContainerStep::Item { separator: None });
    }

    report_unexpected(
        parser,
        range,
        kind,
        EXPECTED_OBJECT_SEP,
        UnexpectedTokenContext::General,
    );
    skip_unexpected_object_token(parser);
    SeparatorStep::RetrySeparator
}

/// Returns `true` when the caller should proceed to parse the field value.
pub(crate) fn expect_colon<G: Grammar>(parser: &mut Parser<'_, G>, key_range: TextRange) -> bool {
    let Some(token) = parser.current() else {
        parser.record_eof(
            SyntaxKindSet::from_kind(T![:]),
            EofContext::FieldColon { key: key_range },
        );
        return false;
    };

    if token.kind == T![:] {
        parser.bump(T![:]);
        if parser.at(T![:]) {
            let (first, rest, patch_range) = eat_separator_run(parser, T![:], b':');
            parser.error(
                first,
                SyntaxErrorKind::Object(ObjectErrorKind::ConsecutiveColons { rest, patch_range }),
            );
        }
        return true;
    }

    if token.kind != SyntaxKind::InvalidToken {
        report_unexpected(
            parser,
            token.range,
            token.kind,
            SyntaxKindSet::from_kind(T![:]),
            UnexpectedTokenContext::MissingColon { key: key_range },
        );
    }

    !matches!(token.kind, T![,] | T!['}'] | T![']'])
}

pub(crate) use self::json::parse_json_value;

pub(crate) fn recover_unexpected_item<G: Grammar>(parser: &mut Parser<'_, G>) {
    let Some(token) = parser.current() else {
        parser.record_eof(G::ITEM_FIRST, EofContext::Document);
        return;
    };

    if token.kind == SyntaxKind::InvalidToken {
        bump_error_token(parser);
        return;
    }

    let context = if SyntaxKindSet::VALUE.contains(token.kind) && G::ITEM_FIRST.contains(T!['{']) {
        UnexpectedTokenContext::BarePrimitiveInExpr {
            text: parser.slice(token.range).to_owned(),
        }
    } else {
        UnexpectedTokenContext::General
    };

    report_unexpected(parser, token.range, token.kind, G::ITEM_FIRST, context);

    if !matches!(token.kind, T![,] | T!['}'] | T![']']) {
        json::parse_json_value(parser);
    }
}

fn abort_eof<G: Grammar>(
    parser: &mut Parser<'_, G>,
    open: TextRange,
    delimiter: DelimiterKind,
) -> ControlFlow<ContainerBreak, Item> {
    parser.record_unclosed_eof(open, delimiter);
    ContainerStep::Aborted
}

fn report_mismatched_delimiter<G: Grammar>(
    parser: &mut Parser<'_, G>,
    range: TextRange,
    found: SyntaxKind,
    open: TextRange,
    expected_close: DelimiterKind,
) {
    report_unexpected(
        parser,
        range,
        found,
        SyntaxKindSet::from_kind(expected_close.close_kind()),
        UnexpectedTokenContext::MismatchedDelimiter {
            open,
            expected_close,
        },
    );
}

fn report_missing_comma<G: Grammar>(
    parser: &mut Parser<'_, G>,
    range: TextRange,
    found: SyntaxKind,
    container: DelimiterKind,
) {
    let expected = match container {
        DelimiterKind::Bracket => EXPECTED_ARRAY_SEP,
        DelimiterKind::Brace => EXPECTED_OBJECT_SEP,
    };
    let after = parser.last_token_end();
    report_unexpected(
        parser,
        range,
        found,
        expected,
        UnexpectedTokenContext::MissingComma { after, container },
    );
}

fn report_unexpected<G: Grammar>(
    parser: &mut Parser<'_, G>,
    range: TextRange,
    found: SyntaxKind,
    expected: SyntaxKindSet,
    context: UnexpectedTokenContext,
) {
    parser.error(
        range,
        SyntaxErrorKind::Lexer(LexerErrorKind::UnexpectedToken {
            found,
            expected,
            context,
        }),
    );
}

pub(crate) fn bump_error_token<G: Grammar>(parser: &mut Parser<'_, G>) {
    parser.start_node(SyntaxKind::Error);
    parser.bump_any();
    parser.finish_node();
}

fn separator_patch_range<G: Grammar>(
    parser: &Parser<'_, G>,
    first: TextRange,
    rest: &[TextRange],
    separator: u8,
) -> Option<TextRange> {
    let end = rest
        .last()
        .copied()
        .map_or_else(|| first.end(), TextRange::end);
    let span = TextRange::new(first.start(), end);
    parser
        .is_pure_separator_span(span, separator)
        .then_some(span)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Separators {
    pub primary: TextRange,
    pub secondary: Vec<TextRange>,
}

impl Separators {
    fn eat<G>(parser: &mut Parser<'_, G>, kind: SyntaxKind) -> Self
    where
        G: Grammar,
    {
        let primary = parser.bump(kind).range;

        let mut secondary = Vec::new();
        while parser.at(kind) {
            secondary.push(parser.bump(kind).range);
        }

        Self { primary, secondary }
    }

    pub(crate) fn range(&self) -> TextRange {
        let mut range = self.primary;

        for &secondary in &self.secondary {
            range = range.cover(secondary);
        }

        range
    }

    fn try_report_consecutive<G: Grammar>(
        self,
        parser: &mut Parser<'_, G>,
        delimiter: DelimiterKind,
    ) -> ControlFlow<(), Self> {
        let &[first, ..] = &*self.secondary else {
            return ControlFlow::Continue(self);
        };

        let kind = match delimiter {
            DelimiterKind::Bracket => {
                SyntaxErrorKind::Array(ArrayErrorKind::ConsecutiveCommas(self))
            }
            DelimiterKind::Brace => {
                SyntaxErrorKind::Object(ObjectErrorKind::ConsecutiveCommas(self))
            }
        };

        parser.error(first, kind);
        ControlFlow::Break(())
    }
}

fn skip_malformed_object_entry<G: Grammar>(parser: &mut Parser<'_, G>) -> bool {
    skip_unexpected_object_token(parser);
    if !parser.at(T![:]) {
        return false;
    }

    parser.start_node(SyntaxKind::Error);
    parser.bump(T![:]);
    if !matches!(
        parser.current().map(|tok| tok.kind),
        None | Some(T![,] | T!['}'] | T![']'])
    ) {
        json::parse_json_value(parser);
    }
    parser.finish_node();
    true
}

fn skip_unexpected_object_token<G: Grammar>(parser: &mut Parser<'_, G>) {
    if matches!(
        parser.current().map(|tok| tok.kind),
        Some(T!['{'] | T!['['])
    ) {
        json::parse_json_value(parser);
    } else {
        bump_error_token(parser);
    }
}
