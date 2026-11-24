use alloc::borrow::Cow;
use core::{alloc::Allocator, marker::PhantomData, mem, ops::ControlFlow};

use rowan::{Checkpoint, GreenNodeBuilder};
use text_size::{TextRange, TextSize};

use crate::{
    ParserOptions, cst,
    error::{
        DelimiterKind, EofContext, GrammarKind, LexerErrorKind, StringErrorContext, SyntaxError,
        SyntaxErrorKind, UnclosedDelimiters,
    },
    lexer::{LexError, LexedStr, Lexer, StringError, Token, string::EscapeError},
    stack::ensure_sufficient_stack,
    syntax_kind::SyntaxKind,
    syntax_kind_set::SyntaxKindSet,
};

pub(crate) mod dict;
mod document;
pub(crate) mod expr;
pub(crate) mod json;
pub(crate) mod object;
pub(crate) mod recovery;
pub(crate) mod value;

pub(crate) use self::document::Document;

/// Converts a single-line single-quoted string `'...'` into a verified double-quoted JSON string.
#[expect(
    clippy::string_slice,
    reason = "single-quoted tokens always begin and end with ASCII `'`, so +1/-1 are char bounds"
)]
fn single_quoted_to_double_quoted(raw: &str) -> Option<String> {
    if raw.len() < 2 || !raw.starts_with('\'') || !raw.ends_with('\'') {
        return None;
    }

    let inner = &raw[1..(raw.len() - 1)];
    let mut body = String::with_capacity(inner.len() + 2);
    let mut chars = inner.chars();
    while let Some(character) = chars.next() {
        match character {
            '\\' => match chars.next() {
                Some('\'') => body.push('\''),
                Some(other) => {
                    body.push('\\');
                    body.push(other);
                }
                None => return None,
            },
            '"' => body.push_str(r#"\""#),
            other => body.push(other),
        }
    }
    body.push('"');

    let lexed = LexedStr::new(&body).ok()?;
    (lexed.consumed() == body.len()).then(|| format!("\"{body}"))
}

/// A language of J-Expr values that a [`Parser`] reads.
///
/// The parser owns what the languages share: constructor objects, arrays, separators and error
/// recovery. A grammar decides which values may stand where the parser expects an item.
pub(crate) trait Grammar {
    /// Marker that selects the item type of [`Document::tree`].
    type Root: cst::TreeRoot;

    /// Grammar flavor used when rendering diagnostics.
    const KIND: GrammarKind;

    /// Whether a constructor object may carry a `#type` field.
    const ALLOW_TYPE_ANNOTATIONS: bool;

    /// Tokens an item starts with.
    const ITEM_FIRST: SyntaxKindSet;

    /// Parses the item at the current token.
    ///
    /// # Implementation Note
    ///
    /// The parser calls this once for every element of a container and does not check that the
    /// call consumed anything. An implementation must consume at least one token, unless the
    /// current token is `,`, `]` or `}` or the input has ended, because the loop over the
    /// elements does not end otherwise. A token that starts no item goes to
    /// [`recovery::recover_unexpected_item`], which reports and consumes it.
    fn parse_item<A>(parser: &mut Parser<'_, Self, A>)
    where
        Self: Sized,
        A: Allocator + Clone;
}

#[derive(Debug, Copy, Clone)]
enum Lookahead {
    Empty,
    Token(Token),
    Eof,
}

/// Proven non-trivia lookahead token borrowing its [`Parser`].
///
/// Holding a `PeekToken` guarantees that the parser emitted leading trivia and is not at end of
/// input. Dropping it leaves the token buffered for a later [`Parser::peek`]. Consuming it with
/// [`PeekToken::commit`] emits the token and clears the lookahead slot.
pub(crate) struct PeekToken<'parser, 'source, G, A: Allocator> {
    parser: &'parser mut Parser<'source, G, A>,
}

impl<'source, G, A: Allocator> PeekToken<'_, 'source, G, A>
where
    G: Grammar,
{
    #[inline]
    fn token(&self) -> Token {
        match self.parser.lookahead {
            Lookahead::Token(token) => token,
            Lookahead::Empty | Lookahead::Eof => {
                unreachable!("PeekToken guarantees a buffered non-trivia token")
            }
        }
    }

    #[inline]
    pub(crate) fn kind(&self) -> SyntaxKind {
        self.token().kind
    }

    #[inline]
    pub(crate) fn range(&self) -> TextRange {
        self.token().range
    }

    #[inline]
    pub(crate) fn decode_string(&self) -> Option<Cow<'source, str>> {
        self.parser.lexer.decode_string(self.token())
    }

    #[inline]
    pub(crate) fn start_node(&mut self, kind: SyntaxKind) {
        self.parser.builder.start_node(kind.into());
    }

    #[inline]
    pub(crate) fn checkpoint(&self) -> Checkpoint {
        self.parser.builder.checkpoint()
    }
}

impl<'parser, 'source, G, A> PeekToken<'parser, 'source, G, A>
where
    G: Grammar,
    A: Allocator + Clone,
{
    #[inline]
    pub(crate) fn commit(self) -> &'parser mut Parser<'source, G, A> {
        let Lookahead::Token(token) = mem::replace(&mut self.parser.lookahead, Lookahead::Empty)
        else {
            unreachable!("PeekToken guarantees a buffered non-trivia token")
        };

        if let Some(error) = token.error() {
            self.parser.record_lex_error(token.range, error);
        }

        self.parser
            .builder
            .token(token.kind.into(), self.parser.lexer.slice(token.range));
        self.parser.last_token_end = token.range.end();
        self.parser
    }

    #[inline]
    fn commit_skipped(self) {
        let Lookahead::Token(token) = mem::replace(&mut self.parser.lookahead, Lookahead::Empty)
        else {
            unreachable!("PeekToken guarantees a buffered non-trivia token")
        };

        self.parser
            .builder
            .token(token.kind.into(), self.parser.lexer.slice(token.range));
        self.parser.last_token_end = token.range.end();
    }

    #[inline]
    pub(crate) fn commit_node(mut self, kind: SyntaxKind) -> &'parser mut Parser<'source, G, A> {
        self.start_node(kind);
        let parser = self.commit();
        parser.finish_node();
        parser
    }
}

/// Recursive descent parser from J-Expr source to a lossless [`Document`] of grammar `G`.
pub(crate) struct Parser<'source, G, A: Allocator> {
    lexer: Lexer<'source>,
    lookahead: Lookahead,
    builder: GreenNodeBuilder<'static>,
    errors: Vec<SyntaxError<A>, A>,
    last_token_end: TextSize,
    depth: u32,
    options: ParserOptions,
    _grammar: PhantomData<G>,
}

impl<'source, G, A: Allocator> Parser<'source, G, A>
where
    G: Grammar,
{
    pub(crate) fn new_in(source: &'source str, options: ParserOptions, alloc: A) -> Self {
        Self {
            lexer: Lexer::new(source),
            lookahead: Lookahead::Empty,
            builder: GreenNodeBuilder::new(),
            errors: Vec::new_in(alloc),
            last_token_end: TextSize::new(0),
            depth: 0,
            options,
            _grammar: PhantomData,
        }
    }

    pub(crate) fn allocator(&self) -> &A {
        self.errors.allocator()
    }

    pub(crate) fn finish(self) -> Document<G::Root, A> {
        Document::new(self.builder.finish(), self.errors)
    }

    #[inline]
    pub(crate) const fn last_token_end(&self) -> TextSize {
        self.last_token_end
    }

    #[inline]
    pub(crate) fn eof_range(&self) -> TextRange {
        TextRange::empty(self.lexer.eof_offset())
    }

    #[inline]
    pub(crate) const fn error_count(&self) -> usize {
        self.errors.len()
    }

    #[inline]
    pub(crate) fn slice(&self, range: TextRange) -> &'source str {
        self.lexer.slice(range)
    }

    #[inline]
    pub(crate) fn error(&mut self, range: TextRange, kind: SyntaxErrorKind<A>) {
        self.errors.push(SyntaxError::new(range, kind));
    }

    #[inline]
    pub(crate) fn start_node_at(&mut self, checkpoint: Checkpoint, kind: SyntaxKind) {
        self.builder.start_node_at(checkpoint, kind.into());
    }

    /// Closes the current node before flushing any trailing trivia.
    #[inline]
    pub(crate) fn finish_node(&mut self) {
        self.builder.finish_node();
    }

    /// Records an unexpected end of input, which a document reports once.
    ///
    /// A later call adds the delimiters it found open to the first report. That report is the
    /// unterminated token the input ended in, where there is one.
    pub(crate) fn record_eof(&mut self, expected: SyntaxKindSet, context: EofContext<A>) {
        // The report is not always the last error. A value cut short by the end of input can
        // record an error of its own after it.
        let reported = self
            .errors
            .iter_mut()
            .rev()
            .find_map(|error| match error.kind_mut() {
                SyntaxErrorKind::Lexer(
                    LexerErrorKind::UnterminatedBlockComment { unclosed, .. }
                    | LexerErrorKind::InvalidString {
                        error: StringError::Eof,
                        context: StringErrorContext { unclosed, .. },
                    }
                    | LexerErrorKind::UnexpectedEof {
                        context:
                            EofContext::UnclosedDelimiters(UnclosedDelimiters {
                                open: unclosed, ..
                            }),
                        ..
                    },
                ) => Some(Some(unclosed)),
                SyntaxErrorKind::Lexer(
                    LexerErrorKind::InvalidString {
                        error: StringError::Escape(EscapeError::Eof),
                        ..
                    }
                    | LexerErrorKind::UnexpectedEof { .. },
                ) => Some(None),
                SyntaxErrorKind::Lexer(_)
                | SyntaxErrorKind::ExpectedEof
                | SyntaxErrorKind::NestingLimit { .. }
                | SyntaxErrorKind::Array(_)
                | SyntaxErrorKind::Object(_) => None,
            });

        if let Some(unclosed) = reported {
            if let Some(unclosed) = unclosed
                && let EofContext::UnclosedDelimiters(additional) = context
            {
                unclosed.extend(additional.open);
            }

            return;
        }

        self.error(
            self.eof_range(),
            SyntaxErrorKind::Lexer(LexerErrorKind::UnexpectedEof { expected, context }),
        );
    }
}

impl<'source, G, A> Parser<'source, G, A>
where
    G: Grammar,
    A: Allocator + Clone,
{
    #[inline]
    pub(crate) fn error_node(&mut self) {
        if let Some(token) = self.peek() {
            token.commit_node(SyntaxKind::Error);
        }
    }

    /// Consumes every [`SyntaxKind::InvalidToken`] at the current position into its own
    /// [`SyntaxKind::Error`] node and reports whether there was one.
    ///
    /// The lexer error of each token is its diagnostic. A caller that skipped a token treats the
    /// position as already reported and says nothing more about what it expected there.
    pub(crate) fn skip_invalid_tokens(&mut self) -> bool {
        let mut skipped = false;
        while let Some(token) = self.peek()
            && token.kind() == SyntaxKind::InvalidToken
        {
            token.commit_node(SyntaxKind::Error);
            skipped = true;
        }

        skipped
    }

    fn string_error_context(
        &self,
        token_range: TextRange,
        error_range: TextRange,
        error: StringError,
    ) -> StringErrorContext<A> {
        let open_quote =
            TextRange::at(token_range.start(), TextSize::new(1).min(token_range.len()));
        let control_byte = (error == StringError::Control)
            .then(|| self.lexer.slice(error_range).as_bytes().first().copied())
            .flatten();

        let (high_surrogate, invalid_unit) = if error
            == StringError::Escape(EscapeError::ExpectedLowSurrogate)
        {
            let slice = self.lexer.slice(error_range);
            let parsed = slice
                .strip_prefix(r"\u")
                .and_then(|hex| u16::from_str_radix(hex, 16).ok());

            match parsed {
                Some(unit) if (0xD800..=0xDBFF).contains(&unit) => (None, Some(unit)),
                Some(unit) if error_range.start() >= token_range.start() + TextSize::new(7) => {
                    let prev =
                        TextRange::new(error_range.start() - TextSize::new(6), error_range.start());
                    let high = self.lexer.slice(prev).starts_with(r"\u").then_some(prev);
                    (high, Some(unit))
                }
                other => (None, other),
            }
        } else {
            (None, None)
        };

        StringErrorContext {
            open_quote,
            control_byte,
            high_surrogate,
            invalid_unit,
            unclosed: Vec::new_in(self.allocator().clone()),
        }
    }

    #[cold]
    #[inline(never)]
    fn record_lex_error(&mut self, token_range: TextRange, error: LexError) {
        match error {
            LexError::String { error, range } => {
                let error = StringError::from(error);
                let context = self.string_error_context(token_range, range, error);
                self.error(
                    range,
                    SyntaxErrorKind::Lexer(LexerErrorKind::InvalidString { error, context }),
                );
            }
            LexError::SingleQuotedString => {
                let replacement = single_quoted_to_double_quoted(self.lexer.slice(token_range));
                self.error(
                    token_range,
                    SyntaxErrorKind::Lexer(LexerErrorKind::SingleQuotedString { replacement }),
                );
            }
            LexError::Number(error) => {
                let raw = self.lexer.slice(token_range).to_owned();
                self.error(
                    error.range,
                    SyntaxErrorKind::Lexer(LexerErrorKind::InvalidNumber {
                        error: error.kind,
                        token_range,
                        raw,
                    }),
                );
            }
            LexError::InvalidWord => {
                let word = self.lexer.slice(token_range);

                // `-Infinity` lexes as a bare `-` and a word, and is one mistake.
                if matches!(word, "Infinity" | "NaN")
                    && let Some(last) = self.errors.last_mut()
                    && last.range().end() == token_range.start()
                    && let SyntaxErrorKind::Lexer(LexerErrorKind::InvalidNumber {
                        token_range: sign,
                        raw,
                        ..
                    }) = last.kind_mut()
                    && raw == "-"
                {
                    let range = sign.cover(token_range);
                    *last = SyntaxError::new(
                        range,
                        SyntaxErrorKind::Lexer(LexerErrorKind::InvalidToken {
                            text: format!("-{word}"),
                        }),
                    );

                    return;
                }

                self.error(
                    token_range,
                    SyntaxErrorKind::Lexer(LexerErrorKind::InvalidToken {
                        text: word.to_owned(),
                    }),
                );
            }
            LexError::UnterminatedBlockComment => {
                let opener =
                    TextRange::at(token_range.start(), TextSize::new(2).min(token_range.len()));
                let eof = self.lexer.eof_offset();
                self.error(
                    opener,
                    SyntaxErrorKind::Lexer(LexerErrorKind::UnterminatedBlockComment {
                        eof,
                        unclosed: Vec::new_in(self.allocator().clone()),
                    }),
                );
            }
            LexError::UnrecognizedCharacter => {
                let text = self.lexer.slice(token_range);

                // A run of unrecognized characters, such as `*/`, is one mistake.
                if let Some(last) = self.errors.last_mut()
                    && last.range().end() == token_range.start()
                    && let SyntaxErrorKind::Lexer(LexerErrorKind::InvalidCharacter { text: run }) =
                        last.kind_mut()
                {
                    run.push_str(text);
                    last.extend_to(token_range.end());

                    return;
                }

                self.error(
                    token_range,
                    SyntaxErrorKind::Lexer(LexerErrorKind::InvalidCharacter {
                        text: text.to_owned(),
                    }),
                );
            }
        }
    }

    /// Records that the end of input left the container opened at `open` unclosed.
    ///
    /// `trailing` is the range of the commas after the last element, which the suggested closing
    /// delimiter replaces.
    pub(crate) fn record_unclosed_eof(
        &mut self,
        open: TextRange,
        delimiter: DelimiterKind,
        trailing: Option<TextRange>,
    ) {
        let close_at = trailing.unwrap_or_else(|| TextRange::empty(self.last_token_end()));

        let mut unclosed = Vec::with_capacity_in(1, self.allocator().clone());
        unclosed.push((delimiter, open));

        self.record_eof(
            SyntaxKindSet::from_kind(delimiter.close_kind()),
            EofContext::UnclosedDelimiters(UnclosedDelimiters {
                open: unclosed,
                close_at,
            }),
        );
    }

    #[inline(never)]
    fn refill_lookahead(&mut self) -> Option<PeekToken<'_, 'source, G, A>> {
        if matches!(self.lookahead, Lookahead::Eof) {
            return None;
        }

        while let Some(token) = self.lexer.next_token() {
            if token.kind.is_trivia() {
                if let Some(error) = token.error() {
                    self.record_lex_error(token.range, error);
                }

                self.builder
                    .token(token.kind.into(), self.lexer.slice(token.range));
                continue;
            }

            self.lookahead = Lookahead::Token(token);
            return Some(PeekToken { parser: self });
        }

        self.lookahead = Lookahead::Eof;
        None
    }

    /// Emits leading trivia into the open node and borrows the next non-trivia token.
    #[inline]
    pub(crate) fn peek(&mut self) -> Option<PeekToken<'_, 'source, G, A>> {
        if matches!(self.lookahead, Lookahead::Token(_)) {
            return Some(PeekToken { parser: self });
        }

        self.refill_lookahead()
    }

    #[inline]
    fn flush_trivia(&mut self) {
        let _: Option<PeekToken<'_, 'source, G, A>> = self.peek();
    }

    #[inline]
    pub(crate) fn at_set(&mut self, set: SyntaxKindSet) -> bool {
        self.peek().is_some_and(|token| set.contains(token.kind()))
    }

    #[inline]
    pub(crate) fn try_bump(&mut self, expected: SyntaxKind) -> Option<TextRange> {
        let token = self.peek()?;
        if token.kind() != expected {
            return None;
        }

        let range = token.range();
        token.commit();
        Some(range)
    }

    /// Flushes leading trivia into the enclosing node before opening a child node.
    #[inline]
    pub(crate) fn start_node(&mut self, kind: SyntaxKind) {
        self.flush_trivia();
        self.builder.start_node(kind.into());
    }

    /// Consumes the container at the current token into one [`SyntaxKind::Error`] node.
    ///
    /// A loop counts the delimiters, and the nesting inside the container costs no stack.
    fn skip_container(&mut self) {
        self.start_node(SyntaxKind::Error);

        let mut open = 0_usize;
        while let Some(token) = self.peek() {
            let kind = token.kind();
            if SyntaxKindSet::OPENING_DELIMITER.contains(kind) {
                open += 1;
            } else if SyntaxKindSet::CLOSING_DELIMITER.contains(kind) {
                open -= 1;
            } else {
                // Every other token belongs to the innermost open container.
            }

            token.commit_skipped();
            if open == 0 {
                break;
            }
        }

        self.finish_node();
    }

    /// Reports and skips an opening delimiter past [`ParserOptions::nesting_limit`].
    pub(crate) fn skip_over_nested_container(&mut self) -> ControlFlow<()> {
        if self.depth > u32::from(self.options.nesting_limit)
            && let Some(token) = self.peek()
            && SyntaxKindSet::OPENING_DELIMITER.contains(token.kind())
        {
            let range = token.range();
            self.error(
                range,
                SyntaxErrorKind::NestingLimit {
                    limit: self.options.nesting_limit,
                },
            );
            self.skip_container();

            return ControlFlow::Break(());
        }

        ControlFlow::Continue(())
    }

    /// Parses a value with `parse` one nesting level down.
    ///
    /// Past [`ParserOptions::nesting_limit`] levels, this reports a container at its opening
    /// delimiter and skips through the matching closing delimiter without invoking `parse`.
    pub(crate) fn nested(&mut self, parse: impl FnOnce(&mut Self)) {
        self.depth += 1;
        if self.skip_over_nested_container().is_continue() {
            ensure_sufficient_stack(|| parse(self));
        }
        self.depth -= 1;
    }

    pub(crate) fn parse_root(&mut self) {
        // Root keeps leading and trailing trivia inside itself so the tree is lossless.
        self.builder.start_node(SyntaxKind::Root.into());

        let skipped = self.skip_invalid_tokens();
        if self.peek().is_none() {
            if !skipped {
                self.record_eof(G::ITEM_FIRST, EofContext::Document);
            }
        } else {
            self.nested(G::parse_item);

            if let Some(trailing) = self.peek() {
                let trailing_range = trailing.range();
                let trailing_start = trailing_range.start();
                let is_invalid = trailing.kind() == SyntaxKind::InvalidToken;

                let already_reported = self
                    .errors
                    .last()
                    .is_some_and(|error| error.range() == trailing_range);
                let error_before = self.error_count();

                self.start_node(SyntaxKind::Error);
                while let Some(token) = self.peek() {
                    token.commit();
                }
                self.finish_node();

                if !already_reported && !is_invalid && self.error_count() == error_before {
                    let trailing_range = TextRange::new(trailing_start, self.last_token_end());
                    self.error(trailing_range, SyntaxErrorKind::ExpectedEof);
                }
            }
        }

        // Flush any remaining trailing trivia into `Root` before closing it.
        self.flush_trivia();
        self.builder.finish_node();
    }

    /// Parses `source` under grammar `G` into a lossless CST document.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    #[must_use]
    pub(crate) fn parse_cst_in(
        source: &'source str,
        options: ParserOptions,
        alloc: A,
    ) -> Document<G::Root, A> {
        let mut parser = Self::new_in(source, options, alloc);
        parser.parse_root();
        parser.finish()
    }
}

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;

    use super::{Parser, expr::ExprGrammar};
    use crate::{ParserOptions, syntax_kind::SyntaxKind};

    #[test]
    fn peek_drop_commit_and_eof() {
        let mut parser = Parser::<ExprGrammar, Global>::new_in(
            " /* lead */ { 1 } ",
            ParserOptions::default(),
            Global,
        );
        parser.builder.start_node(SyntaxKind::Root.into());

        // Dropping `PeekToken` leaves the buffered token intact for subsequent peeks.
        assert_eq!(
            parser.peek().map(|token| token.kind()),
            Some(SyntaxKind::LBrace)
        );
        let brace = parser.peek().expect("buffered `{` survives drop");
        assert_eq!(brace.kind(), SyntaxKind::LBrace);
        brace.commit();

        let number = parser.peek().expect("number follows `{`");
        assert_eq!(number.kind(), SyntaxKind::Number);
        number.commit();

        let close = parser.peek().expect("`}` follows number");
        assert_eq!(close.kind(), SyntaxKind::RBrace);
        close.commit();

        assert!(parser.peek().is_none());
        assert!(parser.peek().is_none());

        parser.builder.finish_node();
        let document = parser.finish();
        assert_eq!(document.green().to_string(), " /* lead */ { 1 } ");
    }
}
