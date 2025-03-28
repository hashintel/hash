//! # HashQL J-Expr syntax
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(assert_matches, new_range_api, box_into_boxed_slice, decl_macro)]

// use alloc::sync::Arc;

// use hashql_cst::{arena::MemoryPool, expr::Expr};
// use hashql_span::storage::SpanStorage;

// use self::{
//     error::{JExprDiagnostic, JExprDiagnosticCategory},
//     parser::{TokenStream, error::expected_eof},
//     span::Span,
// };

extern crate alloc;

// pub mod error;
pub(crate) mod lexer;
// pub(crate) mod parser;
pub mod span;

// pub struct Parser<'arena> {
//     arena: &'arena MemoryPool,
//     spans: Arc<SpanStorage<Span>>,
// }

// impl<'arena> Parser<'arena> {
//     pub fn new(arena: &'arena MemoryPool, spans: impl Into<Arc<SpanStorage<Span>>>) -> Self {
//         Self {
//             arena,
//             spans: spans.into(),
//         }
//     }

//     /// Parse an expression from the given source.
//     ///
//     /// # Errors
//     ///
//     /// Returns an error if the source is not a valid J-Expr expression.
//     pub fn parse_expr<'source>(
//         &self,
//         source: &'source [u8],
//     ) -> Result<Expr<'arena, 'source>, JExprDiagnostic> {
//         let lexer = lexer::Lexer::new(source, Arc::clone(&self.spans));
//         let mut stream = TokenStream {
//             arena: self.arena,
//             lexer,
//             spans: Arc::clone(&self.spans),
//             stack: Some(Vec::new()),
//         };

//         let expr = parser::parse_expr(&mut stream, None)?;

//         if stream.lexer.advance().is_some() {
//             let span = stream.spans.insert(Span {
//                 range: stream.lexer.span(),
//                 pointer: None,
//                 parent_id: None,
//             });

//             return Err(expected_eof(span).map_category(JExprDiagnosticCategory::Parser));
//         }

//         Ok(expr)
//     }
// }

#[cfg(test)]
mod tests {
    // This test is needed here to satisfy the CI test runner, and will be removed once the code has
    // been refactored.
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}
