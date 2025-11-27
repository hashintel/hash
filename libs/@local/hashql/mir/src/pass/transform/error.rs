use alloc::borrow::Cow;

use hashql_diagnostics::DiagnosticCategory;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TransformationDiagnosticCategory {}

impl DiagnosticCategory for TransformationDiagnosticCategory {
    fn id(&self) -> Cow<'_, str> {
        Cow::Borrowed("transform")
    }

    fn name(&self) -> Cow<'_, str> {
        Cow::Borrowed("Transformation")
    }

    fn subcategory(&self) -> Option<&dyn DiagnosticCategory> {
        None
    }
}
