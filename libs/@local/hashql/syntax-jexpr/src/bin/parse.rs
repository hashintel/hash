//! Tiny CLI that takes a JExpr string via stdin, parses it and prints the AST to stdout.

use std::io::{Read as _, Write as _};

use hashql_core::{heap::Heap, span::SpanTable};
use hashql_diagnostics::{Source, Sources};
use hashql_syntax_jexpr::Parser;

fn main() -> Result<(), Box<dyn core::error::Error>> {
    let mut input = String::new();

    let mut stdin = std::io::stdin();
    stdin.read_to_string(&mut input)?;

    let mut sources = Sources::new();

    let heap = Heap::new();
    let mut spans = SpanTable::new(sources.push(Source::new(input.as_str())));
    let mut parser = Parser::new(&heap, &mut spans);

    let result = parser.parse_expr(input.as_bytes());
    match result {
        Ok(expr) => {
            let mut stdout = std::io::stdout();
            stdout.write_all(format!("{expr:#?}").as_bytes())?;

            Ok(())
        }
        Err(diagnostic) => {
            let mut stderr = std::io::stderr();

            let result = diagnostic.render(
                hashql_diagnostics::diagnostic::render::RenderOptions::new(
                    hashql_diagnostics::diagnostic::render::Format::Ansi,
                    &sources,
                ),
                &mut &spans,
            );
            stderr.write_all(result.as_bytes())?;

            std::process::exit(1)
        }
    }
}
