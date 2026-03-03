use alloc::borrow::Cow;

use hashql_core::{span::SpanId, symbol::Symbol};
use hashql_diagnostics::{
    Diagnostic, DiagnosticIssues, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::{Critical, Severity},
};

pub(crate) type ReifyDiagnostic<K = Severity> = Diagnostic<ReifyDiagnosticCategory, SpanId, K>;
pub(crate) type ReifyDiagnosticIssues<K = Severity> =
    DiagnosticIssues<ReifyDiagnosticCategory, SpanId, K>;

// Terminal categories for user-facing errors
const UNSUPPORTED_FEATURE: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsupported-feature",
    name: "Unsupported Feature",
};

const FIELD_INDEX_ERROR: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "field-index-error",
    name: "Field Index Error",
};

// Terminal categories for ICEs - broader groupings
const VARIABLE_MAPPING: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "variable-mapping",
    name: "Variable Mapping",
};

const HIR_INVARIANT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "hir-invariant",
    name: "HIR Invariant",
};

const TYPE_INVARIANT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "type-invariant",
    name: "Type Invariant",
};

const CALL_CONVENTION: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "call-convention",
    name: "Call Convention",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ReifyDiagnosticCategory {
    UnsupportedFeature,
    FieldIndexError,

    VariableMapping,
    HirInvariant,
    TypeInvariant,
    CallConvention,
}

impl DiagnosticCategory for ReifyDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("reify")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Reify")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::UnsupportedFeature => Some(&UNSUPPORTED_FEATURE),
            Self::FieldIndexError => Some(&FIELD_INDEX_ERROR),
            Self::VariableMapping => Some(&VARIABLE_MAPPING),
            Self::HirInvariant => Some(&HIR_INVARIANT),
            Self::TypeInvariant => Some(&TYPE_INVARIANT),
            Self::CallConvention => Some(&CALL_CONVENTION),
        }
    }
}

// User-facing errors

/// Creates a diagnostic for external modules (not yet supported).
pub(crate) fn external_modules_unsupported(span: SpanId) -> ReifyDiagnostic<Critical> {
    let mut diagnostic =
        Diagnostic::new(ReifyDiagnosticCategory::UnsupportedFeature, Critical::ERROR)
            .primary(Label::new(span, "external modules are not supported"));

    diagnostic.add_message(Message::help(
        "keep all code within a single module for now",
    ));

    diagnostic.add_message(Message::note(
        "see https://linear.app/hash/issue/BE-67/hashql-implement-modules for tracking \
         multi-module support",
    ));

    diagnostic
}

/// Creates a diagnostic for field index parsing errors.
#[coverage(off)] // reason: constructing a tuple with that magnitude is infeasible in a test-case (or ever really)
pub(crate) fn field_index_too_large(span: SpanId, field_name: Symbol) -> ReifyDiagnostic {
    let mut diagnostic =
        Diagnostic::new(ReifyDiagnosticCategory::FieldIndexError, Severity::Error).primary(
            Label::new(span, format!("field index `{field_name}` is too large")),
        );

    diagnostic.add_message(Message::help(format!(
        "field indices must be between {} and {} for valid access patterns",
        usize::MIN,
        usize::MAX
    )));

    diagnostic
}

// Variable Mapping ICEs

/// ICE: Only local variables should be used in local context.
#[coverage(off)]
pub(crate) fn expected_local_variable(span: SpanId) -> ReifyDiagnostic {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::VariableMapping, Severity::Bug)
        .primary(Label::new(span, "expected local variable"));

    diagnostic.add_message(Message::help(
        "HIR(ANF) normalization should hoist qualified variables to their own bindings",
    ));

    diagnostic
}

/// ICE: Local exists verification failed.
#[coverage(off)]
pub(crate) fn local_variable_unmapped(span: SpanId) -> ReifyDiagnostic {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::VariableMapping, Severity::Bug)
        .primary(Label::new(span, "variable has no local assigned"));

    diagnostic.add_message(Message::help(
        "type checking should have ensured that all variables are assigned to locals before use",
    ));

    diagnostic
}

// HIR Invariant ICEs

/// ICE: HIR after thunking should have identifier as outer return.
#[coverage(off)]
pub(crate) fn expected_anf_variable(span: SpanId) -> ReifyDiagnostic<Critical> {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::HirInvariant, Critical::BUG)
        .primary(Label::new(span, "expected variable"));

    diagnostic.add_message(Message::help(
        "HIR(ANF) normalization should ensure the body is a variable after thunking",
    ));

    diagnostic
}

/// ICE: HIR in ANF should not have nested let bindings.
#[coverage(off)]
pub(crate) fn nested_let_bindings_in_anf(span: SpanId) -> ReifyDiagnostic {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::HirInvariant, Severity::Bug)
        .primary(Label::new(span, "nested let bindings in ANF"));

    diagnostic.add_message(Message::help(
        "HIR(ANF) normalization should flatten all nested let bindings",
    ));

    diagnostic
}

/// ICE: Assertions should not exist in HIR after ANF conversion.
#[coverage(off)]
pub(crate) fn unexpected_assertion(span: SpanId) -> ReifyDiagnostic {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::HirInvariant, Severity::Bug)
        .primary(Label::new(span, "assertion should not exist after ANF"));

    diagnostic.add_message(Message::help(
        "HIR(ANF) normalization should remove type assertions during processing",
    ));

    diagnostic
}

/// ICE: All top-level bindings must be thunks.
#[coverage(off)]
pub(crate) fn expected_anf_thunk(span: SpanId) -> ReifyDiagnostic {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::HirInvariant, Severity::Bug)
        .primary(Label::new(span, "expected thunk"));

    diagnostic.add_message(Message::help(
        "HIR(ANF) normalization should convert all top-level bindings to thunks",
    ));

    diagnostic
}

/// ICE: Local variable must be mapped to a thunk.
#[coverage(off)]
pub(crate) fn local_not_thunk(span: SpanId) -> ReifyDiagnostic<Critical> {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::HirInvariant, Critical::BUG)
        .primary(Label::new(span, "local variable not mapped to thunk"));

    diagnostic.add_message(Message::help(
        "HIR(ANF) should ensure local variables only reference top-level thunks",
    ));

    diagnostic
}

/// ICE: Indexing non-indexable type should be caught by type checker.
#[coverage(off)]
pub(crate) fn type_cannot_be_indexed(span: SpanId) -> ReifyDiagnostic {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(span, "cannot index this type"));

    diagnostic.add_message(Message::help(
        "type checking should have ensured that only indexable types can be indexed",
    ));

    diagnostic
}

/// ICE: Expected closure filter in graph operations.
#[coverage(off)]
pub(crate) fn expected_closure_filter(span: SpanId) -> ReifyDiagnostic {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::TypeInvariant, Severity::Bug)
        .primary(Label::new(span, "expected closure filter"));

    diagnostic.add_message(Message::help(
        "HIR specialization should ensure graph filters are closure literals",
    ));

    diagnostic
}

// Call Convention ICEs

/// ICE: Fat calls on constants are not supported.
#[coverage(off)]
pub(crate) fn fat_call_on_constant(span: SpanId) -> ReifyDiagnostic {
    let mut diagnostic = Diagnostic::new(ReifyDiagnosticCategory::CallConvention, Severity::Bug)
        .primary(Label::new(span, "cannot perform fat call on constant"));

    diagnostic.add_message(Message::help(
        "call convention analysis should distinguish closure places from constants",
    ));

    diagnostic
}
