use alloc::borrow::Cow;

use hashql_diagnostics::category::DiagnosticCategory;

use super::read::error::GraphReadCompilerDiagnosticCategory;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphCompilerDiagnosticCategory {
    Read(GraphReadCompilerDiagnosticCategory),
}

impl DiagnosticCategory for GraphCompilerDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("graph")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Graph")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {
            Self::Read(read) => Some(read),
        }
    }
}
