//! Parses one J-Expr document from stdin with [`Parser::parse_expr`].
//!
//! The binary lets a J-Expr producer outside Rust check its output against this crate's parser. On
//! success, it writes the [`SyntaxDump`] of the parsed [`Expr`] to stdout and exits with status 0.
//! With `--no-output` it writes nothing on success, for a caller that only needs to know whether
//! the parser accepts the document. On a syntax error, it writes the rendered diagnostic to stderr
//! and exits with status 1. Input that is not UTF-8 and an I/O failure also exit with status 1,
//! with the error on stderr. The diagnostic carries ANSI colour only when stderr is a terminal.
//!
//! [`Expr`]: hashql_ast::node::expr::Expr
//! [`SyntaxDump`]: hashql_ast::format::SyntaxDump

use std::io::{IsTerminal as _, Read as _, Write as _};

use hashql_ast::format::SyntaxDump as _;
use hashql_core::{heap::Heap, span::SpanTable};
use hashql_diagnostics::{
    Source, Sources,
    diagnostic::render::{ColorDepth, Format, RenderOptions},
};
use hashql_syntax_jexpr::Parser;

fn main() -> Result<(), Box<dyn core::error::Error>> {
    let mut input = String::new();

    let mut args = std::env::args();
    let no_output = args.any(|arg| arg == "--no-output");

    let mut stdin = std::io::stdin();
    stdin.read_to_string(&mut input)?;

    let mut sources = Sources::new();

    let heap = Heap::new();
    let mut spans = SpanTable::new(sources.push(Source::new(input.as_str())));
    let mut parser = Parser::new(&heap, &mut spans);

    let result = parser.parse_expr(input.as_bytes());
    match result {
        Ok(expr) => {
            if no_output {
                return Ok(());
            }

            let mut stdout = std::io::stdout();
            stdout.write_all(expr.syntax_dump_to_string().as_bytes())?;

            Ok(())
        }
        Err(diagnostic) => {
            let mut stderr = std::io::stderr();

            let mut options = RenderOptions::new(Format::Ansi, &sources);
            if !stderr.is_terminal() {
                options.color_depth = ColorDepth::Monochrome;
            }

            let result = diagnostic.render(options, &mut &spans);
            stderr.write_all(result.as_bytes())?;

            std::process::exit(1)
        }
    }
}
