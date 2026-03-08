use alloc::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, DiagnosticIssues, Severity, category::DiagnosticCategory};

#[cfg(feature = "graph")]
use crate::graph::error::GraphCompilerDiagnosticCategory;
use crate::postgres::error::PostgresDiagnosticCategory;

pub type EvalDiagnostic<K = Severity> = Diagnostic<EvalDiagnosticCategory, SpanId, K>;
pub type EvalDiagnosticIssues<K = Severity> = DiagnosticIssues<EvalDiagnosticCategory, SpanId, K>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EvalDiagnosticCategory {
    #[cfg(feature = "graph")]
    Graph(GraphCompilerDiagnosticCategory),
    Postgres(PostgresDiagnosticCategory),
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
            #[cfg(feature = "graph")]
            Self::Graph(graph) => Some(graph),
            Self::Postgres(postgres) => Some(postgres),
        }
    }
}
