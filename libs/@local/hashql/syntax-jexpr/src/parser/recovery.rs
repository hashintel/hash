use core::{alloc::Allocator, ops::ControlFlow};

use text_size::TextRange;

pub(crate) use self::json::parse_json_value;
use super::{Grammar, Parser, PeekToken, json};
use crate::{
    error::{
        ArrayErrorKind, DelimiterKind, EofContext, GrammarKind, LexerErrorKind, ObjectErrorKind,
        SyntaxErrorKind, UnexpectedTokenContext,
    },
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

/// Ready to parse the next object entry with its proven string key token.
///
/// `separator` holds the single comma before this entry when one was cleanly consumed.
pub(crate) struct ObjectEntry<'parser, 'source, G, A: Allocator> {
    pub separator: Option<TextRange>,
    pub key: PeekToken<'parser, 'source, G, A>,
}

pub(crate) enum FieldValue<'parser, 'source, G, A: Allocator> {
    /// A non-boundary token ready for value parsing.
    Token(PeekToken<'parser, 'source, G, A>),
    /// A container boundary (`,`, `}`, or `]`) immediately following a colon.
    Missing(TextRange),
    /// End of input immediately following a colon.
    Eof,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Separators<A: Allocator> {
    pub primary: TextRange,
    pub secondary: Vec<TextRange, A>,
}

impl<A: Allocator> Separators<A> {
    fn eat<G>(first: PeekToken<'_, '_, G, A>) -> Self
    where
        G: Grammar,
        A: Clone,
    {
        let kind = first.kind();
        let primary = first.range();
        let parser = first.commit();

        let mut secondary = Vec::new_in(parser.allocator().clone());
        while let Some(range) = parser.try_bump(kind) {
            secondary.push(range);
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
        parser.nested(json::parse_json_value);
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
    let Some(mut colon) = parser.peek() else {
        return MalformedEntry::StrayToken;
    };
    if colon.kind() != T![:] {
        return MalformedEntry::StrayToken;
    }

    colon.start_node(SyntaxKind::Error);
    let parser = colon.commit();
    if !parser.at_set(SyntaxKindSet::ITEM_BOUNDARY) {
        parser.nested(json::parse_json_value);
    }
    parser.finish_node();

    MalformedEntry::KeyValue
}

fn consume_array_comma<G, A>(
    parser: &mut Parser<'_, G, A>,
    open: TextRange,
    separators: Separators<A>,
) -> ControlFlow<ContainerBreak>
where
    G: Grammar,
    A: Allocator + Clone,
{
    let Some(after) = parser.peek() else {
        let trailing = separators.range();
        let _: ControlFlow<(), _> =
            separators.try_report_consecutive(parser, DelimiterKind::Bracket);

        parser.record_unclosed_eof(open, DelimiterKind::Bracket, Some(trailing));
        return ControlFlow::Break(ContainerBreak::Aborted);
    };

    let kind = after.kind();
    if kind == T![']'] {
        after.commit();
        parser.error(
            separators.primary,
            SyntaxErrorKind::Array(ArrayErrorKind::TrailingCommas(separators)),
        );

        return ControlFlow::Break(ContainerBreak::Closed);
    }

    let range = after.range();
    let _: ControlFlow<(), _> = separators.try_report_consecutive(parser, DelimiterKind::Bracket);

    if kind == T!['}'] {
        report_mismatched_delimiter(parser, range, kind, open, DelimiterKind::Bracket);

        return ControlFlow::Break(ContainerBreak::Aborted);
    }

    ControlFlow::Continue(())
}

pub(crate) fn next_array_element<G, A>(
    parser: &mut Parser<'_, G, A>,
    open: TextRange,
    index: usize,
    item_first: SyntaxKindSet,
) -> ControlFlow<ContainerBreak>
where
    G: Grammar,
    A: Allocator + Clone,
{
    let mut skipped_invalid = false;

    loop {
        let Some(token) = parser.peek() else {
            parser.record_unclosed_eof(open, DelimiterKind::Bracket, None);
            return ControlFlow::Break(ContainerBreak::Aborted);
        };

        let kind = token.kind();
        if kind == T![']'] {
            token.commit();
            return ControlFlow::Break(ContainerBreak::Closed);
        }

        if kind == T!['}'] {
            let range = token.range();
            report_mismatched_delimiter(parser, range, kind, open, DelimiterKind::Bracket);

            return ControlFlow::Break(ContainerBreak::Aborted);
        }

        if index == 0 {
            if kind == T![,] {
                let separators = Separators::eat(token);
                parser.error(
                    separators.primary,
                    SyntaxErrorKind::Array(ArrayErrorKind::LeadingCommas(separators)),
                );

                continue;
            }

            return ControlFlow::Continue(());
        }

        if kind == T![,] {
            let separators = Separators::eat(token);
            return consume_array_comma(parser, open, separators);
        }

        if kind == SyntaxKind::InvalidToken {
            parser.skip_invalid_tokens();
            skipped_invalid = true;
            continue;
        }

        let range = token.range();
        if item_first.contains(kind) {
            // An invalid token where the comma belongs is already reported.
            if !skipped_invalid {
                report_missing_comma(parser, range, kind, DelimiterKind::Bracket);
            }

            return ControlFlow::Continue(());
        }

        report_unexpected(
            parser,
            range,
            kind,
            EXPECTED_ARRAY_SEPARATOR,
            UnexpectedTokenContext::General,
        );
        parser.error_node();
    }
}

enum ObjectCommaStep {
    ReadyForKey(Option<TextRange>),
    Break(ContainerBreak),
}

enum ObjectSeparatorStep {
    FoundKey,
    RetrySeparator,
    Break(ContainerBreak),
}

fn finish_object_comma<G, A>(
    parser: &mut Parser<'_, G, A>,
    open: TextRange,
    separators: Separators<A>,
) -> ObjectCommaStep
where
    G: Grammar,
    A: Allocator + Clone,
{
    let Some(after) = parser.peek() else {
        let trailing = separators.range();
        let _: ControlFlow<(), _> = separators.try_report_consecutive(parser, DelimiterKind::Brace);

        parser.record_unclosed_eof(open, DelimiterKind::Brace, Some(trailing));
        return ObjectCommaStep::Break(ContainerBreak::Aborted);
    };

    if after.kind() == T!['}'] {
        after.commit();
        parser.error(
            separators.primary,
            SyntaxErrorKind::Object(ObjectErrorKind::TrailingCommas(separators)),
        );

        return ObjectCommaStep::Break(ContainerBreak::Closed);
    }

    let clean_comma = separators
        .try_report_consecutive(parser, DelimiterKind::Brace)
        .continue_value()
        .map(|separators| separators.primary);

    ObjectCommaStep::ReadyForKey(clean_comma)
}

fn advance_object_separator<G, A>(
    parser: &mut Parser<'_, G, A>,
    open: TextRange,
    kind: SyntaxKind,
    range: TextRange,
    skipped_invalid: bool,
) -> ObjectSeparatorStep
where
    G: Grammar,
    A: Allocator + Clone,
{
    if kind == T![string] {
        // An invalid token where the comma belongs is already reported.
        if !skipped_invalid {
            report_missing_comma(parser, range, kind, DelimiterKind::Brace);
        }

        return ObjectSeparatorStep::FoundKey;
    }

    if kind == T![']'] {
        report_mismatched_delimiter(parser, range, kind, open, DelimiterKind::Brace);
        return ObjectSeparatorStep::Break(ContainerBreak::Aborted);
    }

    report_unexpected(
        parser,
        range,
        kind,
        EXPECTED_OBJECT_SEPARATOR,
        UnexpectedTokenContext::General,
    );
    skip_unexpected_object_token(parser);
    ObjectSeparatorStep::RetrySeparator
}

/// Guarantees the returned [`ObjectEntry::key`] has kind [`SyntaxKind::String`].
pub(crate) fn next_object_entry<'parser, 'source, G, A>(
    parser: &'parser mut Parser<'source, G, A>,
    open: TextRange,
    index: usize,
) -> ControlFlow<ContainerBreak, ObjectEntry<'parser, 'source, G, A>>
where
    G: Grammar,
    A: Allocator + Clone,
{
    let mut need_comma = index > 0;
    let mut separator = None;
    let mut skipped_invalid = false;

    let entry_separator = loop {
        let Some(token) = parser.peek() else {
            parser.record_unclosed_eof(open, DelimiterKind::Brace, None);
            return ControlFlow::Break(ContainerBreak::Aborted);
        };

        let kind = token.kind();
        if kind == T!['}'] {
            token.commit();
            return ControlFlow::Break(ContainerBreak::Closed);
        }

        if need_comma {
            if kind == T![,] {
                let separators = Separators::eat(token);
                match finish_object_comma(parser, open, separators) {
                    ObjectCommaStep::ReadyForKey(comma) => {
                        need_comma = false;
                        separator = comma;
                        continue;
                    }
                    ObjectCommaStep::Break(step) => return ControlFlow::Break(step),
                }
            }

            if kind == SyntaxKind::InvalidToken {
                parser.skip_invalid_tokens();
                skipped_invalid = true;
                continue;
            }

            let range = token.range();
            match advance_object_separator(parser, open, kind, range, skipped_invalid) {
                ObjectSeparatorStep::FoundKey => break None,
                ObjectSeparatorStep::RetrySeparator => continue,
                ObjectSeparatorStep::Break(step) => return ControlFlow::Break(step),
            }
        }

        if kind == T![string] {
            break separator;
        }

        if kind == T![,] {
            let separators = Separators::eat(token);
            parser.error(
                separators.primary,
                SyntaxErrorKind::Object(ObjectErrorKind::LeadingCommas(separators)),
            );

            continue;
        }

        let range = token.range();
        if kind == SyntaxKind::InvalidToken {
            if matches!(
                skip_malformed_object_entry(parser),
                MalformedEntry::KeyValue
            ) {
                need_comma = true;
            }
            continue;
        }

        if kind == T![']'] {
            report_mismatched_delimiter(parser, range, kind, open, DelimiterKind::Brace);

            return ControlFlow::Break(ContainerBreak::Aborted);
        }

        report_unexpected(
            parser,
            range,
            kind,
            SyntaxKindSet::from_kind(T![string]),
            UnexpectedTokenContext::ObjectKey,
        );

        if matches!(
            skip_malformed_object_entry(parser),
            MalformedEntry::KeyValue
        ) {
            need_comma = true;
        }
    };

    let Some(key) = parser.peek() else {
        unreachable!("object entry loop only breaks with a buffered string token");
    };
    debug_assert_eq!(key.kind(), T![string]);
    ControlFlow::Continue(ObjectEntry {
        separator: entry_separator,
        key,
    })
}

fn field_value_after_colon<'parser, 'source, G, A>(
    parser: &'parser mut Parser<'source, G, A>,
) -> ControlFlow<(), FieldValue<'parser, 'source, G, A>>
where
    G: Grammar,
    A: Allocator + Clone,
{
    if let Some(extra) = parser.peek()
        && extra.kind() == T![:]
    {
        let separators = Separators::eat(extra);
        parser.error(
            separators.primary,
            SyntaxErrorKind::Object(ObjectErrorKind::ConsecutiveColons(separators)),
        );
    }

    let value = match parser.peek() {
        None => FieldValue::Eof,
        Some(token) if SyntaxKindSet::ITEM_BOUNDARY.contains(token.kind()) => {
            FieldValue::Missing(token.range())
        }
        Some(token) => FieldValue::Token(token),
    };

    ControlFlow::Continue(value)
}

pub(crate) fn expect_colon<'parser, 'source, G, A>(
    parser: &'parser mut Parser<'source, G, A>,
    key_range: TextRange,
) -> ControlFlow<(), FieldValue<'parser, 'source, G, A>>
where
    G: Grammar,
    A: Allocator + Clone,
{
    // Fast path when `:` directly follows the key with no intervening invalid tokens.
    if let Some(colon) = parser.peek()
        && colon.kind() == T![:]
    {
        colon.commit();
        return field_value_after_colon(parser);
    }

    // An invalid token between the key and the colon, or in place of the colon, is already
    // reported.
    let skipped_invalid = parser.skip_invalid_tokens();

    if let Some(colon) = parser.peek()
        && colon.kind() == T![:]
    {
        colon.commit();
        return field_value_after_colon(parser);
    }

    let Some(token) = parser.peek() else {
        if !skipped_invalid {
            parser.record_eof(
                SyntaxKindSet::from_kind(T![:]),
                EofContext::FieldColon { key: key_range },
            );
        }

        return ControlFlow::Break(());
    };

    let kind = token.kind();
    let range = token.range();

    if !skipped_invalid {
        report_unexpected(
            parser,
            range,
            kind,
            SyntaxKindSet::from_kind(T![:]),
            UnexpectedTokenContext::MissingColon { key: key_range },
        );
    }

    if SyntaxKindSet::ITEM_BOUNDARY.contains(kind) {
        ControlFlow::Break(())
    } else {
        let Some(token) = parser.peek() else {
            unreachable!("non-boundary token remains buffered after reporting missing colon");
        };
        ControlFlow::Continue(FieldValue::Token(token))
    }
}

pub(crate) fn parse_object_field_value<G, A>(
    parser: &mut Parser<'_, G, A>,
    key_range: TextRange,
    parse_value: impl FnOnce(&mut Parser<'_, G, A>),
) where
    G: Grammar,
    A: Allocator + Clone,
{
    match expect_colon(parser, key_range) {
        ControlFlow::Continue(FieldValue::Token(_)) => parse_value(parser),
        ControlFlow::Continue(FieldValue::Eof) => {
            parser.record_eof(
                G::ITEM_FIRST,
                EofContext::FieldValue {
                    key: key_range,
                    field: None,
                },
            );
        }
        ControlFlow::Continue(FieldValue::Missing(boundary)) => {
            let Some(token) = parser.peek() else {
                unreachable!("FieldValue::Missing guarantees a buffered boundary token");
            };

            let found = token.kind();
            report_unexpected(
                parser,
                boundary,
                found,
                G::ITEM_FIRST,
                UnexpectedTokenContext::MissingFieldValue { key: key_range },
            );
        }
        ControlFlow::Break(()) => {}
    }
}

pub(crate) fn recover_unexpected_item<G, A>(parser: &mut Parser<'_, G, A>)
where
    G: Grammar,
    A: Allocator + Clone,
{
    let skipped_invalid = parser.skip_invalid_tokens();
    if parser.skip_over_nested_container().is_break() {
        return;
    }

    let Some(token) = parser.peek() else {
        if !skipped_invalid {
            parser.record_eof(G::ITEM_FIRST, EofContext::Document);
        }

        return;
    };

    let kind = token.kind();
    let range = token.range();

    if skipped_invalid {
        // The item may follow the invalid tokens. Where the container continues or ends
        // instead, the invalid tokens took the place of the item.
        if G::ITEM_FIRST.contains(kind) {
            G::parse_item(parser);
            return;
        }

        if SyntaxKindSet::ITEM_BOUNDARY.contains(kind) {
            return;
        }
    }

    if kind == T!['['] && G::KIND == GrammarKind::Value {
        let start = range.start();
        json::parse_json_value(parser);
        let array_range = TextRange::new(start, parser.last_token_end());
        report_unexpected(
            parser,
            array_range,
            kind,
            G::ITEM_FIRST,
            UnexpectedTokenContext::ArrayInValue,
        );
        return;
    }

    let context = if SyntaxKindSet::VALUE.contains(kind) && G::ITEM_FIRST.contains(T!['{']) {
        UnexpectedTokenContext::BarePrimitive {
            text: parser.slice(range).to_owned(),
        }
    } else {
        UnexpectedTokenContext::General
    };

    report_unexpected(parser, range, kind, G::ITEM_FIRST, context);

    if !SyntaxKindSet::ITEM_BOUNDARY.contains(kind) {
        json::parse_json_value(parser);
    }
}
