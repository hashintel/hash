#![feature(assert_matches, new_range_api, box_into_boxed_slice)]

use alloc::sync::Arc;

use hql_cst::{arena::Arena, expr::Expr, Program};
use hql_diagnostics::Diagnostic;
use hql_span::{storage::SpanStorage, SpanId};

use self::{
    parser::{error::expected_eof, TokenStream},
    span::Span,
};

extern crate alloc;

pub mod error;
pub(crate) mod lexer;
pub(crate) mod parser;
pub mod span;

pub struct Parser<'arena> {
    arena: &'arena Arena,
    spans: Arc<SpanStorage<Span>>,
}

impl<'arena> Parser<'arena> {
    pub fn new(arena: &'arena Arena, spans: impl Into<Arc<SpanStorage<Span>>>) -> Self {
        Self {
            arena,
            spans: spans.into(),
        }
    }

    /// Parse an expression from the given source.
    ///
    /// # Errors
    ///
    /// Returns an error if the source is not a valid J-Expr expression.
    pub fn parse_expr<'source>(
        &self,
        source: &'source [u8],
    ) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>> {
        let lexer = lexer::Lexer::new(source, Arc::clone(&self.spans));
        let mut stream = TokenStream {
            arena: self.arena,
            lexer,
            spans: Arc::clone(&self.spans),
            stack: Some(Vec::new()),
        };

        let expr = parser::parse_expr(&mut stream, None)?;

        if stream.lexer.advance().is_some() {
            let span = stream.spans.insert(Span {
                range: stream.lexer.span(),
                pointer: None,
                parent_id: None,
            });

            return Err(expected_eof(span));
        }

        Ok(expr)
    }

    /// Parse a program from the given source.
    ///
    /// # Errors
    ///
    /// Returns an error if the source is not a valid J-Expr program.
    pub fn parse_program<'source>(
        &self,
        source: &'source [u8],
    ) -> Result<Program<'arena, 'source>, Diagnostic<'static, SpanId>> {
        let lexer = lexer::Lexer::new(source, Arc::clone(&self.spans));
        let mut stream = TokenStream {
            arena: self.arena,
            lexer,
            spans: Arc::clone(&self.spans),
            stack: Some(Vec::new()),
        };

        let program = parser::parse_program(&mut stream)?;

        if stream.lexer.advance().is_some() {
            let span = stream.spans.insert(Span {
                range: stream.lexer.span(),
                pointer: None,
                parent_id: None,
            });

            return Err(expected_eof(span));
        }

        Ok(program)
    }
}
