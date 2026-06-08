use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity, category::DiagnosticCategory};

use crate::{
    orchestrator::OrchestratorDiagnosticCategory, postgres::error::PostgresDiagnosticCategory,
};

pub type EvalDiagnostic<K = Severity> = Diagnostic<EvalDiagnosticCategory, SpanId, K>;
pub type EvalDiagnosticIssues<K = Severity> = DiagnosticIssues<EvalDiagnosticCategory, SpanId, K>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EvalDiagnosticCategory {
    Postgres(PostgresDiagnosticCategory),
    Orchestrator(OrchestratorDiagnosticCategory),
}

impl DiagnosticCategory for EvalDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("eval")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Eval")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Postgres(postgres) => Some(postgres),
            Self::Orchestrator(orchestrator) => Some(orchestrator),
        }
    }
}
