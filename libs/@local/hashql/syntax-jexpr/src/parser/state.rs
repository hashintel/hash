use alloc::sync::Arc;
use core::mem;

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

pub(crate) struct ParserState<'heap, 'source> {
    heap: &'heap Heap,
    lexer: Lexer<'source>,
    peek: Option<Token<'source>>,

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
            peek: None,
            spans,
            stack: Vec::new(),
        }
    }

    pub(crate) fn advance(&mut self) -> Result<Token<'source>, LexerDiagnostic> {
        if let Some(token) = self.peek.take() {
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

    pub(crate) fn peek(&mut self) -> Result<Option<&Token<'source>>, LexerDiagnostic> {
        match &mut self.peek {
            Some(token) => Ok(Some(token)),
            peek @ None => {
                let Some(token) = self.lexer.advance() else {
                    return Ok(None);
                };

                *peek = Some(token?);
                Ok(Some(peek.as_ref().unwrap_or_else(|| unreachable!())))
            }
        }
    }

    pub(crate) fn peek_or_error(&mut self) -> Result<&Token<'source>, LexerDiagnostic> {
        // we inline this from peek, because otherwise we'd have lifetime problems
        match &mut self.peek {
            Some(token) => Ok(token),
            peek @ None => {
                let Some(token) = self.lexer.advance() else {
                    let span = self.spans.insert(Span {
                        range: self.lexer.span(),
                        pointer: None,
                        parent_id: None,
                    });

                    return Err(unexpected_eof(span));
                };

                *peek = Some(token?);
                Ok(peek.as_ref().unwrap_or_else(|| unreachable!()))
            }
        }
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
        if let Some(peek) = &self.peek {
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
