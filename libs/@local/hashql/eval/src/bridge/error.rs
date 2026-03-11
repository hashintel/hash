//! Errors that occur during bridge execution.
//!
//! These are runtime errors from fulfilling [`GraphRead`] suspensions — query
//! execution failures, row hydration problems, and parameter encoding issues.
//! Unlike the postgres *compiler* errors in [`crate::postgres::error`], these
//! represent failures at query execution time, not compilation time.
//!
//! [`GraphRead`]: hashql_mir::body::terminator::GraphRead

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic, Label, category::TerminalDiagnosticCategory, diagnostic::Message,
    severity::Severity,
};
use hashql_mir::interpret::error::{
    InterpretDiagnostic, InterpretDiagnosticCategory, SuspensionDiagnosticCategory,
};

const QUERY_EXECUTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "query-execution",
    name: "Query Execution",
};

const ROW_HYDRATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "row-hydration",
    name: "Row Hydration",
};

const PARAMETER_ENCODING: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "parameter-encoding",
    name: "Parameter Encoding",
};

const QUERY_LOOKUP: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "query-lookup",
    name: "Query Lookup",
};

fn category(terminal: &'static TerminalDiagnosticCategory) -> InterpretDiagnosticCategory {
    InterpretDiagnosticCategory::Suspension(SuspensionDiagnosticCategory(terminal))
}

pub(crate) fn query_execution(span: SpanId, message: &str) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&QUERY_EXECUTION), Severity::Error)
        .primary(Label::new(span, "query failed during execution"));

    diagnostic.add_message(Message::note(format!("postgres returned: {message}")));

    diagnostic
}

pub(crate) fn row_hydration(span: SpanId, message: &str) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&ROW_HYDRATION), Severity::Error)
        .primary(Label::new(span, "cannot decode row returned by postgres"));

    diagnostic.add_message(Message::note(message.to_owned()));

    diagnostic
}

pub(crate) fn parameter_encoding(span: SpanId, message: &str) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&PARAMETER_ENCODING), Severity::Error).primary(
        Label::new(span, "cannot encode query parameter for postgres"),
    );

    diagnostic.add_message(Message::note(message.to_owned()));

    diagnostic
}

pub(crate) fn query_lookup(span: SpanId) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&QUERY_LOOKUP), Severity::Bug).primary(
        Label::new(span, "no prepared query found for this graph read"),
    );

    diagnostic.add_message(Message::help(
        "the postgres compiler should produce a prepared query for every graph read terminator",
    ));

    diagnostic
}
