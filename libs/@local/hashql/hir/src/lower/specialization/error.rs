use alloc::borrow::Cow;

use hashql_core::{
    pretty::{PrettyOptions, PrettyPrint as _},
    span::SpanId,
    r#type::environment::Environment,
};
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

use crate::node::Node;

pub type SpecializationDiagnostic = Diagnostic<SpecializationDiagnosticCategory, SpanId>;

const UNSUPPORTED_INTRINSIC: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsupported-intrinsic",
    name: "Unsupported intrinsic operation",
};

const UNKNOWN_INTRINSIC: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unknown-intrinsic",
    name: "Unknown intrinsic operation",
};

const INVALID_GRAPH_CHAIN: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "invalid-graph-chain",
    name: "Invalid graph operation chain",
};

const NON_INTRINSIC_GRAPH_OPERATION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "non-intrinsic-graph-operation",
    name: "Non-intrinsic function in graph operation",
};

const NON_GRAPH_INTRINSIC: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "non-graph-intrinsic",
    name: "Non-graph intrinsic in graph operation",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpecializationDiagnosticCategory {
    UnsupportedIntrinsic,
    UnknownIntrinsic,
    InvalidGraphChain,
    NonIntrinsicGraphOperation,
    NonGraphIntrinsic,
}

impl DiagnosticCategory for SpecializationDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("specialization")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Specialization")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {
            Self::UnsupportedIntrinsic => Some(&UNSUPPORTED_INTRINSIC),
            Self::UnknownIntrinsic => Some(&UNKNOWN_INTRINSIC),
            Self::InvalidGraphChain => Some(&INVALID_GRAPH_CHAIN),
            Self::NonIntrinsicGraphOperation => Some(&NON_INTRINSIC_GRAPH_OPERATION),
            Self::NonGraphIntrinsic => Some(&NON_GRAPH_INTRINSIC),
        }
    }
}

/// Creates a diagnostic for an unsupported intrinsic operation.
///
/// This is used for intrinsic operations that are valid but not yet implemented
/// in the specialization phase.
pub(crate) fn unsupported_intrinsic(
    span: SpanId,
    intrinsic_name: &str,
    issue_url: &str,
) -> SpecializationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecializationDiagnosticCategory::UnsupportedIntrinsic,
        Severity::Error,
    )
    .primary(Label::new(
        span,
        format!("intrinsic `{intrinsic_name}` not supported yet"),
    ));

    diagnostic.add_message(Message::help(format!(
        "The intrinsic operation `{intrinsic_name}` is a valid HashQL operation, but support for \
         this operation is still in development during the specialization phase. For now, you'll \
         need to use alternative approaches or wait for this feature to be implemented. Check \
         issue {issue_url} for implementation status and updates."
    )));

    diagnostic.add_message(Message::note(format!(
        "Intrinsic operations are low-level operations that are built into the HashQL language. \
         The specialization phase converts high-level function calls into these optimized \
         operations, but not all intrinsics are currently supported. We're actively working on \
         supporting {intrinsic_name} and other intrinsic operations to make HashQL more \
         expressive and powerful."
    )));

    diagnostic
}

/// Creates a diagnostic for an unknown intrinsic operation.
///
/// This indicates a compiler bug where an intrinsic that should be mapped is missing.
#[coverage(off)] // compiler bugs should never be hit
pub(crate) fn unknown_intrinsic(span: SpanId, intrinsic_name: &str) -> SpecializationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecializationDiagnosticCategory::UnknownIntrinsic,
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        format!("unknown intrinsic `{intrinsic_name}`"),
    ));

    diagnostic.add_message(Message::help(format!(
        "The intrinsic `{intrinsic_name}` is missing from the specialization phase mapping. Add \
         this intrinsic to the match statement in the `fold_intrinsic` method to resolve this \
         compiler bug."
    )));

    diagnostic.add_message(Message::note(
        "This error indicates that a new intrinsic was added to the standard library but the \
         specialization phase wasn't updated to handle it. The compiler should be kept in sync \
         with stdlib changes.",
    ));

    diagnostic
}

/// Creates a diagnostic for an invalid graph operation chain.
///
/// This occurs when following a graph chain but encountering a specialized operation
/// that is not a graph operation (e.g., a math operation that was already processed).
pub(crate) fn invalid_graph_chain<'heap>(
    env: &Environment<'heap>,
    span: SpanId,
    node: Node<'heap>,
) -> SpecializationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecializationDiagnosticCategory::InvalidGraphChain,
        Severity::Error,
    )
    .primary(Label::new(span, "Expected a graph operation here"));

    diagnostic.add_message(Message::help(format!(
        "{} is not a graph operation. Graph chains can only contain operations that work with \
         graph data, such as filtering, entity selection, or other graph transformations. \
         Operations like math, comparisons, or other non-graph functions cannot be part of a \
         graph chain.",
        node.pretty_print(env, PrettyOptions::default().with_max_width(60))
    )));

    diagnostic.add_message(Message::note(
        "Graph operation chains work by passing graph objects through a sequence of \
         graph-specific operations. Each operation in the chain must accept a graph and return a \
         modified graph. Non-graph operations like math, comparisons, or boolean logic should be \
         used within closures or separate expressions, not as part of the main graph chain.",
    ));

    diagnostic
}

/// Creates a diagnostic for using a non-intrinsic function in graph operations.
///
/// This occurs when a graph operation chain contains a function call that is not
/// mapped to an intrinsic operation.
pub(crate) fn non_intrinsic_graph_operation<'heap>(
    env: &Environment<'heap>,
    span: SpanId,
    function: Node<'heap>,
) -> SpecializationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecializationDiagnosticCategory::NonIntrinsicGraphOperation,
        Severity::Error,
    )
    .primary(Label::new(span, "This is not a graph intrinsic operation"));

    diagnostic.add_message(Message::help(format!(
        "{} is not a valid graph operation. Graph operation chains can only contain intrinsic \
         functions that are part of the HashQL graph API. Higher-order functions (HOFs) and \
         user-defined functions are not supported yet. To track support for user-defined \
         functions see https://linear.app/hash/issue/H-4776/hashql-allow-user-defined-functions-in-graph-pipelines",
         function.pretty_print(env, PrettyOptions::default().with_max_width(60)))));

    diagnostic.add_message(Message::note(
        "Graph intrinsics are built-in operations like `::graph::head::entities`, \
         `::graph::body::filter`, and `::graph::tail::collect` that can be optimized during \
         compilation. Only these predefined operations can be used to build graph query chains.",
    ));

    diagnostic
}

/// Creates a diagnostic for an unknown graph intrinsic operation.
///
/// This indicates a compiler bug where a graph intrinsic that should be mapped is missing.
#[coverage(off)] // compiler bugs should never be hit
pub(crate) fn non_graph_intrinsic(span: SpanId, intrinsic_name: &str) -> SpecializationDiagnostic {
    let mut diagnostic = Diagnostic::new(
        SpecializationDiagnosticCategory::NonGraphIntrinsic,
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        format!("unknown graph intrinsic `{intrinsic_name}`"),
    ));

    diagnostic.add_message(Message::help(format!(
        "The graph intrinsic `{intrinsic_name}` is missing from the graph specialization phase \
         mapping. Add this intrinsic to the match statement in the `fold_graph_read` method to \
         resolve this compiler bug."
    )));

    diagnostic.add_message(Message::note(
        "This error indicates that a new graph intrinsic was added to the standard library but \
         the graph specialization phase wasn't updated to handle it. The compiler should be kept \
         in sync with stdlib changes.",
    ));

    diagnostic
}
