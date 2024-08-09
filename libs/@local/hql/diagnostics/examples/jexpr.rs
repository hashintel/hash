extern crate alloc;

use alloc::borrow::Cow;
use core::fmt::Debug;
use std::io::stdout;

use hql_diagnostics::{
    category::Category, config::ReportConfig, help::Help, label::Label, rob::RefOrBox,
    severity::Severity, span::DiagnosticSpan, Diagnostic,
};
use hql_span::{storage::SpanStorage, Span, SpanId, TextRange};
use jsonptr::PointerBuf;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
struct JsonSpan {
    range: TextRange,
    pointer: Option<PointerBuf>,
    parent_id: Option<SpanId>,
}

impl Span for JsonSpan {
    fn parent_id(&self) -> Option<SpanId> {
        self.parent_id
    }
}

// The error is at the `-`
const SOURCE: &str = r#"["let", "x-y", {"const": 2}]"#;

const SYNTAX_CATEGORY: &Category = &Category {
    id: Cow::Borrowed("syntax"),
    name: Cow::Borrowed("Syntax"),
    parent: None,
};

const INVALID_IDENTIFIER: &Category = &Category {
    id: Cow::Borrowed("invalid-identifier"),
    name: Cow::Borrowed("Invalid Identifier"),
    parent: Some(RefOrBox::Ref(SYNTAX_CATEGORY)),
};

fn main() {
    let storage = SpanStorage::new();

    let parent_span = storage.insert(JsonSpan {
        range: TextRange::new(8.into(), 13.into()),
        parent_id: None,
        pointer: Some(PointerBuf::try_from("/1").expect("should be valid pointer")),
    });

    let span = storage.insert(JsonSpan {
        range: TextRange::new(2.into(), 3.into()),
        parent_id: Some(parent_span),
        pointer: None,
    });

    let mut diagnostic = Diagnostic::new(INVALID_IDENTIFIER, Severity::ERROR);

    diagnostic.labels.push(Label::new(
        storage.resolve(span).expect("valid span"),
        "unexpected character",
    ));

    diagnostic.help = Some(Help::new(
        "Identifiers must start with a letter or underscore, or be one of the following symbols: \
         +, -, *, /, %, =, <, >",
    ));

    let report = diagnostic.report(ReportConfig::default().with_transform_span(
        |span: &JsonSpan| DiagnosticSpan {
            range: span.range,
            parent_id: span.parent_id,
        },
    ));

    // [syntax::invalid-identifier] Error: Invalid Identifier
    //    ╭─[<unknown>:1:1]
    //    │
    //  1 │ ["let", "x-y", {"const": 2}]
    //    │           ┬
    //    │           ╰── unexpected character
    //    │
    //    │ Help: Identifiers must start with a letter or underscore, ...
    // ───╯
    report
        .write_for_stdout(ariadne::Source::from(SOURCE), stdout())
        .expect("should be able to write report");

    serde_json::to_writer_pretty(stdout(), &diagnostic).expect("should be able to serialize");
}
