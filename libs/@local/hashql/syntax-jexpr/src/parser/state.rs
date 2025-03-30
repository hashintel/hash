use alloc::sync::Arc;

use circular_buffer::CircularBuffer;
use hashql_ast::heap::Heap;
use hashql_core::span::{SpanId, storage::SpanStorage};

use super::error::{ParserDiagnostic, ParserDiagnosticCategory, expected_eof};
use crate::{
    error::ResultExt as _,
    lexer::{
        Lexer,
        error::{LexerDiagnostic, unexpected_eof},
        token::Token,
    },
    span::Span,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
enum LookaheadStatus {
    EndOfInput,
    BufferFilled,
}

pub(crate) struct ParserState<'heap, 'source> {
    heap: &'heap Heap,
    lexer: Lexer<'source>,
    lookahead: CircularBuffer<4, Token<'source>>,

    spans: Arc<SpanStorage<Span>>,
    stack: Vec<jsonptr::Token<'static>>,
}

impl<'heap, 'source> ParserState<'heap, 'source> {
    pub(crate) const fn new(
        heap: &'heap Heap,
        lexer: Lexer<'source>,
        spans: Arc<SpanStorage<Span>>,
    ) -> Self {
        Self {
            heap,
            lexer,
            lookahead: CircularBuffer::new(),
            spans,
            stack: Vec::new(),
        }
    }

    pub(crate) fn advance(&mut self) -> Result<Token<'source>, LexerDiagnostic> {
        if let Some(token) = self.lookahead.pop_front() {
            return Ok(token);
        }

        self.lexer
            .advance()
            .ok_or_else(|| {
                let span = self.spans.insert(Span {
                    range: self.lexer.span(),
                    pointer: None,
                    parent_id: None,
                });

                unexpected_eof(span)
            })
            .flatten()
    }

    #[expect(clippy::panic_in_result_fn)]
    fn peek_fill(&mut self, n: usize) -> Result<LookaheadStatus, LexerDiagnostic> {
        assert!(n < self.lookahead.capacity(), "lookahead buffer overflow");

        // Fill the lookahead buffer until we have enough tokens or reach eof
        while self.lookahead.len() <= n {
            match self.lexer.advance() {
                Some(Ok(token)) => {
                    self.lookahead.push_back(token);
                }
                Some(Err(error)) => return Err(error),
                None => return Ok(LookaheadStatus::EndOfInput),
            }
        }

        Ok(LookaheadStatus::BufferFilled)
    }

    // Peek at the nth token (0-based index)
    pub(crate) fn peek_n(&mut self, n: usize) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        if self.peek_fill(n)? == LookaheadStatus::EndOfInput {
            return Ok(None);
        }

        // Return the nth token
        Ok(Some(&self.lookahead[n]))
    }

    // Peek at the first token
    pub(crate) fn peek(&mut self) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        self.peek_n(0)
    }

    // Peek at the second token
    pub(crate) fn peek2(&mut self) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        self.peek_n(1)
    }

    pub(crate) fn peek_required(&mut self) -> Result<&Token<'source>, LexerDiagnostic> {
        if self.peek_fill(0)? == LookaheadStatus::EndOfInput {
            let span = self.spans.insert(Span {
                range: self.lexer.span(),
                pointer: None,
                parent_id: None,
            });

            return Err(unexpected_eof(span));
        }

        let token = self
            .peek()?
            .expect("previous peek ensured that this is not EOF");
        Ok(token)
    }

    pub(crate) fn enter<T>(
        &mut self,
        token: jsonptr::Token<'static>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        self.stack.push(token);

        let result = closure(self);

        self.stack.pop();
        result
    }

    pub(crate) fn finish(mut self) -> Result<(), ParserDiagnostic> {
        if let Some(peek) = self.lookahead.pop_front() {
            let span = self.insert_span(Span {
                range: peek.span,
                pointer: Some(self.current_pointer()),
                parent_id: None,
            });

            return Err(expected_eof(span));
        }

        if let Some(token) = self.lexer.advance() {
            let token = token.change_category(ParserDiagnosticCategory::Lexer)?;

            let span = self.insert_span(Span {
                range: token.span,
                pointer: Some(self.current_pointer()),
                parent_id: None,
            });

            return Err(expected_eof(span));
        }

        Ok(())
    }

    pub(crate) fn current_pointer(&self) -> jsonptr::PointerBuf {
        jsonptr::PointerBuf::from_tokens(&self.stack)
    }

    pub(crate) fn insert_span(&self, span: Span) -> SpanId {
        self.spans.insert(span)
    }

    pub(crate) fn spans(&self) -> &SpanStorage<Span> {
        &self.spans
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
        lexer::{error::LexerDiagnosticCategory, token_kind::TokenKind},
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
        let advanced = state.advance().expect("should not fail");
        assert_eq!(advanced.kind, number!("42"));

        // We should now be at EOF
        assert!(state.peek().expect("should not fail").is_none());
        let diagnostic = state.advance().expect_err("should fail");
        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);

        // Finish should succeed at EOF
        bind_state!(let mut finished_state from context);
        finished_state.advance().expect("should not fail");
        assert_matches!(finished_state.finish(), Ok(()));
    }

    #[test]
    fn multi_token_operations() {
        bind_context!(let context = "1 2 3 4 5");
        bind_state!(let mut state from context);

        // Fill the buffer with lookahead
        for i in 0..4 {
            let token = state
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

            let advanced = state.advance().expect("should not fail");
            assert_eq!(advanced.kind, number!(i.to_string()));
        }

        // Consume last token
        let last = state.advance().expect("should not fail");
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
                .peek_n(i)
                .expect("should not fail")
                .expect("should have token");
        }

        // Consume first few tokens
        state.advance().expect("should not fail"); // a
        state.advance().expect("should not fail"); // b

        // Peek ahead to force buffer to wrap around
        let e_token = state
            .peek_n(2)
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(e_token.kind, TokenKind::String(Cow::Owned("e".to_owned())));

        // Continue consuming and verifying to test the wrap-around
        let tokens = ["c", "d", "e", "f", "g", "h"];
        for expected in tokens {
            let token = state.advance().expect("should not fail");

            assert_eq!(
                token.kind,
                TokenKind::String(Cow::Owned(expected.to_owned()))
            );
        }

        // Should be at EOF
        let diagnostic = state.advance().expect_err("should fail");
        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }

    #[test]
    fn peek_required_behavior() {
        bind_context!(let context = "42");
        bind_state!(let mut state from context);

        // peek_required should work when a token is available
        let required = state.peek_required().expect("should not fail");
        assert_eq!(required.kind, number!("42"));

        // peek and peek_required should return the same token
        let peeked = state
            .peek()
            .expect("should not fail")
            .expect("should have token");
        assert_eq!(peeked.kind, number!("42"));

        // After consuming all tokens, peek_required should error
        state.advance().expect("should not fail");
        assert!(state.peek().expect("should not fail").is_none());

        let diagnostic = state.peek_required().expect_err("should fail");
        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }

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
                .peek_n(i)
                .expect("should not fail")
                .expect("should have token");

            assert_eq!(
                token.kind,
                TokenKind::String(Cow::Owned(expected.to_owned()))
            );
        }

        // Consume first token
        state.advance().expect("should not fail");

        // Now peek ahead again to verify buffer management
        for (i, expected) in ["b", "c", "d", "e"].into_iter().enumerate() {
            let token = state
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
                .peek_n(2)
                .expect("should not fail")
                .expect("should have token")
                .kind,
            TokenKind::String(Cow::Owned("d".to_owned()))
        );

        // Consume remaining tokens
        for expected in ["b", "c", "d", "e"] {
            let token = state.advance().expect("should not fail");
            assert_eq!(
                token.kind,
                TokenKind::String(Cow::Owned(expected.to_owned()))
            );
        }

        // Verify EOF
        assert!(state.peek().expect("should not fail").is_none());
        let diagnostic = state.advance().expect_err("should fail");
        assert_eq!(diagnostic.category, LexerDiagnosticCategory::UnexpectedEof);
    }
}
