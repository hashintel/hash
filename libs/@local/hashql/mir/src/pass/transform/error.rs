use alloc::borrow::Cow;

use hashql_diagnostics::DiagnosticCategory;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[expect(clippy::empty_enums, reason = "will be filled in a follow up PR")]
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
