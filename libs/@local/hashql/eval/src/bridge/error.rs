//! Errors that occur while fulfilling [`GraphRead`] suspensions.
//!
//! These are internal runtime errors — failures in the compiled query execution,
//! row decoding, or parameter encoding. The user wrote HashQL, not SQL; if the
//! bridge fails, it indicates a bug in the compiler or runtime.
//!
//! [`GraphRead`]: hashql_mir::body::terminator::GraphRead

use hashql_core::{span::SpanId, r#type::TypeId};
use hashql_diagnostics::{
    Diagnostic, Label, category::TerminalDiagnosticCategory, diagnostic::Message,
    severity::Severity,
};
use hashql_mir::{
    body::basic_block::BasicBlockId,
    def::DefId,
    interpret::error::{
        InterpretDiagnostic, InterpretDiagnosticCategory, SuspensionDiagnosticCategory,
    },
    pass::execution::traversal::EntityPath,
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

const VALUE_DESERIALIZATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "value-deserialization",
    name: "Value Deserialization",
};

const QUERY_LOOKUP: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "query-lookup",
    name: "Query Lookup",
};

fn category(terminal: &'static TerminalDiagnosticCategory) -> InterpretDiagnosticCategory {
    InterpretDiagnosticCategory::Suspension(SuspensionDiagnosticCategory(terminal))
}

/// Errors from the bridge while fulfilling a [`GraphRead`] suspension.
///
/// All variants represent internal failures — the user wrote HashQL, not SQL.
/// If the bridge fails, the compiler or runtime produced something invalid.
///
/// [`GraphRead`]: hashql_mir::body::terminator::GraphRead
#[derive(Debug)]
pub enum BridgeError {
    /// The compiled SQL query was rejected by PostgreSQL.
    ///
    /// Carries the generated SQL so the diagnostic can show exactly what
    /// the compiler produced.
    QueryExecution {
        /// The SQL statement that was sent to the database.
        sql: String,
        /// The rejection error from the database.
        source: tokio_postgres::Error,
    },

    /// A row returned by PostgreSQL could not be decoded into a value.
    ///
    /// The query executed successfully, but a column in the result set has a
    /// type the runtime does not expect, indicating a mismatch between what
    /// the SQL lowering pass promised and what the database actually returned.
    RowHydration {
        /// The zero-based column index that failed to decode.
        column: usize,
        /// The entity storage location this column corresponds to.
        path: EntityPath,
        /// The database error describing the type mismatch.
        source: tokio_postgres::Error,
    },

    /// A decoded column value does not match the expected type for its entity path.
    ///
    /// The column decoded successfully at the PostgreSQL wire level, but the
    /// resulting value could not be deserialized into the HashQL type the
    /// runtime expects for this storage location. This indicates the SQL
    /// lowering pass produced a query whose result shape does not match the
    /// entity schema.
    ValueDeserialization {
        /// The zero-based column index.
        column: usize,
        /// The entity storage location that failed.
        path: EntityPath,
        /// The type the runtime expected to deserialize into.
        expected: TypeId,
    },

    /// A query parameter could not be serialized for PostgreSQL.
    ///
    /// The SQL lowering pass emitted a parameter that the encoder does not
    /// know how to serialize into the wire format the database expects.
    ParameterEncoding {
        /// The zero-based index of the parameter that failed (`$1` = index 0).
        parameter: usize,
        /// The encoding error.
        source: Box<dyn core::error::Error + Send + Sync>,
    },

    /// No prepared query exists for this graph read location.
    ///
    /// Every [`GraphRead`] terminator in the MIR should have a corresponding
    /// compiled query produced by the SQL lowering pass.
    ///
    /// [`GraphRead`]: hashql_mir::body::terminator::GraphRead
    QueryLookup {
        /// The definition containing the graph read.
        body: DefId,
        /// The basic block containing the graph read terminator.
        block: BasicBlockId,
    },
}

impl BridgeError {
    pub fn into_diagnostic(self, span: SpanId) -> InterpretDiagnostic {
        match self {
            Self::QueryExecution { sql, source } => query_execution(span, &sql, &source),
            Self::RowHydration {
                column,
                path,
                source,
            } => row_hydration(span, column, path, &source),
            Self::ValueDeserialization {
                column,
                path,
                expected,
            } => value_deserialization(span, column, path, expected),
            Self::ParameterEncoding { parameter, source } => {
                parameter_encoding(span, parameter, &*source)
            }
            Self::QueryLookup { body, block } => query_lookup(span, body, block),
        }
    }
}

fn query_execution(span: SpanId, sql: &str, error: &tokio_postgres::Error) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&QUERY_EXECUTION), Severity::Bug).primary(
        Label::new(span, "compiled query was rejected by the database"),
    );

    diagnostic.add_message(Message::note(format!("generated SQL: {sql}")));

    diagnostic.add_message(Message::note(format!("the database reported: {error}")));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce queries that the database accepts",
    ));

    diagnostic
}

fn row_hydration(
    span: SpanId,
    column: usize,
    path: EntityPath,
    source: &tokio_postgres::Error,
) -> InterpretDiagnostic {
    let symbol = path.as_symbol();

    let mut diagnostic =
        Diagnostic::new(category(&ROW_HYDRATION), Severity::Bug).primary(Label::new(
            span,
            format!("cannot decode column {column} for `{symbol}`"),
        ));

    diagnostic.add_message(Message::note(format!("the database reported: {source}")));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce queries whose result types the runtime can decode",
    ));

    diagnostic
}

fn value_deserialization(
    span: SpanId,
    column: usize,
    path: EntityPath,
    expected: TypeId,
) -> InterpretDiagnostic {
    let symbol = path.as_symbol();

    let mut diagnostic = Diagnostic::new(category(&VALUE_DESERIALIZATION), Severity::Bug).primary(
        Label::new(span, format!("cannot deserialize value for `{symbol}`")),
    );

    diagnostic.add_message(Message::note(format!(
        "result column {column} decoded successfully but does not match expected type {expected}"
    )));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce queries whose result types match the entity schema",
    ));

    diagnostic
}

fn parameter_encoding(
    span: SpanId,
    parameter: usize,
    error: &(dyn core::error::Error + Send + Sync),
) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(category(&PARAMETER_ENCODING), Severity::Bug).primary(Label::new(
            span,
            format!(
                "cannot encode parameter ${} for the database",
                parameter + 1
            ),
        ));

    diagnostic.add_message(Message::note(format!("the encoder reported: {error}")));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should only emit parameter types the encoder supports",
    ));

    diagnostic
}

fn query_lookup(span: SpanId, body: DefId, block: BasicBlockId) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&QUERY_LOOKUP), Severity::Bug).primary(
        Label::new(span, "no compiled query found for this data access"),
    );

    diagnostic.add_message(Message::note(format!(
        "missing query for definition {body} at block {block}"
    )));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce a compiled query for every data access",
    ));

    diagnostic
}
