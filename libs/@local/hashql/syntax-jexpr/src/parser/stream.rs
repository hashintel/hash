use alloc::sync::Arc;

use hashql_cst::arena::MemoryPool;
use hashql_span::{SpanId, storage::SpanStorage};

use super::error::unexpected_eof;
use crate::{
    error::{JExprDiagnostic, JExprDiagnosticCategory},
    lexer::{Lexer, token::Token},
    span::Span,
};

pub(crate) struct TokenStream<'arena, 'source> {
    pub arena: &'arena MemoryPool,
    pub lexer: Lexer<'source>,

    pub spans: Arc<SpanStorage<Span>>,
    pub stack: Option<Vec<jsonptr::Token<'static>>>,
}

impl<'source> TokenStream<'_, 'source> {
    pub(crate) fn next_or_err(&mut self) -> Result<Token<'source>, JExprDiagnostic> {
        let Some(token) = self.lexer.advance() else {
            let span = Span {
                range: self.lexer.span(),
                pointer: None,
                parent_id: None,
            };
            let span = self.spans.insert(span);

            return Err(unexpected_eof(span).map_category(JExprDiagnosticCategory::Parser));
        };

        token.map_err(|error| error.map_category(JExprDiagnosticCategory::Lexer))
    }

    pub(crate) fn insert_span(&self, span: Span) -> SpanId {
        self.spans.insert(span)
    }

    pub(crate) fn descend<T, U>(
        &mut self,
        value: U,
        token: impl FnOnce(&U) -> jsonptr::Token<'static>,
        func: impl FnOnce(&mut Self, U) -> T,
    ) -> T {
        if let Some(stack) = self.stack.as_mut() {
            stack.push(token(&value));
        }

        let result = func(self, value);

        if let Some(stack) = self.stack.as_mut() {
            stack.pop();
        }

        result
    }

    pub(crate) fn pointer(&self) -> Option<jsonptr::PointerBuf> {
        self.stack
            .as_ref()
            .map(|stack| jsonptr::PointerBuf::from_tokens(stack.clone()))
    }
}
