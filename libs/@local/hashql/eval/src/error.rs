use alloc::borrow::Cow;

use hashql_diagnostics::category::DiagnosticCategory;

use crate::graph::error::GraphCompilerDiagnosticCategory;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EvalDiagnosticCategory {
    #[cfg(feature = "graph")]
    Graph(GraphCompilerDiagnosticCategory),
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
        }
    }
}
