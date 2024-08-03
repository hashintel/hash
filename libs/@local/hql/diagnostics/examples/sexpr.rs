use core::fmt::Debug;
use std::io::stdout;

use ariadne::FnCache;
use hql_diagnostics::{
    category::Category, config::ReportConfig, help::Help, label::Label, severity::Severity,
    Diagnostic,
};
use hql_span::{file::FileId, storage::SpanStorage, Span, TextRange};
use jsonptr::PointerBuf;

// The error is at the `-`
const SOURCE: &str = r#"["let", "x-y", {"const": 2}]"#;

const SYNTAX_CATEGORY: &Category = &Category {
    id: "syntax",
    name: "Syntax",
    parent: None,
};

const INVALID_IDENTIFIER: &Category = &Category {
    id: "invalid-identifier",
    name: "Invalid Identifier",
    parent: Some(SYNTAX_CATEGORY),
};

fn main() {
    let mut storage = SpanStorage::new();
    let cache: FnCache<FileId, _, &'static str> = FnCache::new(|id: &FileId| {
        if *id == FileId::INLINE {
            return Ok(SOURCE);
        }

        Err(Box::new("file not found") as Box<dyn Debug>)
    });

    let parent_span = storage.insert(Span {
        file: FileId::INLINE,
        range: TextRange::new(8.into(), 13.into()),
        parent: None,
        extra: Some(PointerBuf::try_from("/1").expect("should be valid pointer")),
    });

    let span = storage.insert(Span {
        file: FileId::INLINE,
        range: TextRange::new(2.into(), 3.into()),
        parent: Some(parent_span),
        extra: None,
    });

    let mut diagnostic =
        Diagnostic::new(*INVALID_IDENTIFIER, Severity::ERROR, "invalid identifier");

    diagnostic.labels.push(Label::new(
        storage.resolve(span).expect("valid span"),
        "unexpected character",
    ));

    diagnostic.help = Some(Help::new(
        "Identifiers must start with a letter or underscore, or be one of the following symbols: \
         +, -, *, /, %, =, <, >",
    ));

    let report = diagnostic.report(FileId::INLINE, ReportConfig::default());
    report
        .write_for_stdout(cache, stdout())
        .expect("should be able to write report");

    serde_json::to_writer_pretty(stdout(), &diagnostic).expect("should be able to serialize");
}
