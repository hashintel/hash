use std::str::pattern::{Pattern, Searcher};

use hashql_diagnostics::severity::Severity;

use crate::annotation::diagnostic::DiagnosticAnnotation;

struct RunConfig {
    update: bool,
}

enum RunMode {
    Pass,
    Fail,
    Skip,
}

struct FileOptions {
    run: RunMode,
}

struct FileAnnotations {
    diagnostics: Vec<DiagnosticAnnotation>,
}

fn parse_file(contents: &str) {}
