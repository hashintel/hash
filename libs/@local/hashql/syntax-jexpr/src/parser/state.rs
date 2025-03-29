use std::sync::Arc;

use hashql_ast::heap::Heap;
use hashql_core::span::{SpanId, storage::SpanStorage};

use crate::{
    lexer::{
        Lexer,
        error::{LexerDiagnostic, unexpected_eof},
        token::Token,
    },
    span::Span,
};

pub(crate) struct ParserState<'heap, 'source> {
    arena: &'heap Heap,
    lexer: Lexer<'source>,
    peek: Option<Token<'source>>,

    spans: Arc<SpanStorage<Span>>,
    stack: Vec<jsonptr::Token<'static>>,
}

impl<'heap, 'source> ParserState<'heap, 'source> {
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

    pub(crate) fn peek(&mut self) -> Result<&Token<'source>, LexerDiagnostic> {
        match &mut self.peek {
            Some(token) => Ok(token),
            peek @ None => {
                let token = self
                    .lexer
                    .advance()
                    .ok_or_else(|| {
                        let span = self.spans.insert(Span {
                            range: self.lexer.span(),
                            pointer: None,
                            parent_id: None,
                        });

                        unexpected_eof(span)
                    })
                    .flatten()?;

                *peek = Some(token);
                Ok(peek.as_ref().unwrap_or_else(|| unreachable!()))
            }
        }
    }

    pub(crate) fn descend<T>(
        &mut self,
        token: jsonptr::Token<'static>,
        closure: impl FnOnce(&mut Self) -> T,
    ) -> T {
        self.stack.push(token);

        let result = closure(self);

        self.stack.pop();
        result
    }

    pub(crate) fn current_pointer(&self) -> jsonptr::PointerBuf {
        jsonptr::PointerBuf::from_tokens(&self.stack)
    }

    pub(crate) fn insert_span(&mut self, span: Span) -> SpanId {
        self.spans.insert(span)
    }
}
