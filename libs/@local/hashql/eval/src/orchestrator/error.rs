//! Errors that occur while fulfilling [`GraphRead`] suspensions.
//!
//! These are internal runtime errors — failures in the compiled query execution,
//! row decoding, or parameter encoding. The user wrote HashQL, not SQL; if the
//! bridge fails, it indicates a bug in the compiler or runtime.
//!
//! [`GraphRead`]: hashql_mir::body::terminator::GraphRead

use alloc::string::String;

use hashql_core::{
    pretty::{Formatter, RenderOptions},
    span::SpanId,
    symbol::Symbol,
    r#type::{TypeFormatter, TypeFormatterOptions, TypeId, environment::Environment},
};
use hashql_diagnostics::{
    Diagnostic, Label, category::TerminalDiagnosticCategory, diagnostic::Message,
    severity::Severity,
};
use hashql_mir::{
    body::{basic_block::BasicBlockId, local::Local},
    def::DefId,
    interpret::error::{
        InterpretDiagnostic, InterpretDiagnosticCategory, SuspensionDiagnosticCategory,
    },
};

use super::{Indexed, codec::JsonValueKind};
use crate::postgres::ColumnDescriptor;

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

const CONTINUATION_DESERIALIZATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "continuation-deserialization",
    name: "Continuation Deserialization",
};

const INVALID_CONTINUATION_BLOCK_ID: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-continuation-block-id",
    name: "Invalid Continuation Block ID",
};

const INVALID_CONTINUATION_LOCAL: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-continuation-local",
    name: "Invalid Continuation Local",
};

const QUERY_LOOKUP: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "query-lookup",
    name: "Query Lookup",
};

const INCOMPLETE_CONTINUATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "incomplete-continuation",
    name: "Incomplete Continuation",
};

const MISSING_EXECUTION_RESIDUAL: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "missing-execution-residual",
    name: "Missing Execution Residual",
};

const INVALID_FILTER_RETURN: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-filter-return",
    name: "Invalid Filter Return",
};

const VALUE_SERIALIZATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "value-serialization",
    name: "Value Serialization",
};

const fn category(terminal: &'static TerminalDiagnosticCategory) -> InterpretDiagnosticCategory {
    InterpretDiagnosticCategory::Suspension(SuspensionDiagnosticCategory(terminal))
}

/// Errors that occur while decoding a JSON value into a typed [`Value`].
///
/// Each variant carries the leaf [`TypeId`] at the point of failure — the
/// specific type in the tree where decoding broke. The caller provides the
/// top-level type context (e.g. via a column descriptor), so the diagnostic
/// can show both *what* the column was supposed to produce and *where* in the
/// type tree it went wrong.
///
/// [`Value`]: hashql_mir::interpret::value::Value
#[derive(Debug, Copy, Clone)]
pub enum DecodeError<'heap> {
    /// The JSON value kind does not match the expected type.
    ///
    /// For example, the decoder expected a JSON object (for a struct) but
    /// received a number.
    TypeMismatch {
        /// The leaf type that was being decoded when the mismatch occurred.
        expected: TypeId,
        /// The JSON value kind that was actually received.
        received: JsonValueKind,
    },

    /// A required field is missing from a JSON object when decoding a struct.
    MissingField {
        /// The struct type being decoded.
        expected: TypeId,
        /// The name of the missing field.
        field: Symbol<'heap>,
    },

    /// The JSON object has a different number of keys than the struct expects.
    StructLengthMismatch {
        /// The struct type being decoded.
        expected: TypeId,
        /// The number of fields the struct type requires.
        expected_length: usize,
        /// The number of keys in the JSON object.
        received_length: usize,
    },

    /// The JSON array length does not match the expected tuple arity.
    TupleLengthMismatch {
        /// The tuple type being decoded.
        expected: TypeId,
        /// The number of elements the tuple type requires.
        expected_length: usize,
        /// The number of elements in the JSON array.
        received_length: usize,
    },

    /// None of a union type's variants could decode the value.
    NoMatchingVariant {
        /// The union type being decoded.
        expected: TypeId,
        /// The JSON value kind that no variant accepted.
        received: JsonValueKind,
    },

    /// A JSON number could not be represented as `f64`.
    ///
    /// This only occurs when `serde_json`'s `arbitrary_precision` feature is
    /// active and the number overflows to infinity or NaN. The variant
    /// optionally carries the type being decoded — absent when the failure
    /// occurs inside the untyped fallback path.
    NumberOutOfRange {
        /// The numeric type that was being decoded, if known.
        expected: Option<TypeId>,
    },

    /// An internal invariant was violated during value construction.
    ///
    /// This indicates a bug in the decoder itself — for example, constructing
    /// a struct with mismatched field/value counts, or an empty tuple. The
    /// variant optionally carries the type — absent when the failure occurs
    /// inside the untyped fallback path.
    MalformedConstruction {
        /// The type being constructed when the invariant was violated, if known.
        expected: Option<TypeId>,
    },

    /// An intersection type reached the decoder.
    ///
    /// Intersection types cannot be safely represented as JSON, so the
    /// placement pass should have rejected any query that would require
    /// deserializing one from a postgres result.
    IntersectionType {
        /// The intersection type that was encountered.
        type_id: TypeId,
    },

    /// A closure type reached the decoder.
    ///
    /// Closures are opaque runtime values that cannot be serialized or
    /// transported through postgres. The placement pass should have
    /// rejected any query that would require deserializing a closure.
    ClosureType {
        /// The closure type that was encountered.
        type_id: TypeId,
    },

    /// A never type (`!`) reached the decoder.
    ///
    /// The never type is uninhabited: no value of type `!` can exist, so
    /// attempting to deserialize one is always a bug.
    NeverType {
        /// The never type that was encountered.
        type_id: TypeId,
    },
}

/// Errors from the bridge while fulfilling a [`GraphRead`] suspension.
///
/// All variants represent internal failures — the user wrote HashQL, not SQL.
/// If the bridge fails, the compiler or runtime produced something invalid.
///
/// [`GraphRead`]: hashql_mir::body::terminator::GraphRead
#[derive(Debug)]
pub enum BridgeError<'heap> {
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
        /// The column descriptor identifying what this column represents.
        column: Indexed<ColumnDescriptor>,
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
        /// The column descriptor identifying what this column represents.
        column: Indexed<ColumnDescriptor>,
        /// The specific decode failure.
        source: DecodeError<'heap>,
    },

    /// A continuation local could not be deserialized back into its expected type.
    ///
    /// Continuation locals are values that were serialized into JSON by the SQL
    /// lowering pass and returned alongside query results so the interpreter can
    /// resume execution. If one of these cannot be decoded, the lowering pass
    /// produced a continuation whose shape the runtime cannot reconstruct.
    ContinuationDeserialization {
        /// The definition containing the continuation.
        body: DefId,
        /// The local variable that failed to deserialize.
        local: Local,
        /// The specific decode failure.
        source: DecodeError<'heap>,
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

    /// A continuation block ID returned by PostgreSQL is out of range.
    ///
    /// The SQL lowering pass encodes the target basic block as an integer in the
    /// query result. A negative value cannot represent a valid [`BasicBlockId`]
    /// and indicates a bug in the lowering pass.
    InvalidContinuationBlockId {
        /// The definition containing the continuation.
        body: DefId,
        /// The invalid block ID value returned by PostgreSQL.
        block_id: i32,
    },

    /// A continuation local index returned by PostgreSQL is out of range.
    ///
    /// The SQL lowering pass encodes local variable indices as integers in the
    /// query result. A negative value cannot represent a valid [`Local`] and
    /// indicates a bug in the lowering pass.
    ///
    /// [`Local`]: hashql_mir::body::local::Local
    InvalidContinuationLocal {
        /// The definition containing the continuation.
        body: DefId,
        /// The invalid local value returned by PostgreSQL.
        local: i32,
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

    /// A continuation state was not fully populated before finishing.
    ///
    /// When a row contains a non-null continuation target, the locals and values
    /// columns must also be present. A missing or null field indicates the SQL
    /// lowering pass produced a continuation with an incomplete column set.
    IncompleteContinuation {
        /// The definition containing the continuation.
        body: DefId,
        /// The name of the field that was missing or null.
        field: &'static str,
    },

    /// No execution residual was found for a definition that requires one.
    ///
    /// The execution analysis pass should produce island mappings for every
    /// definition that appears in a filter chain. A missing residual indicates
    /// the execution pipeline did not analyze this definition.
    MissingExecutionResidual {
        /// The definition that has no execution residual.
        body: DefId,
    },

    /// A filter body returned a non-boolean value.
    ///
    /// Filter bodies must evaluate to a boolean. If the interpreter produces
    /// a value that is not representable as a boolean, the HIR type checking
    /// or lowering pass has a bug.
    InvalidFilterReturn {
        /// The filter definition that returned a non-boolean.
        body: DefId,
    },

    /// A runtime value could not be serialized to JSON.
    ///
    /// Serialization failures indicate a bug in the encoder or an unsupported
    /// value shape (e.g. pointer values).
    ValueSerialization {
        /// The serialization error from `serde_json`.
        source: serde_json::Error,
    },
}

impl<'heap> BridgeError<'heap> {
    pub fn into_diagnostic(self, span: SpanId, env: &Environment<'heap>) -> InterpretDiagnostic {
        match self {
            Self::QueryExecution { sql, source } => query_execution(span, &sql, &source),
            Self::RowHydration { column, source } => row_hydration(span, column, &source),
            Self::ValueDeserialization { column, source } => {
                value_deserialization(span, column, &source, env)
            }
            Self::ContinuationDeserialization {
                body,
                local,
                source,
            } => continuation_deserialization(span, body, local, &source, env),
            Self::InvalidContinuationBlockId { body, block_id } => {
                invalid_continuation_block_id(span, body, block_id)
            }
            Self::InvalidContinuationLocal { body, local } => {
                invalid_continuation_local(span, body, local)
            }
            Self::ParameterEncoding { parameter, source } => {
                parameter_encoding(span, parameter, &*source)
            }
            Self::QueryLookup { body, block } => query_lookup(span, body, block),
            Self::IncompleteContinuation { body, field } => {
                incomplete_continuation(span, body, field)
            }
            Self::MissingExecutionResidual { body } => missing_execution_residual(span, body),
            Self::InvalidFilterReturn { body } => invalid_filter_return(span, body),
            Self::ValueSerialization { source } => value_serialization(span, &source),
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
    Indexed {
        index,
        value: column,
    }: Indexed<ColumnDescriptor>,
    source: &tokio_postgres::Error,
) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(category(&ROW_HYDRATION), Severity::Bug).primary(Label::new(
            span,
            format!("cannot decode result column {index} ({column})"),
        ));

    diagnostic.add_message(Message::note(format!("the database reported: {source}")));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce queries whose result types the runtime can decode",
    ));

    diagnostic
}

/// Adds notes describing a [`DecodeError`] to a diagnostic.
fn add_decode_error_notes(
    diagnostic: &mut InterpretDiagnostic,
    source: &DecodeError<'_>,
    env: &Environment<'_>,
) {
    let fmt = Formatter::new(env.heap);
    let mut type_fmt = TypeFormatter::new(&fmt, env, TypeFormatterOptions::default());
    let render = RenderOptions::default();

    match source {
        DecodeError::TypeMismatch { expected, received } => {
            diagnostic.add_message(Message::note(format!(
                "expected `{}` but received JSON {}",
                type_fmt.render(*expected, render),
                received.as_str(),
            )));
        }
        DecodeError::MissingField { expected, field } => {
            diagnostic.add_message(Message::note(format!(
                "field `{field}` is missing from the JSON object when decoding `{}`",
                type_fmt.render(*expected, render),
            )));
        }
        DecodeError::StructLengthMismatch {
            expected,
            expected_length,
            received_length,
        } => {
            diagnostic.add_message(Message::note(format!(
                "expected {expected_length} fields for `{}` but received {received_length}",
                type_fmt.render(*expected, render),
            )));
        }
        DecodeError::TupleLengthMismatch {
            expected,
            expected_length,
            received_length,
        } => {
            diagnostic.add_message(Message::note(format!(
                "expected {expected_length} elements for `{}` but received {received_length}",
                type_fmt.render(*expected, render),
            )));
        }
        DecodeError::NoMatchingVariant { expected, received } => {
            diagnostic.add_message(Message::note(format!(
                "no variant of `{}` could decode JSON {}",
                type_fmt.render(*expected, render),
                received.as_str(),
            )));
        }
        DecodeError::NumberOutOfRange { expected } => {
            if let Some(expected) = expected {
                diagnostic.add_message(Message::note(format!(
                    "JSON number is out of range for `{}`",
                    type_fmt.render(*expected, render),
                )));
            } else {
                diagnostic.add_message(Message::note(
                    "JSON number is out of range and cannot be represented as a floating-point \
                     value",
                ));
            }
        }
        DecodeError::MalformedConstruction { expected } => {
            if let Some(expected) = expected {
                diagnostic.add_message(Message::note(format!(
                    "internal invariant violated while constructing `{}`",
                    type_fmt.render(*expected, render),
                )));
            } else {
                diagnostic.add_message(Message::note(
                    "internal invariant violated during value construction",
                ));
            }
        }
        DecodeError::IntersectionType { type_id } => {
            diagnostic.add_message(Message::note(format!(
                "intersection type `{}` cannot be safely represented as JSON",
                type_fmt.render(*type_id, render),
            )));
            diagnostic.add_message(Message::help(
                "the placement pass should reject queries that require deserializing intersection \
                 types from postgres",
            ));
        }
        DecodeError::ClosureType { type_id } => {
            diagnostic.add_message(Message::note(format!(
                "closure type `{}` cannot be transported through postgres",
                type_fmt.render(*type_id, render),
            )));
            diagnostic.add_message(Message::help(
                "the placement pass should reject queries that require deserializing closures \
                 from postgres",
            ));
        }
        DecodeError::NeverType { type_id } => {
            diagnostic.add_message(Message::note(format!(
                "the never type `{}` is uninhabited and cannot have a value",
                type_fmt.render(*type_id, render),
            )));
            diagnostic.add_message(Message::help(
                "the MIR pipeline should prevent never types from reaching evaluation",
            ));
        }
    }
}

fn value_deserialization(
    span: SpanId,
    Indexed {
        index,
        value: column,
    }: Indexed<ColumnDescriptor>,
    source: &DecodeError<'_>,
    env: &Environment<'_>,
) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(category(&VALUE_DESERIALIZATION), Severity::Bug).primary(Label::new(
            span,
            format!("cannot deserialize result column {index} ({column})"),
        ));

    add_decode_error_notes(&mut diagnostic, source, env);

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce queries whose result types match the entity schema",
    ));

    diagnostic
}

fn continuation_deserialization(
    span: SpanId,
    body: DefId,
    local: Local,
    source: &DecodeError<'_>,
    env: &Environment<'_>,
) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&CONTINUATION_DESERIALIZATION), Severity::Bug)
        .primary(Label::new(
            span,
            format!("cannot deserialize continuation local {local} in definition {body}"),
        ));

    add_decode_error_notes(&mut diagnostic, source, env);

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce continuations whose types the runtime can \
         reconstruct",
    ));

    diagnostic
}

fn invalid_continuation_block_id(span: SpanId, body: DefId, block_id: i32) -> InterpretDiagnostic {
    let mut diagnostic =
        Diagnostic::new(category(&INVALID_CONTINUATION_BLOCK_ID), Severity::Bug).primary(
            Label::new(span, "continuation returned an invalid block ID"),
        );

    diagnostic.add_message(Message::note(format!(
        "definition {body} returned block ID {block_id}, which cannot represent a valid block"
    )));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce non-negative block IDs for continuations",
    ));

    diagnostic
}

fn invalid_continuation_local(span: SpanId, body: DefId, local: i32) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&INVALID_CONTINUATION_LOCAL), Severity::Bug)
        .primary(Label::new(span, "continuation returned an invalid local"));

    diagnostic.add_message(Message::note(format!(
        "definition {body} returned local {local}, which cannot represent a valid local"
    )));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce non-negative local indices for continuations",
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

fn incomplete_continuation(span: SpanId, body: DefId, field: &str) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&INCOMPLETE_CONTINUATION), Severity::Bug)
        .primary(Label::new(
            span,
            "continuation state is missing required columns",
        ));

    diagnostic.add_message(Message::note(format!(
        "continuation for definition {body} has a non-null target but `{field}` was not populated"
    )));

    diagnostic.add_message(Message::help(
        "the SQL lowering pass should produce all continuation columns together",
    ));

    diagnostic
}

fn missing_execution_residual(span: SpanId, body: DefId) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&MISSING_EXECUTION_RESIDUAL), Severity::Bug)
        .primary(Label::new(
            span,
            "no execution residual found for this definition",
        ));

    diagnostic.add_message(Message::note(format!(
        "definition {body} appears in a filter chain but has no island mapping"
    )));

    diagnostic.add_message(Message::help(
        "the execution analysis pass should produce island mappings for all filter definitions",
    ));

    diagnostic
}

fn invalid_filter_return(span: SpanId, body: DefId) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&INVALID_FILTER_RETURN), Severity::Bug)
        .primary(Label::new(span, "filter body returned a non-boolean value"));

    diagnostic.add_message(Message::note(format!(
        "filter definition {body} must evaluate to a boolean"
    )));

    diagnostic.add_message(Message::help(
        "the HIR type checking pass should ensure filter bodies return a boolean",
    ));

    diagnostic
}

fn value_serialization(span: SpanId, error: &serde_json::Error) -> InterpretDiagnostic {
    let mut diagnostic = Diagnostic::new(category(&VALUE_SERIALIZATION), Severity::Bug)
        .primary(Label::new(span, "cannot serialize runtime value to JSON"));

    diagnostic.add_message(Message::note(format!("serialization failed: {error}")));

    diagnostic.add_message(Message::help(
        "all values passed to the database should be serializable",
    ));

    diagnostic
}
