//! Streaming Rowan parser for J-Expr syntax trees.

use alloc::borrow::Cow;
use core::{fmt, marker::PhantomData};

use jsonptr::PointerBuf;
use rowan::{Checkpoint, GreenNode, GreenNodeBuilder};
use text_size::{TextRange, TextSize};

use crate::{
    cst,
    error::{SyntaxError, SyntaxErrorKind},
    lexer::{LexError, Lexer, ScannedToken, decode_quoted},
    pointer,
    syntax_kind::{SyntaxKind, SyntaxNode, T},
    syntax_kind_set::SyntaxKindSet,
};

pub(crate) mod expr;
pub(crate) mod object;
pub(crate) mod recovery;

/// Result of parsing a J-Expr document into a lossless Rowan concrete syntax tree.
///
/// The root marker `R` selects the typed CST item yielded by [`Parse::tree`].
pub struct Parse<R> {
    green: GreenNode,
    errors: Vec<SyntaxError>,
    _root: PhantomData<fn() -> R>,
}

impl<R> Parse<R> {
    pub(crate) fn new(green: GreenNode, errors: Vec<SyntaxError>) -> Self {
        debug_assert_eq!(SyntaxKind::from_raw(green.kind()), SyntaxKind::Root);
        Self {
            green,
            errors,
            _root: PhantomData,
        }
    }

    /// Returns the immutable green tree backing this parse result.
    #[must_use]
    pub const fn green(&self) -> &GreenNode {
        &self.green
    }

    /// Creates a red [`SyntaxNode`] rooted at this parse tree.
    #[must_use]
    pub fn syntax(&self) -> SyntaxNode {
        SyntaxNode::new_root(self.green.clone())
    }

    /// Returns all lexical and outer-syntax errors recorded while building this tree.
    #[must_use]
    pub const fn errors(&self) -> &[SyntaxError] {
        self.errors.as_slice()
    }

    /// Reports whether parsing completed with no lexical or outer-syntax errors.
    #[must_use]
    pub const fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }

    /// Derives the RFC 6901 JSON Pointer for `range` directly from the green tree.
    ///
    /// Returns `None` if `range` lies outside the parsed source bounds.
    #[must_use]
    pub fn json_pointer(&self, range: TextRange) -> Option<PointerBuf> {
        pointer::json_pointer_for_range(cst::SyntaxNode::new(&self.green, TextSize::new(0)), range)
    }
}

impl<R: cst::TreeRoot> Parse<R> {
    /// Returns the typed [`cst::Root`] wrapper borrowing this parse tree's green root.
    #[must_use]
    pub fn tree(&self) -> cst::Root<'_, R::Item<'_>> {
        cst::Root::from_root(&self.green)
    }
}

impl<R> fmt::Debug for Parse<R> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Parse")
            .field("green", &self.green)
            .field("errors", &self.errors)
            .finish()
    }
}

impl<R> Clone for Parse<R> {
    fn clone(&self) -> Self {
        Self {
            green: self.green.clone(),
            errors: self.errors.clone(),
            _root: PhantomData,
        }
    }
}

impl<R> PartialEq for Parse<R> {
    fn eq(&self, other: &Self) -> bool {
        self.green == other.green && self.errors == other.errors
    }
}

impl<R> Eq for Parse<R> {}

/// Grammar specialization controlling which items and annotations the CST parser accepts.
pub(crate) trait Grammar {
    /// Root marker identifying the typed CST item yielded by [`Parse::tree`].
    type Root: cst::TreeRoot;

    /// Whether constructor objects admit a `"#type"` annotation field.
    const ALLOW_TYPE_ANNOTATIONS: bool;

    /// Token kinds that may start an item in this grammar.
    const ITEM_FIRST: SyntaxKindSet;

    /// Parses one item into `parser`'s green tree builder.
    fn parse_item(parser: &mut Parser<'_, Self>)
    where
        Self: Sized;
}

/// Streaming recursive-descent parser that writes tokens directly into [`GreenNodeBuilder`].
pub(crate) struct Parser<'source, G> {
    lexer: Lexer<'source>,
    peeked: Option<ScannedToken>,
    builder: GreenNodeBuilder<'static>,
    errors: Vec<SyntaxError>,
    last_token_end: TextSize,
    _grammar: PhantomData<G>,
}

impl<'source, G: Grammar> Parser<'source, G> {
    /// Parses `source` under grammar `G` into a typed [`Parse`] result.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    #[must_use]
    pub(crate) fn parse_cst(source: &'source str) -> Parse<G::Root> {
        let mut parser = Self::new(source);
        parser.parse_root();
        parser.finish()
    }

    pub(crate) fn new(source: &'source str) -> Self {
        Self {
            lexer: Lexer::new(source),
            peeked: None,
            builder: GreenNodeBuilder::new(),
            errors: Vec::new(),
            last_token_end: TextSize::new(0),
            _grammar: PhantomData,
        }
    }

    pub(crate) fn parse_root(&mut self) {
        // Root keeps leading and trailing trivia inside itself so the tree is lossless.
        self.builder.start_node(SyntaxKind::Root.into());

        if self.current().is_none() {
            let eof = self.eof_range();
            self.error(
                eof,
                SyntaxErrorKind::UnexpectedEof {
                    expected: G::ITEM_FIRST,
                },
            );
        } else {
            G::parse_item(self);

            if let Some(trailing) = self.current() {
                let already_reported = self
                    .errors
                    .last()
                    .is_some_and(|err| err.range() == trailing.range);
                if !already_reported && trailing.kind != SyntaxKind::InvalidToken {
                    self.error(trailing.range, SyntaxErrorKind::ExpectedEof);
                }

                self.start_node(SyntaxKind::Error);
                while self.current().is_some() {
                    self.bump_any();
                }
                self.finish_node();
            }
        }

        // Flush any remaining trailing trivia into `Root` before closing it.
        self.flush_trivia();
        self.builder.finish_node();
    }

    pub(crate) fn finish(self) -> Parse<G::Root> {
        Parse::new(self.builder.finish(), self.errors)
    }

    /// Flushes any trivia ahead of the next non-trivia token into the currently open node.
    #[inline]
    fn flush_trivia(&mut self) {
        let _: Option<ScannedToken> = self.current();
    }

    /// Returns the next non-trivia token, flushing any preceding trivia into the open node.
    #[inline]
    pub(crate) fn current(&mut self) -> Option<ScannedToken> {
        if let Some(token) = self.peeked {
            return Some(token);
        }

        while let Some(token) = self.lexer.next_token() {
            if token.kind.is_trivia() {
                if let Some(error) = token.error {
                    self.record_lex_error(token.range, error);
                }
                self.builder
                    .token(token.kind.into(), self.lexer.slice(token.range));
                continue;
            }

            self.peeked = Some(token);
            return Some(token);
        }

        None
    }

    /// Peeks the second non-trivia token without mutating the builder or emitting diagnostics.
    pub(crate) fn peek2(&mut self) -> Option<ScannedToken> {
        let _: ScannedToken = self.current()?;
        let mut lookahead = self.lexer.clone();
        while let Some(token) = lookahead.next_token() {
            if !token.kind.is_trivia() {
                return Some(token);
            }
        }
        None
    }

    /// Reports whether the next non-trivia token has kind `kind`.
    #[inline]
    pub(crate) fn at(&mut self, kind: SyntaxKind) -> bool {
        self.current().is_some_and(|token| token.kind == kind)
    }

    /// Consumes and emits the current non-trivia token, asserting its kind matches `expected`.
    ///
    /// # Panics
    ///
    /// Panics if called at end of input, or in debug builds if the token kind differs from
    /// `expected`.
    #[inline]
    pub(crate) fn bump(&mut self, expected: SyntaxKind) -> ScannedToken {
        let token = self.bump_any();
        debug_assert_eq!(token.kind, expected);
        token
    }

    /// Consumes and emits the current non-trivia token regardless of its kind.
    ///
    /// # Panics
    ///
    /// Panics if called at end of input.
    #[inline]
    pub(crate) fn bump_any(&mut self) -> ScannedToken {
        let token = self.current().expect("bump called at EOF");
        self.peeked = None;

        if let Some(error) = token.error {
            self.record_lex_error(token.range, error);
        }

        self.builder
            .token(token.kind.into(), self.lexer.slice(token.range));
        self.last_token_end = token.range.end();
        token
    }

    /// Flushes leading trivia into the enclosing node and starts a child node of kind `kind`.
    #[inline]
    pub(crate) fn start_node(&mut self, kind: SyntaxKind) {
        self.flush_trivia();
        self.builder.start_node(kind.into());
    }

    /// Flushes leading trivia into the enclosing node and captures a builder checkpoint.
    #[inline]
    pub(crate) fn checkpoint(&mut self) -> Checkpoint {
        self.flush_trivia();
        self.builder.checkpoint()
    }

    /// Wraps tokens emitted since `checkpoint` into a new node of kind `kind`.
    #[inline]
    pub(crate) fn start_node_at(&mut self, checkpoint: Checkpoint, kind: SyntaxKind) {
        self.builder.start_node_at(checkpoint, kind.into());
    }

    /// Closes the current syntax node without consuming trailing trivia.
    #[inline]
    pub(crate) fn finish_node(&mut self) {
        self.builder.finish_node();
    }

    /// Returns the end byte offset of the last non-trivia token emitted.
    #[inline]
    pub(crate) const fn last_token_end(&self) -> TextSize {
        self.last_token_end
    }

    /// Returns the empty byte range at the end of the source string.
    #[inline]
    pub(crate) fn eof_range(&self) -> TextRange {
        TextRange::empty(self.lexer.eof_offset())
    }

    /// Returns the number of syntax errors recorded so far.
    #[inline]
    pub(crate) const fn error_count(&self) -> usize {
        self.errors.len()
    }

    /// Records a syntax error at `range`.
    #[inline]
    pub(crate) fn error(&mut self, range: TextRange, kind: SyntaxErrorKind) {
        self.errors.push(SyntaxError::new(range, kind));
    }

    /// Decodes a [`SyntaxKind::String`] token, borrowing directly when no escapes are present.
    ///
    /// Returns `None` if the token carried a lexical string error.
    #[expect(
        clippy::string_slice,
        reason = "validated JSON string token begins and ends with ASCII quotes"
    )]
    pub(crate) fn decode_string(&self, token: ScannedToken) -> Option<Cow<'source, str>> {
        debug_assert_eq!(token.kind, T![string]);
        if token.error.is_some() {
            return None;
        }

        let raw = self.lexer.slice(token.range);
        if !token.has_escapes {
            return Some(Cow::Borrowed(&raw[1..raw.len() - 1]));
        }

        decode_quoted(raw).ok()
    }

    fn record_lex_error(&mut self, token_range: TextRange, error: LexError) {
        match error {
            LexError::String { error, range } => {
                self.error(range, SyntaxErrorKind::InvalidString(error));
            }
            LexError::Number(error) => {
                self.error(error.range, SyntaxErrorKind::InvalidNumber(error.kind));
            }
            LexError::UnterminatedBlockComment => {
                self.error(token_range, SyntaxErrorKind::UnterminatedBlockComment);
            }
            LexError::UnrecognizedCharacter => {
                self.error(token_range, SyntaxErrorKind::InvalidCharacter);
            }
        }
    }
}
