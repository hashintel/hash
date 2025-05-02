use std::borrow::Cow;

use hashql_core::span::SpanId;
use hashql_diagnostics::{Diagnostic, category::DiagnosticCategory};

pub(crate) type ImportResolverDiagnostic = Diagnostic<ImportResolverDiagnosticCategory, SpanId>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ImportResolverDiagnosticCategory {}

impl DiagnosticCategory for ImportResolverDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("import-resolver")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Import Resolver")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        match self {}
    }
}
