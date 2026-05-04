//! Diagnostic categories and constructors for the PostgreSQL compilation backend.
//!
//! All diagnostics in this module represent compiler-internal invariant violations: MIR
//! constructs that should have been rejected by the execution placement pass before reaching
//! SQL lowering.

use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

use crate::error::{EvalDiagnostic, EvalDiagnosticCategory};

const UNSUPPORTED_VERTEX_TYPE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsupported-vertex-type",
    name: "Unsupported Vertex Type",
};

const ENTITY_PATH_RESOLUTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "entity-path-resolution",
    name: "Cannot Resolve Entity Property Path",
};

const INVALID_ENV_ACCESS: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-env-access",
    name: "Invalid Captured Variable Access",
};

const INVALID_ENV_PROJECTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-env-projection",
    name: "Invalid Captured Variable Projection",
};

const CLOSURE_APPLICATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "closure-application",
    name: "Closure Calls Not Supported in SQL",
};

const CLOSURE_AGGREGATE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "closure-aggregate",
    name: "Closure Construction Not Supported in SQL",
};

const FUNCTION_POINTER_CONSTANT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "function-pointer-constant",
    name: "Function Pointers Not Supported in SQL",
};

const PROJECTED_ASSIGNMENT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "projected-assignment",
    name: "Projected Assignment in SSA",
};

const GRAPH_READ_TERMINATOR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "graph-read-terminator",
    name: "Nested Graph Reads Not Supported in SQL",
};

const MISSING_ISLAND_GRAPH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "missing-island-graph",
    name: "Missing Island Graph for Body",
};

/// Diagnostic categories for bugs and unsupported constructs encountered during SQL compilation.
///
/// These categories cover internal compiler invariants (e.g. "placement should have rejected
/// this") and mismatches between MIR expectations and SQL lowering capabilities (e.g. entity-path
/// resolution failures).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PostgresDiagnosticCategory {
    /// A non-entity vertex type reached the SQL backend.
    UnsupportedVertexType,
    /// An [`EntityPath`] could not be mapped to a PostgreSQL column or expression.
    ///
    /// [`EntityPath`]: hashql_mir::pass::execution::traversal::EntityPath
    EntityPathResolution,
    /// The captured environment was referenced as a value instead of being field-projected.
    InvalidEnvAccess,
    /// A non-field projection was applied to the captured environment.
    InvalidEnvProjection,
    /// A closure call reached the SQL backend.
    ClosureApplication,
    /// A closure value construction reached the SQL backend.
    ClosureAggregate,
    /// A function pointer constant reached the SQL backend.
    FunctionPointerConstant,
    /// MIR contained an assignment to a projected place (invalid in SSA form).
    ProjectedAssignment,
    /// A nested graph read terminator reached the SQL backend.
    GraphReadTerminator,
    /// Island analysis did not produce an island graph for a filter body.
    MissingIslandGraph,
}

impl DiagnosticCategory for PostgresDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("postgres")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Postgres")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::UnsupportedVertexType => Some(&UNSUPPORTED_VERTEX_TYPE),
            Self::EntityPathResolution => Some(&ENTITY_PATH_RESOLUTION),
            Self::InvalidEnvAccess => Some(&INVALID_ENV_ACCESS),
            Self::InvalidEnvProjection => Some(&INVALID_ENV_PROJECTION),
            Self::ClosureApplication => Some(&CLOSURE_APPLICATION),
            Self::ClosureAggregate => Some(&CLOSURE_AGGREGATE),
            Self::FunctionPointerConstant => Some(&FUNCTION_POINTER_CONSTANT),
            Self::ProjectedAssignment => Some(&PROJECTED_ASSIGNMENT),
            Self::GraphReadTerminator => Some(&GRAPH_READ_TERMINATOR),
            Self::MissingIslandGraph => Some(&MISSING_ISLAND_GRAPH),
        }
    }
}

const fn category(category: PostgresDiagnosticCategory) -> EvalDiagnosticCategory {
    EvalDiagnosticCategory::Postgres(category)
}

#[coverage(off)]
pub(super) fn unsupported_vertex_type(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::UnsupportedVertexType),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "query operates on a vertex type that cannot be compiled to SQL",
    ));

    diagnostic.add_message(Message::note(
        "the HASH type system supports entities, entity types, property types, and data types, \
         but only entity queries can currently be compiled to SQL; the type system should not \
         have enabled SQL compilation for this vertex type",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn entity_path_resolution(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::EntityPathResolution),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "cannot map this property access to a SQL column",
    ));

    diagnostic.add_message(Message::note(
        "indicates a mismatch between the entity type declaration and the SQL column mapping; \
         this can happen when they get out of sync",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn invalid_env_access(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::InvalidEnvAccess),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "direct access to the captured environment without field destructuring",
    ));

    diagnostic.add_message(Message::note(
        "the environment is captured implicitly as the first argument and immediately \
         destructured; a direct reference is never generated by the compiler",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn invalid_env_projection(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::InvalidEnvProjection),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "non-field projection on the captured environment",
    ));

    diagnostic.add_message(Message::note(
        "the environment is captured implicitly as the first argument and only accessed via field \
         projections; other projection kinds are never generated by the compiler",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn closure_application(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::ClosureApplication),
        Severity::Bug,
    )
    .primary(Label::new(span, "closure call cannot be compiled to SQL"));

    diagnostic.add_message(Message::note(
        "the statement placement pass should have rejected this from the Postgres backend",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn closure_aggregate(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::ClosureAggregate),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "closure construction cannot be compiled to SQL",
    ));

    diagnostic.add_message(Message::note(
        "the statement placement pass should have rejected this from the Postgres backend",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn function_pointer_constant(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::FunctionPointerConstant),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "function pointer cannot be compiled to SQL",
    ));

    diagnostic.add_message(Message::note(
        "the statement placement pass should have rejected this from the Postgres backend",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn projected_assignment(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::ProjectedAssignment),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "assignment to a projected place in SSA form",
    ));

    diagnostic.add_message(Message::note(
        "MIR is always in SSA form; projected assignments should never exist",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn graph_read_terminator(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::GraphReadTerminator),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "nested graph read cannot appear in SQL-compiled code",
    ));

    diagnostic.add_message(Message::note(
        "the statement placement pass should have rejected this from the Postgres backend",
    ));

    diagnostic
}

#[coverage(off)]
pub(super) fn missing_island_graph(span: SpanId) -> EvalDiagnostic {
    let mut diagnostic = Diagnostic::new(
        category(PostgresDiagnosticCategory::MissingIslandGraph),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "no island graph found for this filter body",
    ));

    diagnostic.add_message(Message::note(
        "the island analysis pass should have produced an island graph for every graph read \
         filter body; its absence indicates a compiler bug",
    ));

    diagnostic
}
