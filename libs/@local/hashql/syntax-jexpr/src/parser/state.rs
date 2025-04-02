use alloc::sync::Arc;

use circular_buffer::CircularBuffer;
use hashql_ast::heap::Heap;
use hashql_core::span::{SpanId, storage::SpanStorage};
use text_size::TextRange;

use super::error::{ParserDiagnostic, ParserDiagnosticCategory, expected_eof};
use crate::{
    error::ResultExt as _,
    lexer::{
        Lexer,
        error::{LexerDiagnostic, unexpected_eof, unexpected_token},
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
    fn peek_fill(&mut self, n: usize) -> Result<LookaheadStatus, LexerDiagnostic> {
        assert!(n < self.buffer.capacity(), "lookahead buffer overflow");

        // Fill the buffer until we have enough tokens or reach eof
        while self.buffer.len() <= n {
            match self.lexer.advance() {
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
    fn peek_n(&mut self, n: usize) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        if self.peek_fill(n)? == LookaheadStatus::EndOfInput {
            return Ok(None);
        }

        Ok(Some(&self.buffer[n]))
    }

    fn peek_n_span(
        &mut self,
        n: usize,
    ) -> Result<Result<&Token<'source>, TextRange>, LexerDiagnostic> {
        if self.peek_fill(n)? == LookaheadStatus::EndOfInput {
            return Ok(Err(self.span()));
        }

        Ok(Ok(&self.buffer[n]))
    }

    fn advance(&mut self) -> Option<Result<Token<'source>, LexerDiagnostic>> {
        if let Some(token) = self.buffer.pop_front() {
            return Some(Ok(token));
        }

        self.lexer.advance()
    }

    fn span(&self) -> TextRange {
        self.lexer.span()
    }
}

struct ParserContext {
    spans: Arc<SpanStorage<Span>>,
    stack: Vec<jsonptr::Token<'static>>,
}

impl ParserContext {
    fn current_pointer(&self) -> jsonptr::PointerBuf {
        jsonptr::PointerBuf::from_tokens(&self.stack)
    }

    fn insert_span(&self, span: Span) -> SpanId {
        self.spans.insert(span)
    }

    fn insert_range(&self, range: TextRange) -> SpanId {
        self.spans.insert(Span {
            range,
            pointer: Some(self.current_pointer()),
            parent_id: None,
        })
    }

    fn validate_token<'source, T>(
        &self,
        token: T,
        expected: SyntaxKindSet,
    ) -> Result<T, LexerDiagnostic>
    where
        T: AsRef<Token<'source>>,
    {
        let token_ref = token.as_ref();
        let syntax_kind = token_ref.kind.syntax();

        if expected.contains(syntax_kind) {
            return Ok(token);
        }

        let span = self.insert_range(token_ref.span);

        Err(unexpected_token(span, syntax_kind, expected))
    }
}

pub(crate) struct ParserState<'heap, 'source> {
    heap: &'heap Heap,
    lexer: LookaheadLexer<'source>,

    context: ParserContext,
}

impl<'heap, 'source> ParserState<'heap, 'source> {
    pub(crate) const fn new(
        heap: &'heap Heap,
        lexer: Lexer<'source>,
        spans: Arc<SpanStorage<Span>>,
    ) -> Self {
        Self {
            heap,
            lexer: LookaheadLexer {
                buffer: CircularBuffer::new(),
                lexer,
            },
            context: ParserContext {
                spans,
                stack: Vec::new(),
            },
        }
    }

    pub(crate) fn advance(
        &mut self,
        expected: impl Into<SyntaxKindSet>,
    ) -> Result<Token<'source>, LexerDiagnostic> {
        let expected = expected.into();

        let Some(token) = self.lexer.advance() else {
            let span = self.insert_range(self.lexer.span());

            return Err(unexpected_eof(span, expected));
        };

        let token = token?;

        self.context.validate_token(token, expected)
    }

    // Peek at the first token
    pub(crate) fn peek(&mut self) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        self.lexer.peek_n(0)
    }

    // Peek at the second token
    pub(crate) fn peek2(&mut self) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        self.lexer.peek_n(1)
    }

    pub(crate) fn peek_expect(
        &mut self,
        expected: impl Into<SyntaxKindSet>,
    ) -> Result<&Token<'source>, LexerDiagnostic> {
        let expected = expected.into();

        match self.lexer.peek_n_span(0)? {
            Ok(token) => self.context.validate_token(token, expected),
            Err(span) => {
                let span = self.context.insert_range(span);
                Err(unexpected_eof(span, expected))
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
        if let Some(token) = self.lexer.advance() {
            let token = token.change_category(ParserDiagnosticCategory::Lexer)?;

            let span = self.insert_range(token.span);

            return Err(expected_eof(span));
        }

        Ok(())
    }

    pub(crate) fn current_pointer(&self) -> jsonptr::PointerBuf {
        self.context.current_pointer()
    }

    pub(crate) fn insert_span(&self, span: Span) -> SpanId {
        self.context.insert_span(span)
    }

    pub(crate) fn insert_range(&self, range: TextRange) -> SpanId {
        self.context.insert_range(range)
    }

    pub(crate) fn current_span(&self) -> TextRange {
        self.lexer.span()
    }

    pub(crate) fn spans(&self) -> &SpanStorage<Span> {
        &self.context.spans
    }

    pub(crate) const fn heap(&self) -> &'heap Heap {
        self.heap
    }
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;
    use core::assert_matches::assert_matches;

    use json_number::NumberBuf;

    use crate::{
        lexer::{error::LexerDiagnosticCategory, syntax_kind::SyntaxKind, token_kind::TokenKind},
        parser::test::{bind_context, bind_state},
    };

    macro number($value:expr) {
        TokenKind::Number(Cow::Owned(
            NumberBuf::new(Vec::from($value)).expect("should be able to parse valid number"),
        ))
    }

    #[test]
    fn basic_peek_and_advance() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        // Peek without consuming
        let token = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(token.kind, number!("42"));

        // Peek again (should be the same token)
        let token2 = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(token2.kind, number!("42"));

        // Advance and consume the token
        let advanced = state.advance(SyntaxKind::Number).expect("should not fail");
        assert_eq!(advanced.kind, number!("42"));

        // We should now be at EOF
        assert!(state.peek().expect("should not fail").is_none());
        let diagnostic = state.advance(SyntaxKind::Number).expect_err("should fail");
        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);

        // Finish should succeed at EOF
        bind_state!(let mut finished_state from context);
        finished_state
            .advance(SyntaxKind::Number)
            .expect("should not fail");
        assert_matches!(finished_state.finish(), Ok(()));
    }

    #[test]
    fn multi_token_operations() {
        bind_context!(let context = "1 2 3 4 5");
        bind_state!(let mut state from context);

        // Fill the buffer with lookahead
        for i in 0..4 {
            let token = state
                .lexer
                .peek_n(i)
                .expect("should not fail")
                .expect("should have token");
            assert_eq!(token.kind, number!((i + 1).to_string()));
        }

        // Verify peek2 specifically
        let second = state
            .peek2()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(second.kind, number!("2"));

        // Consume tokens while peeking to test buffer management
        for i in 1..=4 {
            let peek = state
                .peek()
                .expect("should not fail")
                .expect("should have token");
            assert_eq!(peek.kind, number!(i.to_string()));

            let advanced = state.advance(SyntaxKind::Number).expect("should not fail");
            assert_eq!(advanced.kind, number!(i.to_string()));
        }

        // Consume last token
        let last = state.advance(SyntaxKind::Number).expect("should not fail");
        assert_eq!(last.kind, number!("5"));

        // Should be at EOF
        assert!(state.peek().expect("should not fail").is_none());
    }

    #[test]
    fn circular_buffer_behavior() {
        // This test specifically targets the circular buffer's wrap-around behavior
        bind_context!(let context = r#""a" "b" "c" "d" "e" "f" "g" "h""#);
        bind_state!(let mut state from context);

        // Fill the buffer by peeking
        for i in 0..4 {
            state
                .lexer
                .peek_n(i)
                .expect("should not fail")
                .expect("should have token");
        }

        // Consume first few tokens
        state.advance(SyntaxKind::String).expect("should not fail"); // a
        state.advance(SyntaxKind::String).expect("should not fail"); // b

        // Peek ahead to force buffer to wrap around
        let e_token = state
            .lexer
            .peek_n(2)
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(e_token.kind, TokenKind::String(Cow::Owned("e".to_owned())));

        // Continue consuming and verifying to test the wrap-around
        let tokens = ["c", "d", "e", "f", "g", "h"];
        for expected in tokens {
            let token = state.advance(SyntaxKind::String).expect("should not fail");

            assert_eq!(
                token.kind,
                TokenKind::String(Cow::Owned(expected.to_owned()))
            );
        }

        // Should be at EOF
        let diagnostic = state.advance(SyntaxKind::String).expect_err("should fail");
        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }

    #[test]
    fn peek_expect_behavior() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        // peek_expect should work when a token is available
        let required = state
            .peek_expect(SyntaxKind::Number)
            .expect("should not fail");
        assert_eq!(required.kind, number!("42"));

        // peek and peek_expect should return the same token
        let peeked = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(peeked.kind, number!("42"));

        // After consuming all tokens, peek_expect should error
        state.advance(SyntaxKind::Number).expect("should not fail");
        assert!(state.peek().expect("should not fail").is_none());

        let diagnostic = state
            .peek_expect(SyntaxKind::Number)
            .expect_err("should fail");
        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }

    #[expect(unused_mut)]
    #[test]
    fn finish_behavior() {
        // Test finish with tokens remaining
        bind_context!(let context = "42 true");
        bind_state!(let mut state from context);

        state.peek().expect("should not fail"); // Fill buffer
        assert!(state.finish().is_err()); // Should fail with tokens remaining

        // Test finish with no tokens
        bind_context!(let context = "");
        bind_state!(let mut empty_state from context);

        assert_matches!(empty_state.finish(), Ok(())); // Should succeed with no tokens
    }

    #[test]
    fn mixed_peek_and_advance() {
        // This test exercises more complex interaction patterns between peek and advance
        bind_context!(let context = r#""a" "b" "c" "d" "e""#);
        bind_state!(let mut state from context);

        // Peek ahead multiple tokens
        for (i, expected) in ["a", "b", "c", "d"].into_iter().enumerate() {
            let token = state
                .lexer
                .peek_n(i)
                .expect("should not fail")
                .expect("should have token");

            assert_eq!(
                token.kind,
                TokenKind::String(Cow::Owned(expected.to_owned()))
            );
        }

        // Consume first token
        state.advance(SyntaxKind::String).expect("should not fail");

        // Now peek ahead again to verify buffer management
        for (i, expected) in ["b", "c", "d", "e"].into_iter().enumerate() {
            let token = state
                .lexer
                .peek_n(i)
                .expect("should not fail")
                .expect("should have token");
            assert_eq!(
                token.kind,
                TokenKind::String(Cow::Owned(expected.to_owned()))
            );
        }

        // Random access within the buffer
        assert_eq!(
            state
                .peek()
                .expect("should not fail")
                .expect("should have token")
                .kind,
            TokenKind::String(Cow::Owned("b".to_owned()))
        );
        assert_eq!(
            state
                .peek2()
                .expect("should not fail")
                .expect("should have token")
                .kind,
            TokenKind::String(Cow::Owned("c".to_owned()))
        );
        assert_eq!(
            state
                .lexer
                .peek_n(2)
                .expect("should not fail")
                .expect("should have token")
                .kind,
            TokenKind::String(Cow::Owned("d".to_owned()))
        );

        // Consume remaining tokens
        for expected in ["b", "c", "d", "e"] {
            let token = state.advance(SyntaxKind::String).expect("should not fail");
            assert_eq!(
                token.kind,
                TokenKind::String(Cow::Owned(expected.to_owned()))
            );
        }

        // Verify EOF
        assert!(state.peek().expect("should not fail").is_none());
        let diagnostic = state.advance(SyntaxKind::String).expect_err("should fail");
        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }

    #[test]
    fn advance_expected() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        state
            .advance(SyntaxKind::Number)
            .expect("token returned should be a number");
    }

    #[test]
    fn advance_expected_invalid() {
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
    fn advance_expected_eof() {
        bind_context!(let context = "");
        bind_state!(let mut state from context);

        let diagnostic = state
            .advance(SyntaxKind::String)
            .expect_err("token returned should be invalid");

        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }

    #[test]
    fn peek_expected() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        state
            .peek_expect(SyntaxKind::Number)
            .expect("should not fail");
    }

    #[test]
    fn peek_expected_invalid() {
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
    fn peek_expected_eof() {
        bind_context!(let context = "");
        bind_state!(let mut state from context);

        let diagnostic = state
            .peek_expect(SyntaxKind::String)
            .expect_err("should fail");

        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }
}
