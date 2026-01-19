use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

use crate::error::{MirDiagnostic, MirDiagnosticCategory};

const UNREACHABLE_SWITCH_ARM: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unreachable-switch-arm",
    name: "Unreachable switch arm",
};

const EXCESSIVE_INLINING_DEPTH: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "excessive-inlining-depth",
    name: "Excessive inlining depth",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TransformationDiagnosticCategory {
    UnreachableSwitchArm,
    ExcessiveInliningDepth,
}

impl DiagnosticCategory for TransformationDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("transform")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Transformation")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {
            Self::UnreachableSwitchArm => Some(&UNREACHABLE_SWITCH_ARM),
            Self::ExcessiveInliningDepth => Some(&EXCESSIVE_INLINING_DEPTH),
        }
    }
}

/// Creates a diagnostic for a `SwitchInt` with a constant discriminant that doesn't match any
/// explicit case and has no `otherwise` branch.
///
/// This indicates a compiler invariant violation: the discriminant value should always match
/// either an explicit case or fall through to `otherwise`. If neither exists, the code path
/// is unreachable and likely indicates a bug in an earlier compiler pass.
pub fn unreachable_switch_arm(span: SpanId) -> MirDiagnostic {
    let mut diagnostic = Diagnostic::new(
        MirDiagnosticCategory::Transformation(
            TransformationDiagnosticCategory::UnreachableSwitchArm,
        ),
        Severity::Bug,
    )
    .primary(Label::new(
        span,
        "switch discriminant does not match any case",
    ));

    diagnostic.add_message(Message::note(
        "the discriminant value has no matching case and no fallback `otherwise` branch",
    ));

    diagnostic.add_message(Message::note(
        "this likely indicates a bug in type checking or MIR construction",
    ));

    diagnostic
}

/// Creates a diagnostic warning when aggressive inlining reaches its iteration limit.
///
/// This indicates the filter function has deeply nested call chains that couldn't be fully
/// inlined within the configured cutoff. The code will still work correctly, but some
/// call overhead may remain.
pub fn excessive_inlining_depth(span: SpanId, cutoff: usize) -> MirDiagnostic {
    let mut diagnostic = Diagnostic::new(
        MirDiagnosticCategory::Transformation(
            TransformationDiagnosticCategory::ExcessiveInliningDepth,
        ),
        Severity::Warning,
    )
    .primary(Label::new(
        span,
        "filter has deeply nested calls that could not be fully inlined",
    ));

    diagnostic.add_message(Message::note(format!(
        "aggressive inlining stopped after {cutoff} iterations"
    )));

    diagnostic.add_message(Message::help(
        "consider refactoring to reduce call chain depth",
    ));

    diagnostic
}
