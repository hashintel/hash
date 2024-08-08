use hql_cst::arena::Arena;
use hql_diagnostics::Diagnostic;
use hql_span::{storage::SpanStorage, SpanId};

use super::error::unexpected_eof;
use crate::{
    lexer::{token::Token, Lexer},
    span::Span,
};

pub(crate) struct TokenStream<'arena, 'lexer, 'source> {
    pub arena: &'arena Arena,
    pub lexer: &'lexer mut Lexer<'source>,

    pub spans: SpanStorage<Span>,
    pub stack: Option<Vec<jsonptr::Token<'source>>>,
}

impl<'arena, 'lexer, 'source> TokenStream<'arena, 'lexer, 'source> {
    pub(crate) fn next_or_err(&mut self) -> Result<Token<'source>, Diagnostic<'static, SpanId>> {
        let Some(token) = self.lexer.next() else {
            let span = Span {
                range: self.lexer.span(),
                pointer: None,
                parent_id: None,
            };
            let span = self.spans.insert(span);

            return Err(unexpected_eof(span));
        };

        token
    }

    pub(crate) fn insert_span(&self, span: Span) -> SpanId {
        self.spans.insert(span)
    }

    pub(crate) fn descend<T>(
        &mut self,
        token: impl Into<jsonptr::Token<'source>>,
        f: impl FnOnce(&mut Self) -> T,
    ) -> T {
        if let Some(stack) = self.stack.as_mut() {
            stack.push(token.into());
        }

        let result = f(self);

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
