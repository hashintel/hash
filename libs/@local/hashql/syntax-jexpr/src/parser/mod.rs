use core::marker::PhantomData;

use rowan::{Checkpoint, GreenNodeBuilder};
use text_size::{TextRange, TextSize};

use crate::{
    cst,
    error::{
        DelimiterKind, EofContext, LexerErrorKind, StringErrorContext, SyntaxError, SyntaxErrorKind,
    },
    lexer::{LexError, LexedStr, Lexer, StringError, Token, string::EscapeError},
    syntax_kind::SyntaxKind,
    syntax_kind_set::SyntaxKindSet,
};

pub(crate) mod dict;
mod document;
pub(crate) mod expr;
pub(crate) mod json;
pub(crate) mod object;
pub(crate) mod recovery;

pub use self::document::Document;

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

pub(crate) trait Grammar {
    type Root: cst::TreeRoot;

    const ALLOW_TYPE_ANNOTATIONS: bool;

    const ITEM_FIRST: SyntaxKindSet;

    fn parse_item(parser: &mut Parser<'_, Self>)
    where
        Self: Sized;
}

pub(crate) struct Parser<'source, G> {
    lexer: Lexer<'source>,
    builder: GreenNodeBuilder<'static>,
    errors: Vec<SyntaxError>,
    last_token_end: TextSize,
    _grammar: PhantomData<G>,
}

impl<'source, G: Grammar> Parser<'source, G> {
    pub(crate) fn new(source: &'source str) -> Self {
        Self {
            lexer: Lexer::new(source),
            builder: GreenNodeBuilder::new(),
            errors: Vec::new(),
            last_token_end: TextSize::new(0),
            _grammar: PhantomData,
        }
    }

    pub(crate) fn finish(self) -> Document<G::Root> {
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
    pub(crate) fn error(&mut self, range: TextRange, kind: SyntaxErrorKind) {
        self.errors.push(SyntaxError::new(range, kind));
    }

    #[inline]
    pub(crate) fn error_node(&mut self) {
        self.start_node(SyntaxKind::Error);
        self.bump_any();
        self.finish_node();
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

    fn string_error_context(
        &self,
        token_range: TextRange,
        error_range: TextRange,
        error: StringError,
    ) -> StringErrorContext {
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
        }
    }

    fn record_lex_error(&mut self, token_range: TextRange, error: LexError) {
        match error {
            LexError::String { error, range } => {
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
                let text = self.lexer.slice(token_range).to_owned();
                self.error(
                    token_range,
                    SyntaxErrorKind::Lexer(LexerErrorKind::InvalidToken { text }),
                );
            }
            LexError::UnterminatedBlockComment => {
                let opener =
                    TextRange::at(token_range.start(), TextSize::new(2).min(token_range.len()));
                let eof = self.lexer.eof_offset();
                self.error(
                    opener,
                    SyntaxErrorKind::Lexer(LexerErrorKind::UnterminatedBlockComment { eof }),
                );
            }
            LexError::UnrecognizedCharacter => {
                let character = self
                    .lexer
                    .slice(token_range)
                    .chars()
                    .next()
                    .unwrap_or('\u{FFFD}');
                self.error(
                    token_range,
                    SyntaxErrorKind::Lexer(LexerErrorKind::InvalidCharacter { character }),
                );
            }
        }
    }

    /// Records an unexpected EOF, merging nested unclosed containers and skipping cascades.
    pub(crate) fn record_eof(&mut self, expected: SyntaxKindSet, context: EofContext) {
        let eof = self.eof_range();

        if let Some(last) = self.errors.last_mut() {
            let at_eof = last.range() == eof;

            match last.kind_mut() {
                SyntaxErrorKind::Lexer(
                    LexerErrorKind::UnterminatedBlockComment { .. }
                    | LexerErrorKind::InvalidString {
                        error: StringError::Eof | StringError::Escape(EscapeError::Eof),
                        ..
                    },
                ) => return,
                SyntaxErrorKind::Lexer(LexerErrorKind::UnexpectedEof {
                    context: EofContext::UnclosedDelimiters(existing),
                    ..
                }) if at_eof => {
                    if let EofContext::UnclosedDelimiters(additional) = context {
                        existing.extend(additional);
                    }
                    return;
                }
                SyntaxErrorKind::Lexer(LexerErrorKind::UnexpectedEof { .. }) if at_eof => {
                    return;
                }
                SyntaxErrorKind::Lexer(_)
                | SyntaxErrorKind::ExpectedEof
                | SyntaxErrorKind::Array(_)
                | SyntaxErrorKind::Object(_) => {}
            }
        }

        self.error(
            eof,
            SyntaxErrorKind::Lexer(LexerErrorKind::UnexpectedEof { expected, context }),
        );
    }

    pub(crate) fn record_unclosed_eof(&mut self, open: TextRange, delimiter: DelimiterKind) {
        self.record_eof(
            SyntaxKindSet::from_kind(delimiter.close_kind()),
            EofContext::UnclosedDelimiters(vec![(delimiter, open)]),
        );
    }

    /// Emits leading trivia into the open node and returns the next non-trivia token.
    #[inline]
    pub(crate) fn current(&mut self) -> Option<Token<'source>> {
        while let Some(token) = self.lexer.peek_token() {
            if token.kind.is_trivia() {
                if let Some(error) = token.error() {
                    self.record_lex_error(token.range, error);
                }

                self.builder
                    .token(token.kind.into(), self.lexer.slice(token.range));
                self.lexer.next_token();

                continue;
            }

            return Some(token);
        }

        None
    }

    #[inline]
    fn flush_trivia(&mut self) {
        let _: Option<Token<'source>> = self.current();
    }

    #[inline]
    pub(crate) fn at(&mut self, kind: SyntaxKind) -> bool {
        self.current().is_some_and(|token| token.kind == kind)
    }

    /// Emits the current non-trivia token into the green builder regardless of kind.
    ///
    /// # Panics
    ///
    /// Panics at EOF.
    #[inline]
    pub(crate) fn bump_any(&mut self) -> Token<'source> {
        let token = self.current().expect("bump called at EOF");
        let consumed = self.lexer.next_token();
        debug_assert_eq!(consumed, Some(token));

        if let Some(error) = token.error() {
            self.record_lex_error(token.range, error);
        }

        self.builder
            .token(token.kind.into(), self.lexer.slice(token.range));
        self.last_token_end = token.range.end();
        token
    }

    #[inline]
    pub(crate) fn try_bump(&mut self, expected: SyntaxKind) -> Option<Token<'source>> {
        self.current()
            .is_some_and(|token| token.kind == expected)
            .then(|| self.bump_any())
    }

    /// Emits the current non-trivia token into the green builder, asserting it matches `expected`.
    ///
    /// # Panics
    ///
    /// Panics at EOF, or in debug builds if the current token's kind differs from `expected`.
    #[inline]
    pub(crate) fn bump(&mut self, expected: SyntaxKind) -> Token<'source> {
        let token = self.bump_any();
        debug_assert_eq!(token.kind, expected);
        token
    }

    /// Flushes leading trivia into the enclosing node before opening a child node.
    #[inline]
    pub(crate) fn start_node(&mut self, kind: SyntaxKind) {
        self.flush_trivia();
        self.builder.start_node(kind.into());
    }

    /// Flushes leading trivia into the enclosing node before capturing a checkpoint.
    #[inline]
    pub(crate) fn checkpoint(&mut self) -> Checkpoint {
        self.flush_trivia();
        self.builder.checkpoint()
    }

    pub(crate) fn parse_root(&mut self) {
        // Root keeps leading and trailing trivia inside itself so the tree is lossless.
        self.builder.start_node(SyntaxKind::Root.into());

        if self.current().is_none() {
            self.record_eof(G::ITEM_FIRST, EofContext::Document);
        } else {
            G::parse_item(self);

            if let Some(trailing) = self.current() {
                let trailing_start = trailing.range.start();
                let is_invalid = trailing.kind == SyntaxKind::InvalidToken;
                let already_reported = self
                    .errors
                    .last()
                    .is_some_and(|err| err.range() == trailing.range);
                let err_before = self.error_count();

                self.start_node(SyntaxKind::Error);
                while self.current().is_some() {
                    self.bump_any();
                }
                self.finish_node();

                if !already_reported && !is_invalid && self.error_count() == err_before {
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
    pub(crate) fn parse_cst(source: &'source str) -> Document<G::Root> {
        let mut parser = Self::new(source);
        parser.parse_root();
        parser.finish()
    }
}
