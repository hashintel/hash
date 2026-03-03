use hashql_ast::format::SyntaxDump as _;
use hashql_core::{heap::Heap, span::SpanTable};
use hashql_diagnostics::source::SourceId;

use crate::{lexer::Lexer, parser::state::ParserState, span::Span, test::render_diagnostic};

pub(crate) struct TestContext {
    pub input: &'static str,
    pub heap: Heap,
    pub spans: SpanTable<Span>,
}

pub(crate) macro bind_context(let $context:ident = $value:expr) {
    let mut $context = TestContext {
        input: $value,
        heap: Heap::new(),
        spans: SpanTable::new(SourceId::new_unchecked(0x00)),
    };
}

pub(crate) macro bind_state(let mut $name:ident from $context:ident) {
    let lexer = Lexer::new($context.input.as_bytes());

    let mut $name = ParserState::new(&$context.heap, lexer, &mut $context.spans);
}

/// Represents the successful result of parsing an expression.
#[derive(Debug)]
pub(crate) struct ParseTestOk {
    /// String representation of the syntax tree.
    pub dump: String,
    /// Original input text that was parsed.
    pub input: &'static str,
}

/// Represents an error that occurred during expression parsing.
#[derive(Debug)]
pub(crate) struct ParseTestErr {
    /// Formatted diagnostic message.
    pub diagnostic: String,
    /// Original input text that caused the error.
    pub input: &'static str,
}

pub(crate) macro bind_parser(fn $name:ident($parser:ident, $expected:expr)) {
    fn $name(input: &'static str) -> Result<ParseTestOk, ParseTestErr> {
        bind_context!(let context = input);
        bind_state!(let mut state from context);

        let token = state.advance($expected).expect("should have at least one token");

        match $parser(&mut state, token) {
            Ok(expr) => Ok(ParseTestOk {
                dump: expr.syntax_dump_to_string(),
                input,
            }),
            Err(diagnostic) => Err(ParseTestErr {
                diagnostic: render_diagnostic(context.input, &diagnostic, &context.spans),
                input,
            }),
        }
    }
}
