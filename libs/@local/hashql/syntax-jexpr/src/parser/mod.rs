use core::{alloc::Allocator, marker::PhantomData};

use rowan::{Checkpoint, GreenNodeBuilder};
use text_size::{TextRange, TextSize};

use crate::{
    cst,
    error::{
        DelimiterKind, EofContext, LexerErrorKind, StringErrorContext, SyntaxError,
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
    fn parse_item<A: Allocator>(parser: &mut Parser<'_, Self, A>)
    where
        Self: Sized;
}

/// Number of levels a document may nest values, and an embedded string its types or expressions.
///
/// The parsers and every later pass recurse once per level. The limit bounds the stack they
/// need, and the memory of the stack segments [`ensure_sufficient_stack`] allocates.
pub(crate) const NESTING_LIMIT: u16 = 256;

/// Recursive descent parser from J-Expr source to a lossless [`Document`] of grammar `G`.
pub(crate) struct Parser<'source, G, A: Allocator> {
    lexer: Lexer<'source>,
    builder: GreenNodeBuilder<'static>,
    errors: Vec<SyntaxError, A>,
    last_token_end: TextSize,
    depth: u16,
    _grammar: PhantomData<G>,
}

impl<'source, G: Grammar, A: Allocator> Parser<'source, G, A> {
    pub(crate) fn new_in(source: &'source str, alloc: A) -> Self {
        Self {
            lexer: Lexer::new(source),
            builder: GreenNodeBuilder::new(),
            errors: Vec::new_in(alloc),
            last_token_end: TextSize::new(0),
            depth: 0,
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
    pub(crate) fn error(&mut self, range: TextRange, kind: SyntaxErrorKind) {
        self.errors.push(SyntaxError::new(range, kind));
    }

    #[inline]
    pub(crate) fn error_node(&mut self) {
        self.start_node(SyntaxKind::Error);
        self.bump_any();
        self.finish_node();
    }

    /// Consumes every [`SyntaxKind::InvalidToken`] at the current position into its own
    /// [`SyntaxKind::Error`] node and reports whether there was one.
    ///
    /// The lexer error of each token is its diagnostic. A caller that skipped a token treats the
    /// position as already reported and says nothing more about what it expected there.
    pub(crate) fn skip_invalid_tokens(&mut self) -> bool {
        let mut skipped = false;
        while self.at(SyntaxKind::InvalidToken) {
            self.error_node();
            skipped = true;
        }

        skipped
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
            unclosed: Vec::new(),
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
                        unclosed: Vec::new(),
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

    /// Records an unexpected end of input, which a document reports once.
    ///
    /// A later call adds the delimiters it found open to the first report. That report is the
    /// unterminated token the input ended in, where there is one.
    pub(crate) fn record_eof(&mut self, expected: SyntaxKindSet, context: EofContext) {
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

        self.record_eof(
            SyntaxKindSet::from_kind(delimiter.close_kind()),
            EofContext::UnclosedDelimiters(UnclosedDelimiters {
                open: vec![(delimiter, open)],
                close_at,
            }),
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

    #[inline]
    pub(crate) fn at_set(&mut self, set: SyntaxKindSet) -> bool {
        self.current().is_some_and(|token| set.contains(token.kind))
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

    /// Consumes the container at the current token into one [`SyntaxKind::Error`] node.
    ///
    /// A loop counts the delimiters, and the nesting inside the container costs no stack.
    fn skip_container(&mut self) {
        self.start_node(SyntaxKind::Error);

        let mut open = 0_usize;
        while let Some(token) = self.current() {
            if SyntaxKindSet::OPENING_DELIMITER.contains(token.kind) {
                open += 1;
            } else if SyntaxKindSet::CLOSING_DELIMITER.contains(token.kind) {
                open -= 1;
            } else {
                // Every other token belongs to the innermost open container.
            }

            self.bump_any();
            if open == 0 {
                break;
            }
        }

        self.finish_node();
    }

    /// Parses a value with `parse`, one nesting level below the current one.
    ///
    /// A container past [`NESTING_LIMIT`] levels is not parsed. It is reported at its opening
    /// delimiter and skipped up to the matching closing delimiter.
    pub(crate) fn nested(&mut self, parse: impl FnOnce(&mut Self)) {
        if self.depth >= NESTING_LIMIT
            && let Some(token) = self.current()
            && SyntaxKindSet::OPENING_DELIMITER.contains(token.kind)
        {
            self.error(
                token.range,
                SyntaxErrorKind::NestingLimit {
                    limit: NESTING_LIMIT,
                },
            );
            self.skip_container();

            return;
        }

        self.depth += 1;
        ensure_sufficient_stack(|| parse(self));
        self.depth -= 1;
    }

    pub(crate) fn parse_root(&mut self) {
        // Root keeps leading and trailing trivia inside itself so the tree is lossless.
        self.builder.start_node(SyntaxKind::Root.into());

        let skipped = self.skip_invalid_tokens();
        if self.current().is_none() {
            if !skipped {
                self.record_eof(G::ITEM_FIRST, EofContext::Document);
            }
        } else {
            self.nested(G::parse_item);

            if let Some(trailing) = self.current() {
                let trailing_start = trailing.range.start();
                let is_invalid = trailing.kind == SyntaxKind::InvalidToken;
                let already_reported = self
                    .errors
                    .last()
                    .is_some_and(|error| error.range() == trailing.range);
                let error_before = self.error_count();

                self.start_node(SyntaxKind::Error);
                while self.current().is_some() {
                    self.bump_any();
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
    pub(crate) fn parse_cst_in(source: &'source str, alloc: A) -> Document<G::Root, A> {
        let mut parser = Self::new_in(source, alloc);
        parser.parse_root();
        parser.finish()
    }
}
