use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    help::Help,
    label::Label,
    note::Note,
    severity::Severity,
};

pub type SpecializationDiagnostic = Diagnostic<SpecializationDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpecializationDiagnosticCategory {
    UnsupportedIntrinsic,
    UnknownIntrinsic,
}

const UNSUPPORTED_INTRINSIC: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsupported-intrinsic",
    name: "Unsupported intrinsic operation",
};

const UNKNOWN_INTRINSIC: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unknown-intrinsic",
    name: "Unknown intrinsic operation",
};

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
    );

    diagnostic.labels.push(
        Label::new(
            span,
            format!("intrinsic `{intrinsic_name}` not supported yet"),
        )
        .with_order(0),
    );

    diagnostic.add_help(Help::new(format!(
        "The intrinsic operation `{intrinsic_name}` is a valid HashQL operation, but support for \
         this operation is still in development during the specialization phase. For now, you'll \
         need to use alternative approaches or wait for this feature to be implemented. Check \
         issue {issue_url} for implementation status and updates."
    )));

    diagnostic.add_note(Note::new(format!(
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
    );

    diagnostic
        .labels
        .push(Label::new(span, format!("unknown intrinsic `{intrinsic_name}`")).with_order(0));

    diagnostic.add_help(Help::new(format!(
        "The intrinsic `{intrinsic_name}` is missing from the specialization phase mapping. Add \
         this intrinsic to the match statement in the `fold_intrinsic` method to resolve this \
         compiler bug."
    )));

    diagnostic.add_note(Note::new(
        "This error indicates that a new intrinsic was added to the standard library but the \
         specialization phase wasn't updated to handle it. The compiler should be kept in sync \
         with stdlib changes.",
    ));

    diagnostic
}
