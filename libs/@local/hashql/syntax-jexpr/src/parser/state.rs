use circular_buffer::CircularBuffer;
use hashql_core::{
    heap::Heap,
    span::{SpanAncestors, SpanId, SpanTable},
    symbol::Symbol,
};
use text_size::TextRange;

use super::error::{ParserDiagnostic, ParserDiagnosticCategory, expected_eof};
use crate::{
    error::ResultExt as _,
    lexer::{
        Lexer, LexerContext,
        error::{LexerDiagnostic, unexpected_eof, unexpected_token},
        syntax_kind::SyntaxKind,
        syntax_kind_set::SyntaxKindSet,
        token::Token,
    },
    span::Span,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum LookaheadStatus {
    EndOfInput,
    BufferFilled,
}

struct LookaheadLexer<'source> {
    buffer: CircularBuffer<4, Token<'source>>,
    lexer: Lexer<'source>,
}

impl<'source> LookaheadLexer<'source> {
    #[expect(clippy::panic_in_result_fn)]
    fn peek_fill(
        &mut self,
        context: &mut LexerContext,
        n: usize,
    ) -> Result<LookaheadStatus, LexerDiagnostic> {
        assert!(n < self.buffer.capacity(), "lookahead buffer overflow");

        // Fill the buffer until we have enough tokens or reach eof
        while self.buffer.len() <= n {
            match self.lexer.advance(context) {
                Some(Ok(token)) => {
                    self.buffer.push_back(token);
                }
                Some(Err(error)) => return Err(error),
                None => return Ok(LookaheadStatus::EndOfInput),
            }
        }

        Ok(LookaheadStatus::BufferFilled)
    }

    // Peek at the nth token (0-based index)
    fn peek_n(
        &mut self,
        context: &mut LexerContext,
        n: usize,
    ) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        if self.peek_fill(context, n)? == LookaheadStatus::EndOfInput {
            return Ok(None);
        }

        Ok(Some(&self.buffer[n]))
    }

    fn peek_n_span(
        &mut self,
        context: &mut LexerContext,
        n: usize,
    ) -> Result<Result<&Token<'source>, TextRange>, LexerDiagnostic> {
        if self.peek_fill(context, n)? == LookaheadStatus::EndOfInput {
            return Ok(Err(self.span()));
        }

        Ok(Ok(&self.buffer[n]))
    }

    fn advance(
        &mut self,
        context: &mut LexerContext,
    ) -> Option<Result<Token<'source>, LexerDiagnostic>> {
        if let Some(token) = self.buffer.pop_front() {
            return Some(Ok(token));
        }

        self.lexer.advance(context)
    }

    fn span(&self) -> TextRange {
        self.lexer.span()
    }
}

struct ParserContext<'spans> {
    stack: Vec<jsonptr::Token<'static>>,
    spans: &'spans mut SpanTable<Span>,
}

impl ParserContext<'_> {
    fn current_pointer(&self) -> jsonptr::PointerBuf {
        jsonptr::PointerBuf::from_tokens(&self.stack)
    }

    fn insert_span(&mut self, span: Span) -> SpanId {
        self.spans.insert(span, SpanAncestors::EMPTY)
    }

    fn insert_range(&mut self, range: TextRange) -> SpanId {
        self.spans.insert(
            Span {
                range,
                pointer: Some(self.current_pointer()),
            },
            SpanAncestors::EMPTY,
        )
    }

    #[inline]
    const fn lexer(&mut self) -> LexerContext<'_> {
        LexerContext { spans: self.spans }
    }

    fn validate_token<'source, T>(
        &mut self,
        token: T,
        expected: Expected,
    ) -> Result<T, LexerDiagnostic>
    where
        T: AsRef<Token<'source>>,
    {
        let token_ref = token.as_ref();
        let syntax_kind = token_ref.kind.syntax();

        match expected {
            Expected::Hint(_) => return Ok(token),
            Expected::Validate(set) if set.contains(syntax_kind) => {
                return Ok(token);
            }
            Expected::Validate(_) => {}
        }

        let span = self.insert_range(token_ref.span);

        Err(unexpected_token(span, syntax_kind, expected.into_set()))
    }
}

/// Represents expectations for token validation in the parser.
///
/// This enum provides two modes of token validation:
/// - `Validate`: The token must match one of the expected syntax kinds
/// - `Hint`: The expected syntax kinds are only a hint, and any token is accepted
///
/// When a `SyntaxKind` or `SyntaxKindSet` is directly passed to methods like
/// `advance` or `peek_expect`, it is automatically converted to `Expected::Validate`.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Expected {
    /// Expected kinds are only a hint; any token is accepted.
    Hint(SyntaxKindSet),

    /// Token must match one of the expected kinds.
    Validate(SyntaxKindSet),
}

impl Expected {
    /// Creates a new `Expected::Hint` from a syntax kind or set.
    ///
    /// Unlike direct conversion from `SyntaxKind` or `SyntaxKindSet` which creates
    /// a `Validate` variant, this method explicitly creates a `Hint` variant.
    pub(crate) fn hint(kind: impl Into<SyntaxKindSet>) -> Self {
        Self::Hint(kind.into())
    }

    const fn into_set(self) -> SyntaxKindSet {
        match self {
            Self::Validate(set) | Self::Hint(set) => set,
        }
    }
}

impl From<SyntaxKindSet> for Expected {
    fn from(value: SyntaxKindSet) -> Self {
        Self::Validate(value)
    }
}

impl From<SyntaxKind> for Expected {
    fn from(value: SyntaxKind) -> Self {
        Self::Validate(SyntaxKindSet::from(value))
    }
}

pub(crate) struct ParserState<'heap, 'source, 'spans> {
    heap: &'heap Heap,
    lexer: LookaheadLexer<'source>,

    context: ParserContext<'spans>,
}

impl<'heap, 'source, 'spans> ParserState<'heap, 'source, 'spans> {
    pub(crate) const fn new(
        heap: &'heap Heap,
        lexer: Lexer<'source>,
        spans: &'spans mut SpanTable<Span>,
    ) -> Self {
        Self {
            heap,
            lexer: LookaheadLexer {
                buffer: CircularBuffer::new(),
                lexer,
            },
            context: ParserContext {
                stack: Vec::new(),
                spans,
            },
        }
    }

    pub(crate) fn intern_symbol(&self, value: impl AsRef<str>) -> Symbol<'heap> {
        self.heap.intern_symbol(value.as_ref())
    }

    /// Consumes and returns the next token, validating it against the expected syntax kinds.
    ///
    /// The argument `expected` is used to validate the next token. It can be a `SyntaxKind` or
    /// `SyntaxKindSet` directly, or `Expected::hint(...)` to accept any token regardless of
    /// kind.
    ///
    /// # Errors
    ///
    /// - `UnexpectedEof` if there are no more tokens
    /// - `UnexpectedToken` if the token doesn't match the expected kinds (when validating)
    pub(crate) fn advance(
        &mut self,
        expected: impl Into<Expected>,
    ) -> Result<Token<'source>, LexerDiagnostic> {
        let expected = expected.into();

        let Some(token) = self.lexer.advance(&mut self.context.lexer()) else {
            let span = self.insert_range(self.lexer.span());

            return Err(unexpected_eof(span, expected.into_set()));
        };

        let token = token?;

        self.context.validate_token(token, expected)
    }

    // Peek at the first token
    pub(crate) fn peek(&mut self) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        self.lexer.peek_n(&mut self.context.lexer(), 0)
    }

    // Peek at the second token
    pub(crate) fn peek2(&mut self) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        self.lexer.peek_n(&mut self.context.lexer(), 1)
    }

    /// Returns a reference to the next token without consuming it, validating it against the
    /// expected syntax kinds.
    ///
    /// The argument `expected` is used to validate the next token. It can be a `SyntaxKind` or
    /// `SyntaxKindSet` directly, or `Expected::hint(...)` to accept any token regardless of
    /// kind.
    ///
    /// # Errors
    ///
    /// - `UnexpectedEof` if there are no more tokens
    /// - `UnexpectedToken` if the token doesn't match the expected kinds (when validating)
    pub(crate) fn peek_expect(
        &mut self,
        expected: impl Into<Expected>,
    ) -> Result<&Token<'source>, LexerDiagnostic> {
        let expected = expected.into();

        match self.lexer.peek_n_span(&mut self.context.lexer(), 0)? {
            Ok(token) => self.context.validate_token(token, expected),
            Err(span) => {
                let span = self.context.insert_range(span);
                Err(unexpected_eof(span, expected.into_set()))
            }
        }
    }

    pub(crate) fn enter<T>(
        &mut self,
        token: jsonptr::Token<'static>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        self.context.stack.push(token);

        let result = closure(self);

        self.context.stack.pop();
        result
    }

    pub(crate) fn finish(mut self) -> Result<(), ParserDiagnostic> {
        if let Some(token) = self.lexer.advance(&mut LexerContext {
            spans: self.context.spans,
        }) {
            let token = token.change_category(ParserDiagnosticCategory::Lexer)?;

            let span = self.insert_range(token.span);

            return Err(expected_eof(span));
        }

        Ok(())
    }

    pub(crate) fn current_pointer(&self) -> jsonptr::PointerBuf {
        self.context.current_pointer()
    }

    pub(crate) fn insert_span(&mut self, span: Span) -> SpanId {
        self.context.insert_span(span)
    }

    pub(crate) fn insert_range(&mut self, range: TextRange) -> SpanId {
        self.context.insert_range(range)
    }

    pub(crate) fn current_span(&self) -> TextRange {
        self.lexer.span()
    }

    pub(crate) const fn spans(&mut self) -> &mut SpanTable<Span> {
        self.context.spans
    }

    pub(crate) const fn heap(&self) -> &'heap Heap {
        self.heap
    }
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;
    use core::assert_matches::assert_matches;

    use crate::{
        lexer::{
            Number, error::LexerDiagnosticCategory, syntax_kind::SyntaxKind, token_kind::TokenKind,
        },
        parser::{
            state::Expected,
            test::{bind_context, bind_state},
        },
    };

    fn number(value: &str) -> TokenKind<'_> {
        let (_, number) = Number::parse(value.as_bytes());
        TokenKind::Number(number.expect("should be able to parse valid number"))
    }

    // Basic peek functionality
    #[test]
    fn peek_returns_token_without_consuming() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        let token = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(token.kind, number("42"));

        // Token should not be consumed
        let token2 = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(token2.kind, number("42"));
    }

    #[test]
    fn peek_at_eof_returns_none() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        state.advance(SyntaxKind::Number).expect("should not fail");
        assert!(state.peek().expect("should not fail").is_none());
    }

    // Basic advance functionality
    #[test]
    fn advance_consumes_token() {
        bind_context!(let context = "42 true");
        bind_state!(let mut state from context);

        let token = state.advance(SyntaxKind::Number).expect("should not fail");
        assert_eq!(token.kind, number("42"));

        // Next token should be available
        let token2 = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(token2.kind, TokenKind::Bool(true));
    }

    #[test]
    fn advance_at_eof_returns_error() {
        bind_context!(let context = "");
        bind_state!(let mut state from context);

        let error = state.advance(SyntaxKind::Number).expect_err("should fail");
        assert_eq!(error.category, LexerDiagnosticCategory::UnexpectedEof);
    }

    // Token validation with expected kinds
    #[test]
    fn advance_expected_validates_token() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        state
            .advance(SyntaxKind::Number)
            .expect("token returned should be a number");
    }

    #[test]
    fn advance_expected_hint_does_not_validate_token() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        state
            .advance(Expected::hint(SyntaxKind::String))
            .expect("token returned should be a number");
    }

    #[test]
    fn advance_expected_rejects_invalid_token() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        let diagnostic = state
            .advance(SyntaxKind::String)
            .expect_err("token returned should be invalid");

        assert_eq!(
            diagnostic.category,
            LexerDiagnosticCategory::UnexpectedToken
        );
    }

    #[test]
    fn peek_expect_validates_token() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        state
            .peek_expect(SyntaxKind::Number)
            .expect("should not fail");
    }

    #[test]
    fn peek_expect_hint_does_not_validate_token() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        state
            .peek_expect(Expected::hint(SyntaxKind::String))
            .expect("should not fail");
    }

    #[test]
    fn peek_expect_rejects_invalid_token() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        let diagnostic = state
            .peek_expect(SyntaxKind::String)
            .expect_err("should fail");

        assert_eq!(
            diagnostic.category,
            LexerDiagnosticCategory::UnexpectedToken
        );
    }

    #[test]
    fn peek_expect_at_eof_returns_error() {
        bind_context!(let context = "");
        bind_state!(let mut state from context);

        let diagnostic = state
            .peek_expect(SyntaxKind::String)
            .expect_err("should fail");

        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }

    // Multi-token lookahead
    #[test]
    fn peek2_returns_second_token() {
        bind_context!(let context = "42 true");
        bind_state!(let mut state from context);

        let token = state
            .peek2()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(token.kind, TokenKind::Bool(true));

        // First token should still be available
        let first = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(first.kind, number("42"));
    }

    #[test]
    fn peek_n_returns_nth_token() {
        bind_context!(let context = "1 2 3 4");
        bind_state!(let mut state from context);

        for i in 0..4 {
            let token = state
                .lexer
                .peek_n(&mut state.context.lexer(), i)
                .expect("should not fail")
                .expect("should have token");
            assert_eq!(token.kind, number(&(i + 1).to_string()));
        }
    }

    // Buffer management
    #[test]
    fn buffer_fills_when_peeking_ahead() {
        bind_context!(let context = "1 2 3 4 5");
        bind_state!(let mut state from context);

        // Peek ahead should fill buffer
        let fourth = state
            .lexer
            .peek_n(&mut state.context.lexer(), 3)
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(fourth.kind, number("4"));

        // First token should still be accessible
        let first = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(first.kind, number("1"));
    }

    #[test]
    fn buffer_updates_when_advancing() {
        bind_context!(let context = "1 2 3 4 5");
        bind_state!(let mut state from context);

        // Fill buffer with peeking
        state
            .lexer
            .peek_n(&mut state.context.lexer(), 3)
            .expect("should not fail");

        // Advance and verify buffer contents
        state.advance(SyntaxKind::Number).expect("should not fail"); // consume 1

        // Should now peek at 2, 3, 4, 5
        for i in 0..4 {
            let token = state
                .lexer
                .peek_n(&mut state.context.lexer(), i)
                .expect("should not fail")
                .expect("should have token");
            assert_eq!(token.kind, number(&(i + 2).to_string()));
        }
    }

    #[test]
    fn circular_buffer_handles_wraparound() {
        bind_context!(let context = r#""a" "b" "c" "d" "e" "f""#);
        bind_state!(let mut state from context);

        // Fill buffer by peeking
        for i in 0..4 {
            state
                .lexer
                .peek_n(&mut state.context.lexer(), i)
                .expect("should not fail");
        }

        // Consume tokens to force wrap-around
        state.advance(SyntaxKind::String).expect("should not fail"); // a
        state.advance(SyntaxKind::String).expect("should not fail"); // b

        // Peek further to wrap around buffer
        let e_token = state
            .lexer
            .peek_n(&mut state.context.lexer(), 2)
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(e_token.kind, TokenKind::String(Cow::Owned("e".to_owned())));

        // Verify token access after wrap-around
        let c_token = state.advance(SyntaxKind::String).expect("should not fail");
        assert_eq!(c_token.kind, TokenKind::String(Cow::Owned("c".to_owned())));
    }

    // Finish behavior
    #[expect(unused_mut)]
    #[test]
    fn finish_succeeds_at_eof() {
        bind_context!(let context = "");
        bind_state!(let mut state from context);

        assert_matches!(state.finish(), Ok(()));
    }

    #[test]
    fn finish_after_consuming_all_tokens_succeeds() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        state.advance(SyntaxKind::Number).expect("should not fail");
        assert_matches!(state.finish(), Ok(()));
    }

    #[expect(unused_mut)]
    #[test]
    fn finish_with_remaining_tokens_fails() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        assert!(state.finish().is_err());
    }

    // Context management
    #[test]
    fn enter_pushes_and_pops_context() {
        bind_context!(let context = r#"{"key": 42}"#);
        bind_state!(let mut state from context);

        // Initial pointer should be empty
        let initial_pointer = state.current_pointer();
        assert_eq!(initial_pointer.as_str(), "");

        // Enter should push context
        state.advance(SyntaxKind::LBrace).expect("should not fail");
        state.enter("key".into(), |state| {
            let pointer_in_context = state.current_pointer();
            assert_eq!(pointer_in_context.as_str(), "/key");
        });

        // After enter, pointer should be back to initial
        let final_pointer = state.current_pointer();
        assert_eq!(final_pointer.as_str(), "");
    }

    #[test]
    fn spans_include_json_pointer() {
        bind_context!(let context = r#"{"key": 42}"#);
        bind_state!(let mut state from context);

        state.advance(SyntaxKind::LBrace).expect("should not fail");

        state.enter("key".into(), |state| {
            state.advance(SyntaxKind::String).expect("should not fail");

            assert_eq!(state.current_pointer().as_str(), "/key");
        });
    }
}
