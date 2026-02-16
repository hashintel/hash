use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Diagnostic, Label,
    category::{DiagnosticCategory, TerminalDiagnosticCategory},
    diagnostic::Message,
    severity::Severity,
};

use super::solve::PlacementFailure;
use crate::error::{MirDiagnostic, MirDiagnosticCategory};

const UNSATISFIABLE_PLACEMENT: TerminalDiagnosticCategory = TerminalDiagnosticCategory {
    id: "unsatisfiable-placement",
    name: "Unsatisfiable placement",
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PlacementDiagnosticCategory {
    UnsatisfiablePlacement,
}

impl DiagnosticCategory for PlacementDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("placement")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Placement")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match *self {
            Self::UnsatisfiablePlacement => Some(&UNSATISFIABLE_PLACEMENT),
        }
    }
}

/// Creates a diagnostic for when the placement solver exhausts all possible target
/// assignments without finding a consistent solution.
///
/// The interpreter is a universal execution target: every block can run on it, and
/// interpreter-to-interpreter transitions always exist. This means the trivial
/// "all interpreter" assignment is always globally satisfiable. If the solver reaches
/// exhaustion, an earlier pass must have incorrectly removed the interpreter from a
/// block's domain or omitted an interpreter transition from a cost matrix.
pub(super) fn unsatisfiable_placement(
    body_span: SpanId,
    block_span: SpanId,
    failure: &PlacementFailure,
) -> MirDiagnostic {
    let primary_message = match failure {
        PlacementFailure::Block(_) => "no feasible execution target for this block",
        PlacementFailure::Cycle(_) => "no feasible target assignment within this cycle",
    };

    let mut diagnostic = Diagnostic::new(
        MirDiagnosticCategory::Placement(PlacementDiagnosticCategory::UnsatisfiablePlacement),
        Severity::Bug,
    )
    .primary(Label::new(block_span, primary_message));

    diagnostic.add_label(Label::new(
        body_span,
        "while solving target placement for this body",
    ));

    diagnostic.add_message(Message::note(
        "the solver exhausted all candidate assignments without finding a consistent solution",
    ));

    diagnostic.add_message(Message::note(
        "the interpreter is a universal target, so a valid assignment should always exist; this \
         likely indicates a bug in arc consistency pruning or target domain construction",
    ));

    diagnostic
}
