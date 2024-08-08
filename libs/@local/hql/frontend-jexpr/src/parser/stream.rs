use hql_cst::arena::Arena;
use hql_diagnostics::{label::Label, severity::Severity, Diagnostic};
use hql_span::SpanId;

use super::error::unexpected_eof;
use crate::{
    lexer::{token::Token, Lexer},
    span::Span,
};

pub(crate) struct TokenStream<'arena, 'lexer, 'source> {
    pub arena: &'arena Arena,
    pub lexer: &'lexer mut Lexer<'source>,

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
            let span = self.lexer.spans_mut().insert(span);

            return Err(unexpected_eof(span));
        };

        self.lexer.next().ok_or_else(|| {
            Diagnostic::new_error("unexpected end of input").attach(self.lexer.span())
        })
    }

    pub(crate) fn insert_span(&mut self, span: Span) -> SpanId {
        self.lexer.spans_mut().insert(span)
    }

    pub(crate) fn descend<T, U>(
        &mut self,
        token: impl FnOnce() -> T,
        f: impl FnOnce(&mut Self) -> U,
    ) -> U
    where
        T: Into<jsonptr::Token<'source>>,
    {
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
