use alloc::sync::Arc;

use hashql_ast::heap::Heap;
use hashql_core::span::storage::SpanStorage;

use crate::{lexer::Lexer, parser::state::ParserState, span::Span};

pub(crate) struct TestContext {
    pub input: &'static str,
    pub heap: Heap,
    pub spans: Arc<SpanStorage<Span>>,
}

pub(crate) macro bind_context(let $context:ident = $value:expr) {
    let $context = TestContext {
        input: $value,
        heap: Heap::new(),
        spans: Arc::new(SpanStorage::new()),
    };
}

pub(crate) macro bind_state(let mut $name:ident from $context:ident) {
    let lexer = Lexer::new($context.input.as_bytes(), Arc::clone(&$context.spans));

    let mut $name = ParserState::new(&$context.heap, lexer, Arc::clone(&$context.spans));
}
