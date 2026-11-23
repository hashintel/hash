use core::{alloc::Allocator, ops::ControlFlow};

use text_size::TextRange;

pub(crate) use self::json::parse_json_value;
use super::{Grammar, Parser, json};
use crate::{
    error::{
        ArrayErrorKind, DelimiterKind, EofContext, LexerErrorKind, ObjectErrorKind,
        SyntaxErrorKind, UnexpectedTokenContext,
    },
    lexer::Token,
    syntax_kind::{SyntaxKind, T},
    syntax_kind_set::SyntaxKindSet,
};

const EXPECTED_ARRAY_SEPARATOR: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![,], T![']']]);

const EXPECTED_OBJECT_SEPARATOR: SyntaxKindSet = SyntaxKindSet::from_slice(&[T![,], T!['}']]);

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
    pub separator: Option<TextRange>,
}

pub(crate) enum FieldValue<'source> {
    /// A non-boundary token ready for value parsing.
    Token(Token<'source>),
    /// A container boundary (`,`, `}`, or `]`) immediately following a colon.
    Missing(Token<'source>),
    /// End of input immediately following a colon.
    Eof,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Separators<A: Allocator> {
    pub primary: TextRange,
    pub secondary: Vec<TextRange, A>,
}

impl<A: Allocator> Separators<A> {
    fn try_eat<G>(parser: &mut Parser<'_, G, A>, kind: SyntaxKind) -> Option<Self>
    where
        G: Grammar,
        A: Clone,
    {
        let primary = parser.try_bump(kind)?.range;

        let mut secondary = Vec::new_in(parser.allocator().clone());
        while let Some(token) = parser.try_bump(kind) {
            secondary.push(token.range);
        }

        Some(Self { primary, secondary })
    }

    pub(crate) fn range(&self) -> TextRange {
        let mut range = self.primary;

        for &secondary in &self.secondary {
            range = range.cover(secondary);
        }

        range
    }

    fn try_report_consecutive<G>(
        mut self,
        parser: &mut Parser<'_, G, A>,
        delimiter: DelimiterKind,
    ) -> ControlFlow<(), Self>
    where
        G: Grammar,
    {
        if self.secondary.is_empty() {
            return ControlFlow::Continue(self);
        }

        let primary = self.secondary.remove(0);
        let excess = Self {
            primary,
            secondary: self.secondary,
        };

        let kind = match delimiter {
            DelimiterKind::Bracket => {
                SyntaxErrorKind::Array(ArrayErrorKind::ConsecutiveCommas(excess))
            }
            DelimiterKind::Brace => {
                SyntaxErrorKind::Object(ObjectErrorKind::ConsecutiveCommas(excess))
            }
        };

        parser.error(primary, kind);
        ControlFlow::Break(())
    }
}

fn report_unexpected<G, A: Allocator>(
    parser: &mut Parser<'_, G, A>,
    range: TextRange,
    found: SyntaxKind,
    expected: SyntaxKindSet,
    context: UnexpectedTokenContext,
) where
    G: Grammar,
{
    parser.error(
        range,
        SyntaxErrorKind::Lexer(LexerErrorKind::UnexpectedToken {
            found,
            expected,
            context,
        }),
    );
}

fn report_mismatched_delimiter<G, A: Allocator>(
    parser: &mut Parser<'_, G, A>,
    range: TextRange,
    found: SyntaxKind,
    open: TextRange,
    expected_close: DelimiterKind,
) where
    G: Grammar,
{
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

fn report_missing_comma<G, A: Allocator>(
    parser: &mut Parser<'_, G, A>,
    range: TextRange,
    found: SyntaxKind,
    container: DelimiterKind,
) where
    G: Grammar,
{
    let expected = match container {
        DelimiterKind::Bracket => EXPECTED_ARRAY_SEPARATOR,
        DelimiterKind::Brace => EXPECTED_OBJECT_SEPARATOR,
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

fn skip_unexpected_object_token<G, A>(parser: &mut Parser<'_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    if parser.at_set(SyntaxKindSet::OPENING_DELIMITER) {
        json::parse_json_value(parser);
    } else {
        parser.error_node();
    }
}

enum MalformedEntry {
    StrayToken,
    KeyValue,
}

fn skip_malformed_object_entry<G, A>(parser: &mut Parser<'_, G, A>) -> MalformedEntry
where
    G: Grammar,
    A: Allocator + Clone,
{
    skip_unexpected_object_token(parser);
    if !parser.at(T![:]) {
        return MalformedEntry::StrayToken;
    }

    parser.start_node(SyntaxKind::Error);
    parser.bump(T![:]);
    if !parser.at_set(SyntaxKindSet::ITEM_BOUNDARY) {
        json::parse_json_value(parser);
    }
    parser.finish_node();

    MalformedEntry::KeyValue
}

fn consume_array_comma<G, A: Allocator>(
    parser: &mut Parser<'_, G, A>,
    open: TextRange,
    separators: Separators<A>,
) -> ControlFlow<ContainerBreak, Item>
where
    G: Grammar,
{
    let Some(after) = parser.current() else {
        let trailing = separators.range();
        let _: ControlFlow<(), _> =
            separators.try_report_consecutive(parser, DelimiterKind::Bracket);

        parser.record_unclosed_eof(open, DelimiterKind::Bracket, Some(trailing));
        return ControlFlow::Break(ContainerBreak::Aborted);
    };

    if after.kind == T![']'] {
        parser.error(
            separators.primary,
            SyntaxErrorKind::Array(ArrayErrorKind::TrailingCommas(separators)),
        );

        parser.bump(T![']']);
        return ControlFlow::Break(ContainerBreak::Closed);
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

        return ControlFlow::Break(ContainerBreak::Aborted);
    }

    ControlFlow::Continue(Item { separator })
}

pub(crate) fn next_array_element<G, A>(
    parser: &mut Parser<'_, G, A>,
    open: TextRange,
    index: usize,
    item_first: SyntaxKindSet,
) -> ControlFlow<ContainerBreak, Item>
where
    G: Grammar,
    A: Allocator + Clone,
{
    let mut skipped_invalid = false;

    loop {
        if parser.try_bump(T![']']).is_some() {
            return ControlFlow::Break(ContainerBreak::Closed);
        }

        let Some(token) = parser.current() else {
            parser.record_unclosed_eof(open, DelimiterKind::Bracket, None);
            return ControlFlow::Break(ContainerBreak::Aborted);
        };

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

        if index == 0 {
            if let Some(separators) = Separators::try_eat(parser, T![,]) {
                parser.error(
                    separators.primary,
                    SyntaxErrorKind::Array(ArrayErrorKind::LeadingCommas(separators)),
                );

                continue;
            }

            return ControlFlow::Continue(Item { separator: None });
        }

        if let Some(separators) = Separators::try_eat(parser, T![,]) {
            return consume_array_comma(parser, open, separators);
        }

        if parser.skip_invalid_tokens() {
            skipped_invalid = true;
            continue;
        }

        if item_first.contains(token.kind) {
            // An invalid token where the comma belongs is already reported.
            if !skipped_invalid {
                report_missing_comma(parser, token.range, token.kind, DelimiterKind::Bracket);
            }

            return ControlFlow::Continue(Item { separator: None });
        }

        report_unexpected(
            parser,
            token.range,
            token.kind,
            EXPECTED_ARRAY_SEPARATOR,
            UnexpectedTokenContext::General,
        );
        parser.error_node();
    }
}

enum SeparatorStep {
    ReadyForKey(Option<TextRange>),
    RetrySeparator,
    Return(ControlFlow<ContainerBreak, Item>),
}

fn advance_object_separator<G, A>(
    parser: &mut Parser<'_, G, A>,
    open: TextRange,
    kind: SyntaxKind,
    range: TextRange,
) -> SeparatorStep
where
    G: Grammar,
    A: Allocator + Clone,
{
    if let Some(separators) = Separators::try_eat(parser, T![,]) {
        let Some(after) = parser.current() else {
            let trailing = separators.range();
            let _: ControlFlow<(), _> =
                separators.try_report_consecutive(parser, DelimiterKind::Brace);

            parser.record_unclosed_eof(open, DelimiterKind::Brace, Some(trailing));
            return SeparatorStep::Return(ControlFlow::Break(ContainerBreak::Aborted));
        };

        if after.kind == T!['}'] {
            parser.error(
                separators.primary,
                SyntaxErrorKind::Object(ObjectErrorKind::TrailingCommas(separators)),
            );

            parser.bump(T!['}']);
            return SeparatorStep::Return(ControlFlow::Break(ContainerBreak::Closed));
        }

        let clean_comma = separators
            .try_report_consecutive(parser, DelimiterKind::Brace)
            .continue_value()
            .map(|separators| separators.primary);

        return SeparatorStep::ReadyForKey(clean_comma);
    }

    if kind == T![']'] {
        report_mismatched_delimiter(parser, range, kind, open, DelimiterKind::Brace);
        return SeparatorStep::Return(ControlFlow::Break(ContainerBreak::Aborted));
    }

    if kind == T![string] {
        report_missing_comma(parser, range, kind, DelimiterKind::Brace);
        return SeparatorStep::Return(ControlFlow::Continue(Item { separator: None }));
    }

    report_unexpected(
        parser,
        range,
        kind,
        EXPECTED_OBJECT_SEPARATOR,
        UnexpectedTokenContext::General,
    );
    skip_unexpected_object_token(parser);
    SeparatorStep::RetrySeparator
}

/// Guarantees the current token is [`SyntaxKind::String`] when returning [`ControlFlow::Continue`].
pub(crate) fn next_object_entry<G, A>(
    parser: &mut Parser<'_, G, A>,
    open: TextRange,
    index: usize,
) -> ControlFlow<ContainerBreak, Item>
where
    G: Grammar,
    A: Allocator + Clone,
{
    let mut need_comma = index > 0;
    let mut separator = None;
    let mut skipped_invalid = false;

    loop {
        if parser.try_bump(T!['}']).is_some() {
            return ControlFlow::Break(ContainerBreak::Closed);
        }

        let Some(token) = parser.current() else {
            parser.record_unclosed_eof(open, DelimiterKind::Brace, None);
            return ControlFlow::Break(ContainerBreak::Aborted);
        };

        if need_comma {
            if parser.skip_invalid_tokens() {
                skipped_invalid = true;
                continue;
            }

            // An invalid token where the comma belongs is already reported.
            if skipped_invalid && token.kind == T![string] {
                return ControlFlow::Continue(Item { separator: None });
            }

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

        if let Some(separators) = Separators::try_eat(parser, T![,]) {
            parser.error(
                separators.primary,
                SyntaxErrorKind::Object(ObjectErrorKind::LeadingCommas(separators)),
            );

            continue;
        }

        if token.kind == T![string] {
            return ControlFlow::Continue(Item { separator });
        }

        if token.kind == SyntaxKind::InvalidToken {
            if matches!(
                skip_malformed_object_entry(parser),
                MalformedEntry::KeyValue
            ) {
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

            return ControlFlow::Break(ContainerBreak::Aborted);
        }

        report_unexpected(
            parser,
            token.range,
            token.kind,
            SyntaxKindSet::from_kind(T![string]),
            UnexpectedTokenContext::ObjectKey,
        );

        if matches!(
            skip_malformed_object_entry(parser),
            MalformedEntry::KeyValue
        ) {
            need_comma = true;
        }
    }
}

pub(crate) fn expect_colon<'source, G, A>(
    parser: &mut Parser<'source, G, A>,
    key_range: TextRange,
) -> ControlFlow<(), FieldValue<'source>>
where
    G: Grammar,
    A: Allocator + Clone,
{
    // An invalid token between the key and the colon, or in place of the colon, is already
    // reported.
    let skipped_invalid = parser.skip_invalid_tokens();

    if parser.try_bump(T![:]).is_some() {
        if let Some(separators) = Separators::try_eat(parser, T![:]) {
            parser.error(
                separators.primary,
                SyntaxErrorKind::Object(ObjectErrorKind::ConsecutiveColons(separators)),
            );
        }

        let value = match parser.current() {
            None => FieldValue::Eof,
            Some(token) if SyntaxKindSet::ITEM_BOUNDARY.contains(token.kind) => {
                FieldValue::Missing(token)
            }
            Some(token) => FieldValue::Token(token),
        };

        return ControlFlow::Continue(value);
    }

    let Some(token) = parser.current() else {
        if !skipped_invalid {
            parser.record_eof(
                SyntaxKindSet::from_kind(T![:]),
                EofContext::FieldColon { key: key_range },
            );
        }

        return ControlFlow::Break(());
    };

    if !skipped_invalid {
        report_unexpected(
            parser,
            token.range,
            token.kind,
            SyntaxKindSet::from_kind(T![:]),
            UnexpectedTokenContext::MissingColon { key: key_range },
        );
    }

    if SyntaxKindSet::ITEM_BOUNDARY.contains(token.kind) {
        ControlFlow::Break(())
    } else {
        ControlFlow::Continue(FieldValue::Token(token))
    }
}

pub(crate) fn recover_unexpected_item<G, A>(parser: &mut Parser<'_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    let skipped_invalid = parser.skip_invalid_tokens();

    let Some(token) = parser.current() else {
        if !skipped_invalid {
            parser.record_eof(G::ITEM_FIRST, EofContext::Document);
        }

        return;
    };

    if skipped_invalid {
        // The item may follow the invalid tokens. Where the container continues or ends
        // instead, the invalid tokens took the place of the item.
        if G::ITEM_FIRST.contains(token.kind) {
            G::parse_item(parser);
            return;
        }

        if SyntaxKindSet::ITEM_BOUNDARY.contains(token.kind) {
            return;
        }
    }

    let context = if SyntaxKindSet::VALUE.contains(token.kind) && G::ITEM_FIRST.contains(T!['{']) {
        UnexpectedTokenContext::BarePrimitiveInExpr {
            text: parser.slice(token.range).to_owned(),
        }
    } else {
        UnexpectedTokenContext::General
    };

    report_unexpected(parser, token.range, token.kind, G::ITEM_FIRST, context);

    if !SyntaxKindSet::ITEM_BOUNDARY.contains(token.kind) {
        json::parse_json_value(parser);
    }
}
